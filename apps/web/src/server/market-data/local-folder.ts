import { createHash } from "node:crypto";
import {
  createReadStream,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  statSync,
} from "node:fs";
import { open, writeFile } from "node:fs/promises";
import { basename, join } from "node:path";
import { dataDir } from "@/db";
import {
  RESOLUTIONS,
  type MarketBar,
  type MarketHistory,
  type Resolution,
} from "@/lib/market-data";
import { MarketDataError, type MarketDataProvider } from "./provider";
import { result } from "./http";

/**
 * Velas leídas directamente de una carpeta del PC (formato BacktestMarket):
 *   carpeta/NQ/nq-1m_bk.csv  →  "12/12/2008;17:00;open;high;low;close;volume"
 * La zona horaria del archivo (Chicago, Nueva York…) se detecta por la pausa diaria del
 * CME. Los archivos no se copian ni se modifican:
 * se crea un índice pequeño (dónde empieza cada día) y se lee solo el trozo necesario.
 */

const TIMEFRAME_FILES: Record<Resolution, string> = {
  "1m": "1m",
  "5m": "5m",
  "15m": "15m",
  "1h": "1h",
  "1d": "1d",
};
const FILE_PATTERN = /^([a-z0-9]+)-(\d+(?:m|h|d|w|mo))(?:_[^.]*)?\.csv$/i;

// ---- Símbolos: MNQZ5 → NQ, MES → ES, MYM → YM… ----

const MICROS: Record<string, string> = {
  MNQ: "NQ",
  MES: "ES",
  MYM: "YM",
  M2K: "RTY",
  MGC: "GC",
  SIL: "SI",
  MCL: "CL",
};

/** Símbolos a probar, del más literal al más genérico. */
export function symbolCandidates(input: string): string[] {
  const clean = input.toUpperCase().replace(/[^A-Z0-9]/g, "");
  const out = [clean];
  const contract = /^([A-Z0-9]+?)[FGHJKMNQUVXZ]\d{1,2}$/.exec(clean);
  const root = contract ? contract[1]! : clean;
  out.push(root);
  if (MICROS[root]) out.push(MICROS[root]);
  return [...new Set(out.filter(Boolean))];
}

// ---- Archivos de la carpeta ----

interface DataFile {
  symbol: string;
  timeframe: string;
  path: string;
}

export function scanFolder(root: string): DataFile[] {
  if (!root || !existsSync(root) || !statSync(root).isDirectory())
    throw new MarketDataError(
      "No encuentro esa carpeta. Revisa la ruta en Ajustes → Datos de mercado.",
    );
  const files: DataFile[] = [];
  const visit = (dir: string, depth: number) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, entry.name);
      if (entry.isDirectory() && depth < 2) visit(full, depth + 1);
      const match = entry.isFile() ? FILE_PATTERN.exec(entry.name) : null;
      if (match)
        files.push({
          symbol: match[1]!.toUpperCase(),
          timeframe: match[2]!.toLowerCase(),
          path: full,
        });
    }
  };
  visit(root, 0);
  return files;
}

const findFile = (root: string, symbol: string, resolution: Resolution) => {
  const files = scanFolder(root);
  const wanted = TIMEFRAME_FILES[resolution];
  for (const candidate of symbolCandidates(symbol)) {
    const file = files.find((item) => item.symbol === candidate && item.timeframe === wanted);
    if (file) {
      const reference = ["1m", "5m", "15m"]
        .map((tf) => files.find((item) => item.symbol === candidate && item.timeframe === tf))
        .find(Boolean);
      return { file, root: candidate, reference: reference?.path };
    }
  }
  const symbols = [...new Set(files.map((item) => item.symbol))].sort().join(", ");
  throw new MarketDataError(
    symbols
      ? `No hay archivo de ${resolution} para ${symbol} en tu carpeta. Tengo: ${symbols}.`
      : "No hay archivos de velas en esa carpeta (se esperan nombres como nq-1m_bk.csv).",
  );
};

// ---- Hora del archivo → UTC ----

const formatters = new Map<string, Intl.DateTimeFormat>();
const offsetCache = new Map<string, number>();
/** Minutos que la zona va por detrás de UTC en ese instante (p. ej. 300 o 360 en Chicago). */
const zoneOffset = (timeZone: string, utc: number): number => {
  const hourKey = Math.floor(utc / 3_600_000);
  const cacheKey = `${timeZone}|${hourKey}`;
  const cached = offsetCache.get(cacheKey);
  if (cached !== undefined) return cached;
  let formatter = formatters.get(timeZone);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat("en-US", {
      timeZone,
      hourCycle: "h23",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
    formatters.set(timeZone, formatter);
  }
  const parts = Object.fromEntries(
    formatter.formatToParts(new Date(hourKey * 3_600_000)).map((p) => [p.type, p.value]),
  );
  const asUtc = Date.UTC(
    Number(parts.year),
    Number(parts.month) - 1,
    Number(parts.day),
    Number(parts.hour) % 24,
    Number(parts.minute),
  );
  const offset = Math.round((hourKey * 3_600_000 - asUtc) / 60_000);
  if (offsetCache.size > 50_000) offsetCache.clear();
  offsetCache.set(cacheKey, offset);
  return offset;
};

export function zoneToUtc(
  timeZone: string,
  y: number,
  m: number,
  d: number,
  hh: number,
  mm: number,
): number {
  const wall = Date.UTC(y, m - 1, d, hh, mm);
  let utc = wall + zoneOffset(timeZone, wall + 6 * 3_600_000) * 60_000;
  utc = wall + zoneOffset(timeZone, utc) * 60_000;
  return utc;
}

export const chicagoToUtc = (y: number, m: number, d: number, hh: number, mm: number) =>
  zoneToUtc("America/Chicago", y, m, d, hh, mm);

/**
 * La pausa diaria del CME es a las 17:00 de Nueva York (16:00 en Chicago).
 * La hora con menos velas del archivo dice en qué zona horaria está escrito.
 */
const ZONES: Record<number, { timeZone: string; label: string }> = {
  17: { timeZone: "America/New_York", label: "Nueva York" },
  16: { timeZone: "America/Chicago", label: "Chicago" },
  15: { timeZone: "America/Denver", label: "Denver" },
  14: { timeZone: "America/Los_Angeles", label: "Los Ángeles" },
  21: { timeZone: "UTC", label: "UTC" },
  22: { timeZone: "UTC", label: "UTC" },
};
export const breakHour = (hours: number[]): number => {
  let best = 16;
  for (let hour = 0; hour < 24; hour++) if (hours[hour]! < hours[best]!) best = hour;
  return best;
};
export const zoneForBreak = (hour: number) => ZONES[hour] ?? ZONES[16]!;

// ---- Índice: dónde empieza cada día dentro del archivo ----

interface FileIndex {
  size: number;
  mtimeMs: number;
  /** [fecha "YYYY-MM-DD" tal como viene en el archivo, posición en bytes] */
  days: [string, number][];
  /** El primer número de la fecha es el día (12/12/2008) o el mes. */
  dayFirst: boolean;
  /** Velas por hora del día (0–23) según la hora escrita en el archivo. */
  hours: number[];
  /** Velas cuya hora es exacta (HH:00), por hora del día. */
  onTheHour: number[];
  /** No hay velas en domingo: las de la tarde vienen fechadas con el día de la sesión siguiente. */
  sessionDated: boolean;
  version: number;
}
const INDEX_VERSION = 2;

const memoryIndex = new Map<string, Promise<FileIndex>>();
const indexDir = () => {
  const dir = join(dataDir(), "indices-mercado");
  mkdirSync(dir, { recursive: true });
  return dir;
};

const splitDate = (text: string) => text.split(/[/.-]/).map(Number);

async function buildIndex(path: string, size: number, mtimeMs: number): Promise<FileIndex> {
  const rawDays: [string, number][] = [];
  let firstMax = 0,
    secondMax = 0,
    rows = 0;
  const hours = Array<number>(24).fill(0);
  const onTheHour = Array<number>(24).fill(0);
  let previousDate = "";
  let offset = 0;
  let carry: Buffer = Buffer.alloc(0);
  const onLine = (line: string, lineStart: number) => {
    const sep = line.search(/[;,]/);
    if (sep <= 0) return;
    const date = line.slice(0, sep);
    if (!/^\d{1,4}[/.-]\d{1,2}[/.-]\d{1,4}$/.test(date)) return; // cabecera u otra línea
    rows++;
    const time = line.slice(sep + 1, sep + 6);
    const hour = Number(time.slice(0, 2));
    if (hour >= 0 && hour < 24 && time[2] === ":") {
      hours[hour]!++;
      if (time.endsWith(":00")) onTheHour[hour]!++;
    }
    if (date !== previousDate) {
      previousDate = date;
      rawDays.push([date, lineStart]);
      const [a, b] = splitDate(date);
      firstMax = Math.max(firstMax, a!);
      secondMax = Math.max(secondMax, b!);
    }
  };
  await new Promise<void>((resolve, reject) => {
    const stream = createReadStream(path, { highWaterMark: 1 << 20 });
    stream.on("data", (chunk: string | Buffer) => {
      const buffer = carry.length ? Buffer.concat([carry, chunk as Buffer]) : (chunk as Buffer);
      const base = offset - carry.length;
      let start = 0;
      for (let i = buffer.indexOf(10); i !== -1; i = buffer.indexOf(10, start)) {
        onLine(buffer.toString("latin1", start, i).trimEnd(), base + start);
        start = i + 1;
      }
      carry = buffer.subarray(start);
      offset += (chunk as Buffer).length;
    });
    stream.on("end", () => {
      if (carry.length) onLine(carry.toString("latin1").trimEnd(), offset - carry.length);
      resolve();
    });
    stream.on("error", reject);
  });
  if (!rows) throw new MarketDataError(`${basename(path)} no tiene velas reconocibles.`);
  // Si el segundo número pasa de 12 es el día: el formato es mes/día.
  const dayFirst = !(secondMax > 12 && firstMax <= 12);
  const toIso = (date: string) => {
    const [a, b, c] = splitDate(date);
    const [y, m, d] = a! > 31 ? [a!, b!, c!] : dayFirst ? [c!, b!, a!] : [c!, a!, b!];
    return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
  };
  const days = rawDays.map(([date, at]) => [toIso(date), at] as [string, number]);
  const sundays = days.filter(([iso]) => new Date(`${iso}T12:00:00Z`).getUTCDay() === 0).length;
  return {
    size,
    mtimeMs,
    days,
    dayFirst,
    hours,
    onTheHour,
    // Los diarios no tienen domingo y es normal; en intradía, sin domingos ⇒ fecha de sesión.
    sessionDated: !/-1d|-1w|-1mo/i.test(basename(path)) && sundays === 0 && days.length > 20,
    version: INDEX_VERSION,
  };
}

async function fileIndex(path: string): Promise<FileIndex> {
  const { size, mtimeMs } = statSync(path);
  const key = `${path}|${size}|${mtimeMs}`;
  const cached = memoryIndex.get(key);
  if (cached) return cached;
  const promise = (async () => {
    const stored = join(indexDir(), `${createHash("sha1").update(path).digest("hex")}.json`);
    if (existsSync(stored)) {
      try {
        const index = JSON.parse(readFileSync(stored, "utf8")) as FileIndex;
        if (index.size === size && index.mtimeMs === mtimeMs && index.version === INDEX_VERSION)
          return index;
      } catch {
        // índice dañado: se rehace
      }
    }
    const index = await buildIndex(path, size, mtimeMs);
    await writeFile(stored, JSON.stringify(index));
    return index;
  })();
  memoryIndex.set(key, promise);
  promise.catch(() => memoryIndex.delete(key));
  return promise;
}

// ---- Lectura de un rango ----

const isoDay = (ms: number) => new Date(ms).toISOString().slice(0, 10);

interface ReadOptions {
  timeZone: string;
  /** La hora escrita es la apertura de la vela (si no, su cierre). */
  openTime: boolean;
  /** Hora (en el archivo) a la que abre la sesión tras la pausa diaria. */
  openHour: number;
}

function parseRows(
  text: string,
  index: FileIndex,
  resolution: Resolution,
  options: ReadOptions,
): MarketBar[] {
  const step = RESOLUTIONS[resolution];
  const bars: MarketBar[] = [];
  for (const line of text.split("\n")) {
    const cells = line.trim().split(/[;,]/);
    if (cells.length < 6) continue;
    const date = splitDate(cells[0]!);
    if (date.length !== 3 || date.some((n) => !Number.isFinite(n))) continue;
    const [a, b, c] = date as [number, number, number];
    const [y, m, d] = a > 31 ? [a, b, c] : index.dayFirst ? [c, b, a] : [c, a, b];
    const [hh = 0, mm = 0] = (cells[1] ?? "").split(":").map(Number);
    const [open, high, low, close, volume] = cells.slice(2, 7).map(Number);
    if (![open, high, low, close].every((n) => Number.isFinite(n))) continue;
    let time: number;
    if (resolution === "1d") time = Date.UTC(y, m - 1, d);
    else {
      time = zoneToUtc(options.timeZone, y, m, d, hh, mm);
      if (index.sessionDated && hh >= options.openHour) time -= 86_400_000;
      if (!options.openTime) time -= step;
    }
    bars.push({
      time,
      open: open!,
      high: high!,
      low: low!,
      close: close!,
      volume: Number.isFinite(volume) ? volume! : 0,
    });
  }
  return bars.sort((x, y) => x.time - y.time);
}

/** Zona horaria del archivo y si la hora es la de apertura de la vela. */
async function readOptions(index: FileIndex, reference?: string) {
  // Los archivos de minutos dicen mejor dónde está la pausa diaria que los de horas.
  const ref = reference ? await fileIndex(reference) : index;
  const pause = breakHour(ref.hours);
  const zone = zoneForBreak(pause);
  const openHour = (pause + 1) % 24;
  return {
    zone,
    options: { timeZone: zone.timeZone, openTime: index.onTheHour[openHour]! > 0, openHour },
  };
}

export async function readBars(
  path: string,
  resolution: Resolution,
  from: number,
  to: number,
  reference?: string,
) {
  const index = await fileIndex(path);
  const { zone, options } = await readOptions(index, reference);
  if (!index.days.length) return { bars: [] as MarketBar[], index, zone };
  const pad = resolution === "1d" ? 7 : 2;
  const startDay = isoDay(from - pad * 86_400_000);
  const endDay = isoDay(to + pad * 86_400_000);
  const first = index.days.findIndex(([day]) => day >= startDay);
  if (first === -1) return { bars: [], index, zone };
  const afterLast = index.days.findIndex(([day]) => day > endDay);
  const start = index.days[first]![1];
  const end = afterLast === -1 ? index.size : index.days[afterLast]![1];
  if (end <= start) return { bars: [], index, zone };
  const handle = await open(path, "r");
  try {
    const buffer = Buffer.alloc(end - start);
    await handle.read(buffer, 0, buffer.length, start);
    return {
      bars: parseRows(buffer.toString("latin1"), index, resolution, options),
      index,
      zone,
    };
  } finally {
    await handle.close();
  }
}

// ---- Ajuste de contrato continuo ----

interface Fill {
  price: number;
  executedAt: string;
}

/**
 * Los datos de contrato continuo ajustado tienen los precios antiguos
 * multiplicados por un factor. Se busca el factor que deja cada ejecución dentro
 * de su vela (si 1 ya vale, no se toca nada) y se aplica a todas las velas.
 */
export function alignToFills(history: MarketHistory, fills: Fill[]): MarketHistory {
  const step = RESOLUTIONS[history.resolution];
  let lo = 0,
    hi = Infinity,
    matched = 0;
  const ratios: number[] = [];
  for (const fill of fills) {
    const time = Date.parse(fill.executedAt);
    const bar = history.bars.find((item) => item.time <= time && time < item.time + step);
    if (!bar || !(fill.price > 0) || !(bar.low > 0)) continue;
    matched++;
    lo = Math.max(lo, fill.price / bar.high);
    hi = Math.min(hi, fill.price / bar.low);
    ratios.push(fill.price / ((bar.high + bar.low) / 2));
  }
  if (!matched) return history;
  let factor: number;
  let exact = true;
  if (lo <= hi) factor = lo <= 1 && 1 <= hi ? 1 : (lo + hi) / 2;
  else {
    exact = false;
    ratios.sort((a, b) => a - b);
    factor = ratios[Math.floor(ratios.length / 2)]!;
  }
  if (factor === 1) return history;
  const scale = (n: number) => Math.round(n * factor * 100) / 100;
  return {
    ...history,
    bars: history.bars.map((bar) => ({
      ...bar,
      open: scale(bar.open),
      high: scale(bar.high),
      low: scale(bar.low),
      close: scale(bar.close),
    })),
    warnings: [
      `Tus datos son de contrato continuo ajustado: las velas se han multiplicado por ${factor.toFixed(4)} para cuadrar con tus precios reales${exact ? "" : " (aproximado, puede haber unos puntos de diferencia)"}.`,
      ...history.warnings,
    ],
  };
}

// ---- Proveedor ----

const folderFrom = (key: string): string => {
  try {
    const parsed = JSON.parse(key) as { path?: unknown };
    if (typeof parsed.path === "string") return parsed.path.trim().replace(/^"(.*)"$/, "$1");
  } catch {
    // clave antigua o vacía
  }
  throw new MarketDataError("Guarda la ruta de tu carpeta de datos en Ajustes.");
};

const fmtDay = (iso: string) => {
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
};

export const localFolder: MarketDataProvider = {
  id: "local-folder",
  name: "Mi carpeta de datos",
  environmentKey: "JOURNAL_MARKET_FOLDER",
  async test(key) {
    const files = scanFolder(folderFrom(key));
    if (!files.length)
      throw new MarketDataError(
        "La carpeta existe pero no tiene archivos de velas (se esperan nombres como nq-1m_bk.csv).",
      );
  },
  async history(request, key) {
    const { file, root, reference } = findFile(folderFrom(key), request.symbol, request.resolution);
    const step = RESOLUTIONS[request.resolution];
    // Algo de contexto antes y después del trade para el gráfico y el replay.
    const from = request.from - 30 * step;
    const to = Math.min(request.to + 15 * step, Date.now());
    const { bars, index, zone } = await readBars(
      file.path,
      request.resolution,
      from,
      to,
      reference,
    );
    const firstDay = index.days[0]?.[0];
    const lastDay = index.days.at(-1)?.[0];
    const covered = bars.some((bar) => bar.time <= request.from && request.from < bar.time + step);
    if (!covered && lastDay && isoDay(request.from) > lastDay)
      throw new MarketDataError(
        `Tus datos de ${root} (${basename(file.path)}) llegan hasta el ${fmtDay(lastDay)}. Descarga la actualización y sustituye el archivo en la carpeta.`,
      );
    if (!covered && firstDay && isoDay(request.to) < firstDay)
      throw new MarketDataError(
        `Tus datos de ${root} empiezan el ${fmtDay(firstDay)}: este trade es anterior.`,
      );
    return result(
      this.name,
      { ...request, symbol: root, from, to },
      bars,
      false,
      [
        `Velas de ${basename(file.path)} (el archivo está en hora de ${zone.label}; convertida automáticamente).`,
      ],
      "USD",
    );
  },
};
