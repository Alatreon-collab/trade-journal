import Database from "better-sqlite3";
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { hostname } from "node:os";
import { join } from "node:path";
import { dataDir, db } from "@/db";
import { RequestError } from "./api";

/**
 * Copias para pasar el journal de un PC a otro: un único archivo .db con todo
 * (trades, diario, psicología, imágenes). Las claves de IA, de datos de mercado
 * y de brokers nunca viajan: van cifradas con una clave propia de cada PC.
 */

type Sqlite = Database.Database;
const raw = (): Sqlite => (db as unknown as { $client: Sqlite }).$client;

export const backupDir = (): string => {
  const dir = join(dataDir(), "copias");
  mkdirSync(dir, { recursive: true });
  return dir;
};
const pendingPath = () => join(backupDir(), "pendiente.db");

/** Ajustes que pertenecen a este PC y nunca se copian ni se sobrescriben. */
const LOCAL_ONLY_SQL = "(lower(key) LIKE '%keyenc' OR key = 'pcName')";

export const getPcName = (): string => {
  const row = raw().prepare("SELECT value FROM settings WHERE key = 'pcName'").get() as
    { value: string } | undefined;
  return row?.value?.trim() || hostname();
};

export const setPcName = (name: string): void => {
  const clean = name.trim().slice(0, 40);
  if (!clean) raw().prepare("DELETE FROM settings WHERE key = 'pcName'").run();
  else
    raw()
      .prepare(
        "INSERT INTO settings (key, value) VALUES ('pcName', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
      )
      .run(clean);
};

interface Summary {
  trades: number;
  days: number;
  images: number;
  changedAt: string | null;
}

const hasTable = (sqlite: Sqlite, name: string, schema = "main") =>
  Boolean(
    sqlite
      .prepare(`SELECT 1 FROM ${schema}.sqlite_master WHERE type = 'table' AND name = ?`)
      .get(name),
  );

const count = (sqlite: Sqlite, table: string) =>
  hasTable(sqlite, table)
    ? (sqlite.prepare(`SELECT count(*) AS n FROM "${table}"`).get() as { n: number }).n
    : 0;

const summarize = (sqlite: Sqlite): Summary => ({
  trades: count(sqlite, "trades"),
  days: count(sqlite, "journal_days"),
  images: count(sqlite, "attachments"),
  changedAt: hasTable(sqlite, "sync_state")
    ? ((
        sqlite.prepare("SELECT changed_at FROM sync_state WHERE id = 1").get() as
          { changed_at: string | null } | undefined
      )?.changed_at ?? null)
    : null,
});

export const localSummary = () => ({ pcName: getPcName(), ...summarize(raw()) });

const stamp = (date = new Date()) => {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}_${pad(date.getHours())}${pad(date.getMinutes())}`;
};
const safeName = (text: string) =>
  text
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^A-Za-z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40) || "pc";

/** Genera la copia y devuelve sus bytes y el nombre de archivo sugerido. */
export function createBackup(): { bytes: Buffer; filename: string } {
  const pcName = getPcName();
  const tmp = join(backupDir(), `.descarga-${process.pid}-${Date.now()}.db`);
  raw().prepare("VACUUM INTO ?").run(tmp);
  try {
    const copy = new Database(tmp);
    try {
      copy.pragma("journal_mode = DELETE");
      copy.exec(`DELETE FROM settings WHERE ${LOCAL_ONLY_SQL}`);
      if (hasTable(copy, "accounts")) copy.exec("UPDATE accounts SET credentials_enc = NULL");
      copy.exec(
        "CREATE TABLE IF NOT EXISTS backup_meta (key TEXT PRIMARY KEY, value TEXT NOT NULL)",
      );
      const put = copy.prepare("INSERT OR REPLACE INTO backup_meta (key, value) VALUES (?, ?)");
      put.run("pcName", pcName);
      put.run("createdAt", new Date().toISOString());
      put.run("format", "1");
    } finally {
      copy.close();
    }
    return {
      bytes: readFileSync(tmp),
      filename: `journal-${safeName(pcName)}-${stamp()}.db`,
    };
  } finally {
    rmSync(tmp, { force: true });
  }
}

export interface BackupInfo {
  copy: Summary & { pcName: string | null; createdAt: string | null };
  local: Summary & { pcName: string };
  /** En este PC hay cambios posteriores al último cambio que contiene la copia. */
  localIsNewer: boolean;
}

/** Guarda la copia subida como pendiente y devuelve qué contiene, sin restaurar nada. */
export function inspectBackup(bytes: Buffer): BackupInfo {
  if (bytes.length < 100 || bytes.subarray(0, 16).toString("latin1") !== "SQLite format 3\0")
    throw new RequestError("Este archivo no es una copia del journal.");
  const path = pendingPath();
  writeFileSync(path, bytes);
  let copy: Sqlite | null = null;
  try {
    copy = new Database(path, { readonly: true, fileMustExist: true });
    if (!hasTable(copy, "trades") || !hasTable(copy, "accounts"))
      throw new RequestError("Este archivo no es una copia del journal.");
    const meta = hasTable(copy, "backup_meta")
      ? Object.fromEntries(
          (
            copy.prepare("SELECT key, value FROM backup_meta").all() as {
              key: string;
              value: string;
            }[]
          ).map((row) => [row.key, row.value]),
        )
      : {};
    const copySummary = summarize(copy);
    const local = localSummary();
    return {
      copy: { ...copySummary, pcName: meta.pcName ?? null, createdAt: meta.createdAt ?? null },
      local,
      localIsNewer: Boolean(
        local.changedAt && (!copySummary.changedAt || local.changedAt > copySummary.changedAt),
      ),
    };
  } catch (error) {
    copy?.close();
    copy = null;
    rmSync(path, { force: true });
    if (error instanceof RequestError) throw error;
    throw new RequestError("No se ha podido leer la copia. ¿Es el archivo correcto?");
  } finally {
    copy?.close();
  }
}

export const cancelPending = () => rmSync(pendingPath(), { force: true });

const SAFETY_PREFIX = "antes-de-restaurar-";
const KEEP_SAFETY = 10;

/** Sustituye los datos de este PC por los de la copia pendiente. */
export function restorePending(): { safetyFile: string } {
  const path = pendingPath();
  if (!existsSync(path)) throw new RequestError("Vuelve a elegir el archivo de la copia.");
  const sqlite = raw();

  // 1. Copia de seguridad de lo que hay ahora, por si hay que deshacer.
  const safetyFile = `${SAFETY_PREFIX}${stamp()}.db`;
  sqlite.prepare("VACUUM INTO ?").run(join(backupDir(), safetyFile));
  const old = readdirSync(backupDir())
    .filter((name) => name.startsWith(SAFETY_PREFIX) && name.endsWith(".db"))
    .sort()
    .reverse()
    .slice(KEEP_SAFETY);
  for (const name of old) rmSync(join(backupDir(), name), { force: true });

  // 2. Sustituir tabla a tabla dentro de una transacción: o se copia todo o nada.
  sqlite.pragma("foreign_keys = OFF");
  sqlite.prepare("ATTACH DATABASE ? AS copia").run(path);
  try {
    sqlite.transaction(() => {
      const keepSettings = sqlite
        .prepare(`SELECT key, value FROM main.settings WHERE ${LOCAL_ONLY_SQL}`)
        .all() as { key: string; value: string }[];
      const keepCredentials = sqlite
        .prepare("SELECT id, credentials_enc FROM main.accounts WHERE credentials_enc IS NOT NULL")
        .all() as { id: string; credentials_enc: string }[];

      const tables = (
        sqlite
          .prepare(
            "SELECT name FROM main.sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' AND name <> 'sync_state'",
          )
          .all() as { name: string }[]
      ).map((row) => row.name);

      for (const table of tables) {
        sqlite.exec(`DELETE FROM main."${table}"`);
        if (!hasTable(sqlite, table, "copia")) continue;
        const columnsOf = (schema: string) =>
          (sqlite.pragma(`${schema}.table_info("${table}")`) as { name: string }[]).map(
            (column) => column.name,
          );
        const theirs = new Set(columnsOf("copia"));
        const shared = columnsOf("main")
          .filter((name) => theirs.has(name))
          .map((name) => `"${name}"`)
          .join(", ");
        if (!shared) continue;
        sqlite.exec(
          `INSERT INTO main."${table}" (${shared}) SELECT ${shared} FROM copia."${table}"`,
        );
      }

      sqlite.exec(`DELETE FROM main.settings WHERE ${LOCAL_ONLY_SQL}`);
      const putSetting = sqlite.prepare("INSERT INTO main.settings (key, value) VALUES (?, ?)");
      for (const row of keepSettings) putSetting.run(row.key, row.value);
      const putCredentials = sqlite.prepare(
        "UPDATE main.accounts SET credentials_enc = ? WHERE id = ?",
      );
      for (const row of keepCredentials) putCredentials.run(row.credentials_enc, row.id);

      // El "último cambio" pasa a ser el de la copia: restaurar no cuenta como cambio.
      const copyChangedAt = hasTable(sqlite, "sync_state", "copia")
        ? ((
            sqlite.prepare("SELECT changed_at FROM copia.sync_state WHERE id = 1").get() as
              { changed_at: string | null } | undefined
          )?.changed_at ?? null)
        : null;
      sqlite.prepare("UPDATE main.sync_state SET changed_at = ? WHERE id = 1").run(copyChangedAt);
    })();
  } finally {
    sqlite.exec("DETACH DATABASE copia");
    sqlite.pragma("foreign_keys = ON");
  }
  rmSync(path, { force: true });
  return { safetyFile };
}
