import type Database from "better-sqlite3";

/**
 * Marca la hora del último cambio de datos con triggers, para avisar si se va
 * a restaurar una copia más antigua que lo que hay en este PC. Se excluyen las
 * tablas que solo guardan cálculos en caché.
 */
export function installChangeTracking(sqlite: Database.Database): void {
  sqlite.exec(`CREATE TABLE IF NOT EXISTS sync_state (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    changed_at TEXT
  );
  INSERT OR IGNORE INTO sync_state (id, changed_at) VALUES (1, NULL);`);
  const tables = (
    sqlite
      .prepare(
        "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' AND name NOT IN ('sync_state', 'trade_excursions')",
      )
      .all() as { name: string }[]
  ).map((row) => row.name);
  for (const table of tables)
    for (const op of ["INSERT", "UPDATE", "DELETE"])
      sqlite.exec(`CREATE TRIGGER IF NOT EXISTS "sync_${table}_${op.toLowerCase()}"
        AFTER ${op} ON "${table}"
        BEGIN
          UPDATE sync_state SET changed_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE id = 1;
        END;`);
}
