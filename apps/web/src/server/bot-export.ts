import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { isAbsolute, join, normalize } from "node:path";
import { and, eq } from "drizzle-orm";
import { plannedR, tradeR, type AnnotatedTrade } from "@luxalgo/journal-core";
import {
  accounts,
  attachments,
  db,
  executions,
  missedTrades,
  playbooks,
  settings,
  tradeRuleChecks,
} from "@/db";
import { parsePsych, sessionLabel, sessionOf, TRADE_PSYCH_GROUPS } from "@/lib/psychology";
import { setupLabel, SETUP_TEXT_FIELDS } from "@/lib/setup";
import { tradePoints } from "@/lib/points";
import { RequestError } from "./api";
import { queryTrades } from "./trades-query";
import { savedEstimates } from "./market-data/estimates";

/**
 * Exportación para el bot: tres CSV (trades, ejecuciones, reglas), un LEEME y una
 * carpeta por trade con sus capturas. Siempre el histórico completo; cada trade
 * se identifica por un id fijo que no cambia nunca.
 */

const PATH_KEY = "botExportPath";
const LAST_KEY = "botExportLast";
const MANIFEST = ".exportacion-journal.json";

const readSetting = (key: string) =>
  db.select({ value: settings.value }).from(settings).where(eq(settings.key, key)).get()?.value ??
  null;
const writeSetting = (key: string, value: string) =>
  db
    .insert(settings)
    .values({ key, value })
    .onConflictDoUpdate({ target: settings.key, set: { value } })
    .run();

export const getExportPath = () => readSetting(PATH_KEY);
export const getLastExport = () => {
  const raw = readSetting(LAST_KEY);
  try {
    return raw ? (JSON.parse(raw) as { at: string; trades: number; skipped: number }) : null;
  } catch {
    return null;
  }
};
const SELECTION_KEY = "botExportSelection";

/**
 * Qué se exporta: cuentas marcadas y, de los setups no tomados, los de los playbooks
 * marcados ("" = sin playbook). Por defecto no se exporta ninguna cuenta.
 */
export interface ExportSelection {
  accounts: string[];
  missedPlaybooks: string[];
}
export const getSelection = (): ExportSelection => {
  try {
    const value = JSON.parse(readSetting(SELECTION_KEY) ?? "{}") as Partial<ExportSelection>;
    return {
      accounts: Array.isArray(value.accounts) ? value.accounts.map(String) : [],
      missedPlaybooks: Array.isArray(value.missedPlaybooks)
        ? value.missedPlaybooks.map(String)
        : [],
    };
  } catch {
    return { accounts: [], missedPlaybooks: [] };
  }
};
export function setSelection(input: unknown) {
  const raw = (input ?? {}) as Record<string, unknown>;
  const clean = (value: unknown) =>
    Array.isArray(value)
      ? [...new Set(value.filter((item): item is string => typeof item === "string"))].slice(0, 500)
      : [];
  writeSetting(
    SELECTION_KEY,
    JSON.stringify({ accounts: clean(raw.accounts), missedPlaybooks: clean(raw.missedPlaybooks) }),
  );
}

export function setExportPath(path: string) {
  const clean = path.trim().replace(/^"(.*)"$/, "$1");
  if (!clean) {
    db.delete(settings).where(eq(settings.key, PATH_KEY)).run();
    return;
  }
  if (!isAbsolute(clean)) throw new RequestError("Escribe la ruta completa de la carpeta.");
  writeSetting(PATH_KEY, normalize(clean));
}

// ---- Formatos ----

const ny = new Intl.DateTimeFormat("en-US", {
  timeZone: "America/New_York",
  hourCycle: "h23",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
});
/** "2026-10-21T09:36:00-04:00" */
export function isoNewYork(iso: string | null | undefined): string {
  if (!iso) return "";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  const p = Object.fromEntries(ny.formatToParts(date).map((part) => [part.type, part.value]));
  const wall = Date.UTC(+p.year!, +p.month! - 1, +p.day!, +p.hour! % 24, +p.minute!, +p.second!);
  const offset = Math.round((wall - Math.floor(date.getTime() / 1000) * 1000) / 60_000);
  const sign = offset < 0 ? "-" : "+";
  const abs = Math.abs(offset);
  const hh = String(Math.floor(abs / 60)).padStart(2, "0");
  const mm = String(abs % 60).padStart(2, "0");
  return `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}:${p.second}${sign}${hh}:${mm}`;
}
const isoUtc = (iso: string | null | undefined) =>
  iso && !Number.isNaN(Date.parse(iso)) ? new Date(iso).toISOString().replace(/\.000Z$/, "Z") : "";

const num = (value: number | null | undefined, decimals = 6): string =>
  value === null || value === undefined || !Number.isFinite(value)
    ? ""
    : String(Math.round(value * 10 ** decimals) / 10 ** decimals);

const cell = (value: unknown): string => {
  const text = value === null || value === undefined ? "" : String(value);
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
};
const csv = (header: string[], rows: unknown[][]) =>
  [header, ...rows].map((row) => row.map(cell).join(",")).join("\r\n") + "\r\n";

/** HTML/markdown del editor → texto plano. */
export function plainText(html: string | null | undefined): string {
  if (!html) return "";
  return html
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|li|h\d)>/gi, "\n")
    .replace(/<li[^>]*>/gi, "- ")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

const list = (json: string | null | undefined): string => {
  try {
    const value = JSON.parse(json ?? "[]") as unknown;
    return Array.isArray(value) ? value.map(String).join("|") : "";
  } catch {
    return "";
  }
};

/** Contratos expresados en micros (1 mini = 10 micros; plata 5). */
const MICRO_FACTOR: Record<string, number> = {
  NQ: 10,
  ES: 10,
  YM: 10,
  RTY: 10,
  GC: 10,
  CL: 10,
  SI: 5,
  MNQ: 1,
  MES: 1,
  MYM: 1,
  M2K: 1,
  MGC: 1,
  MCL: 1,
  SIL: 1,
};
const microRoot = (symbol: string) => {
  const clean = symbol.toUpperCase().replace(/[^A-Z0-9]/g, "");
  const contract = /^([A-Z0-9]+?)[FGHJKMNQUVXZ]\d{1,4}$/.exec(clean);
  return contract && MICRO_FACTOR[contract[1]!] ? contract[1]! : clean;
};
export const microsEquivalent = (symbol: string, quantity: number): number | null => {
  const factor = MICRO_FACTOR[microRoot(symbol)];
  return factor ? quantity * factor : null;
};

const psychText = (values: Record<string, unknown>, groupId: string) => {
  const group = TRADE_PSYCH_GROUPS.find((item) => item.id === groupId);
  const value = values[groupId];
  if (!group || value === undefined) return "";
  return (Array.isArray(value) ? value : [value])
    .map((item) => group.options.find((option) => option.value === item)?.label ?? String(item))
    .map((label) => label.replace(/^[^\p{L}\p{N}]+/u, "").trim())
    .join("|");
};

const safeFileName = (name: string) =>
  name
    .normalize("NFC")
    .replace(/[\\/:*?"<>|\u0000-\u001f]+/g, "-")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 80) || "imagen";

const EXTENSION: Record<string, string> = {
  "image/png": ".png",
  "image/jpeg": ".jpg",
  "image/webp": ".webp",
  "image/gif": ".gif",
  "application/pdf": ".pdf",
};

// ---- Exportación ----

export const TRADE_COLUMNS = [
  "id",
  "tomado",
  "motivo_no_tomado",
  "cuenta",
  "origen",
  "simbolo",
  "direccion",
  "hora_entrada_utc",
  "hora_entrada_ny",
  "hora_salida_utc",
  "hora_salida_ny",
  "sesion",
  "duracion_min",
  "cantidad",
  "micros_equivalentes",
  "precio_entrada",
  "precio_salida",
  "puntos",
  "pnl_bruto",
  "pnl_neto",
  "comisiones",
  "stop",
  "objetivo",
  "r_planificado",
  "r_realizado",
  "mae_usd",
  "mfe_usd",
  "playbook",
  "etiquetas",
  "errores",
  "valoracion",
  "nota_previa",
  "nota_review",
  "tf_setup",
  "tf_entrada",
  "tipo_entrada",
  "poi",
  "liquidez_tomada",
  "zona_htf",
  "id_aviso_bot",
  "psico_estado_antes",
  "psico_entrada",
  "psico_gestion",
  "psico_emociones_afectaron",
  "psico_nota",
  "notas",
  "imagenes",
] as const;

interface ExportResult {
  path: string;
  trades: number;
  notTaken: number;
  executions: number;
  images: number;
}

export function exportForBot(target = getExportPath()): ExportResult {
  if (!target) throw new RequestError("Elige primero la carpeta de la exportación.");
  mkdirSync(target, { recursive: true });

  const selection = getSelection();
  const chosen = new Set(selection.accounts);
  const all = queryTrades({});
  const rows = all.rows.filter((row) => chosen.has(row.accountId));
  const trades = all.trades.filter((trade) => chosen.has(trade.accountId));
  const byKey = new Map(trades.map((trade) => [trade.key, trade]));
  const accountNames = new Map(
    db
      .select({ id: accounts.id, name: accounts.name })
      .from(accounts)
      .all()
      .map((row) => [row.id, row.name]),
  );
  const playbookNames = new Map(
    db
      .select({ id: playbooks.id, name: playbooks.name })
      .from(playbooks)
      .all()
      .map((row) => [row.id, row.name]),
  );
  const estimates = savedEstimates(trades);
  const allFills = db.select().from(executions).all();
  const fillsById = new Map(allFills.map((fill) => [fill.id, fill]));
  const rules = db.select().from(tradeRuleChecks).all();

  const written = new Set<string>();
  const write = (relative: string, data: string | Buffer) => {
    const full = join(target, relative);
    mkdirSync(join(full, ".."), { recursive: true });
    const temp = `${full}.tmp`;
    writeFileSync(temp, data);
    renameSync(temp, full);
    written.add(relative);
  };
  const exportImages = (ownerType: string, ownerId: string, folder: string): string[] => {
    const files = db
      .select({ name: attachments.name, mime: attachments.mime, data: attachments.data })
      .from(attachments)
      .where(and(eq(attachments.ownerType, ownerType), eq(attachments.ownerId, ownerId)))
      .all();
    const used = new Set<string>();
    return files.map((file) => {
      const extension = EXTENSION[file.mime] ?? "";
      let base = safeFileName(file.name);
      if (extension && base.toLowerCase().endsWith(extension))
        base = base.slice(0, -extension.length);
      let name = `${base}${extension}`;
      for (let n = 2; used.has(name.toLowerCase()); n++) name = `${base} (${n})${extension}`;
      used.add(name.toLowerCase());
      const relative = `${folder}/${name}`;
      write(relative, file.data as Buffer);
      return relative;
    });
  };

  const tradeRows: unknown[][] = [];
  const executionRows: unknown[][] = [];
  const ruleRows: unknown[][] = [];
  let images = 0;

  for (const row of rows) {
    const trade = byKey.get(row.key) as AnnotatedTrade;
    const id = row.uid ?? row.key.replace(/[^A-Za-z0-9]/g, "").slice(-12);
    const setup = parsePsych(row.setupJson);
    const psych = parsePsych(row.psychJson) as Record<string, unknown>;
    const estimate = estimates.get(row.key)?.estimate;
    const paths = exportImages("trade", row.key, id);
    images += paths.length;
    const ids = JSON.parse(row.executionIdsJson) as string[];
    const fills = ids.map((fillId) => fillsById.get(fillId)).filter(Boolean);
    const origin = fills.every((fill) => fill!.source === "manual") ? "manual" : "importado";
    tradeRows.push(
      TRADE_COLUMNS.map((column) => {
        switch (column) {
          case "id":
            return id;
          case "tomado":
            return 1;
          case "motivo_no_tomado":
            return "";
          case "cuenta":
            return accountNames.get(row.accountId) ?? "";
          case "origen":
            return origin;
          case "simbolo":
            return row.symbol;
          case "direccion":
            return row.direction;
          case "hora_entrada_utc":
            return isoUtc(row.openedAt);
          case "hora_entrada_ny":
            return isoNewYork(row.openedAt);
          case "hora_salida_utc":
            return isoUtc(row.closedAt);
          case "hora_salida_ny":
            return isoNewYork(row.closedAt);
          case "sesion":
            return sessionLabel(sessionOf(row.openedAt));
          case "duracion_min":
            return row.durationMs === null ? "" : num(row.durationMs / 60_000, 2);
          case "cantidad":
            return num(row.quantity);
          case "micros_equivalentes":
            return num(microsEquivalent(row.symbol, row.quantity));
          case "precio_entrada":
            return num(row.avgEntry);
          case "precio_salida":
            return num(row.avgExit);
          case "puntos":
            return num(tradePoints(row.direction, row.avgEntry, row.avgExit), 4);
          case "pnl_bruto":
            return num(row.grossPnl, 2);
          case "pnl_neto":
            return num(row.netPnl, 2);
          case "comisiones":
            return num(row.fees, 2);
          case "stop":
            return num(row.stopLoss);
          case "objetivo":
            return num(row.profitTarget);
          case "r_planificado":
            return num(trade ? plannedR(trade) : null, 3);
          case "r_realizado":
            return num(trade ? tradeR(trade) : null, 3);
          case "mae_usd":
            return num(estimate?.mae, 2);
          case "mfe_usd":
            return num(estimate?.mfe, 2);
          case "playbook":
            return row.playbookId ? (playbookNames.get(row.playbookId) ?? "") : "";
          case "etiquetas":
            return list(row.tagsJson);
          case "errores":
            return list(row.mistakesJson);
          case "valoracion":
            return row.rating ?? "";
          case "nota_previa":
          case "nota_review":
          case "tf_setup":
          case "tf_entrada":
          case "tipo_entrada":
          case "poi":
          case "liquidez_tomada":
          case "zona_htf":
            return setupLabel(setup, column);
          case "id_aviso_bot":
            return typeof setup.id_aviso_bot === "string" ? setup.id_aviso_bot : "";
          case "psico_estado_antes":
            return psychText(psych, "before");
          case "psico_entrada":
            return psychText(psych, "entry");
          case "psico_gestion":
            return psychText(psych, "management");
          case "psico_emociones_afectaron":
            return psychText(psych, "affected");
          case "psico_nota":
            return typeof psych.note === "string" ? psych.note : "";
          case "notas":
            return plainText(row.notes);
          case "imagenes":
            return paths.join("|");
        }
      }),
    );
    for (const fill of fills.sort((a, b) => a!.executedAt.localeCompare(b!.executedAt)))
      executionRows.push([
        id,
        isoUtc(fill!.executedAt),
        isoNewYork(fill!.executedAt),
        fill!.side === "buy" ? "compra" : "venta",
        num(fill!.quantity),
        num(fill!.price),
        num(fill!.fee, 2),
      ]);
    for (const rule of rules.filter((item) => item.tradeKey === row.key))
      ruleRows.push([id, rule.rule, rule.followed ? 1 : 0]);
  }

  // Setups vistos y no tomados (página «Trades perdidos»).
  const missedChosen = new Set(selection.missedPlaybooks);
  const missed = db
    .select()
    .from(missedTrades)
    .all()
    .filter((item) => !item.archivedAt && missedChosen.has(item.playbookId ?? ""));
  for (const item of missed) {
    const id = `nt_${item.id}`;
    const setup = parsePsych(item.setupJson);
    const paths = exportImages("missed", item.id, id);
    images += paths.length;
    const values: Partial<Record<(typeof TRADE_COLUMNS)[number], unknown>> = {
      id,
      tomado: 0,
      motivo_no_tomado: plainText(item.notes),
      simbolo: item.symbol,
      direccion: item.direction,
      hora_entrada_utc: isoUtc(item.observedAt),
      hora_entrada_ny: isoNewYork(item.observedAt),
      sesion: sessionLabel(sessionOf(item.observedAt)),
      precio_entrada: num(item.entry),
      stop: num(item.stop),
      objetivo: num(item.target),
      playbook: item.playbookId ? (playbookNames.get(item.playbookId) ?? "") : "",
      id_aviso_bot: typeof setup.id_aviso_bot === "string" ? setup.id_aviso_bot : "",
      imagenes: paths.join("|"),
    };
    for (const group of [
      "nota_previa",
      "nota_review",
      "tf_setup",
      "tf_entrada",
      "tipo_entrada",
      "poi",
      "liquidez_tomada",
      "zona_htf",
    ] as const)
      values[group] = setupLabel(setup, group);
    tradeRows.push(TRADE_COLUMNS.map((column) => values[column] ?? ""));
  }

  write("trades.csv", csv([...TRADE_COLUMNS], tradeRows));
  write(
    "ejecuciones.csv",
    csv(
      ["trade_id", "hora_utc", "hora_ny", "lado", "cantidad", "precio", "comision"],
      executionRows,
    ),
  );
  write("reglas.csv", csv(["trade_id", "regla", "cumplida"], ruleRows));
  write("LEEME.md", readme(SETUP_TEXT_FIELDS.map((field) => field.key)));

  // Borra lo que exportamos la vez anterior y ya no existe (trades borrados, imágenes quitadas).
  const manifestPath = join(target, MANIFEST);
  if (existsSync(manifestPath)) {
    try {
      const previous = JSON.parse(readFileSync(manifestPath, "utf8")) as string[];
      for (const relative of previous)
        if (!written.has(relative) && !relative.includes(".."))
          rmSync(join(target, relative), { force: true });
      const folders = new Set(previous.map((relative) => relative.split("/")[0]!));
      for (const folder of folders)
        if (
          folder &&
          !folder.includes(".") &&
          ![...written].some((w) => w.startsWith(`${folder}/`))
        )
          rmSync(join(target, folder), { recursive: true, force: true });
    } catch {
      // manifiesto dañado: se rehace
    }
  }
  writeFileSync(manifestPath, JSON.stringify([...written]));

  const result = {
    path: target,
    trades: rows.length,
    notTaken: missed.length,
    executions: executionRows.length,
    images,
  };
  writeSetting(
    LAST_KEY,
    JSON.stringify({ at: new Date().toISOString(), trades: rows.length, skipped: missed.length }),
  );
  return result;
}

const readme = (textFields: string[]) => `# Exportación del trade journal para el bot

Se sobrescribe entera en cada exportación. Cada trade tiene un \`id\` fijo que no cambia nunca
(aunque se corrija la hora o se mueva de cuenta). Los setups vistos y no tomados llevan
\`tomado=0\` y un id que empieza por \`nt_\`.

CSV en UTF-8, coma como separador, punto decimal y con cabecera. Las listas van separadas por \`|\`.
Horas en ISO 8601: \`*_utc\` en UTC y \`*_ny\` en hora de Nueva York con su desfase (-04:00/-05:00).

## trades.csv (un trade por fila)
- id, tomado (1/0), motivo_no_tomado (solo tomado=0)
- cuenta (nombre en el journal), origen (manual / importado)
- simbolo (raíz: NQ, MNQ, ES…), direccion (long/short)
- hora_entrada_utc / hora_entrada_ny, hora_salida_utc / hora_salida_ny
- sesion: Asia 20-00, Londres 02-05, NY AM 08-12, NY PM 13-16 (hora NY) o Fuera de sesión
- duracion_min, cantidad, micros_equivalentes (1 mini = 10 micros)
- precio_entrada / precio_salida (medios), puntos (por contrato, positivo = a favor)
- pnl_bruto, pnl_neto, comisiones (USD)
- stop, objetivo, r_planificado, r_realizado
- mae_usd / mfe_usd: lo máximo en contra / a favor en USD (solo si se cargaron las velas en el journal)
- playbook, etiquetas, errores, valoracion (1-5)
- nota_previa (A+…F, antes de entrar) y nota_review (después)
- tf_setup (30M/1H/4H), tf_entrada (1M/3M/5M/15M), tipo_entrada (C2 al cierre / Dentro de la C2 / C3)
- poi (FVG/iFVG/CISD/Breaker/Unicorn/Apertura), liquidez_tomada (lista), zona_htf
- ${textFields.join(", ")}: texto libre
- psico_estado_antes, psico_entrada (Esperé pacientemente/FOMO/Precipitado/Revenge/Dudé…),
  psico_gestion (lista), psico_emociones_afectaron (Sí/No), psico_nota
- notas: la review del trade en texto plano
- imagenes: rutas relativas de las capturas (carpeta del trade = su id), separadas por |

## ejecuciones.csv
trade_id, hora_utc, hora_ny, lado (compra/venta), cantidad, precio, comision

## reglas.csv
trade_id, regla, cumplida (1/0): reglas del playbook marcadas en la review
`;
