import { afterAll, expect, it, vi } from "vitest";
import { existsSync, mkdtempSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const scratch = mkdtempSync(join(tmpdir(), "journal-backup-"));
process.env.JOURNAL_DATA_DIR = scratch;
vi.stubEnv("JOURNAL_PASSWORD", "");
vi.mock("next/headers", () => ({ cookies: async () => ({ get: () => undefined }) }));

const { db } = await import("../src/db");
const backup = await import("../src/server/backup");
const restoreRoute = await import("../src/app/api/backup/restore/route");
const sqlite = (db as unknown as { $client: import("better-sqlite3").Database }).$client;

const addDay = (date: string, note: string) =>
  sqlite
    .prepare("INSERT INTO journal_days (date, note, updated_at) VALUES (?, ?, ?)")
    .run(date, note, new Date().toISOString());
const notes = () =>
  (sqlite.prepare("SELECT note FROM journal_days ORDER BY date").all() as { note: string }[]).map(
    (row) => row.note,
  );
const setting = (key: string) =>
  (
    sqlite.prepare("SELECT value FROM settings WHERE key = ?").get(key) as
      { value: string } | undefined
  )?.value;

afterAll(() => rmSync(scratch, { recursive: true, force: true }));

it("tracks the last change and moves everything between PCs, keeping each PC's own keys", async () => {
  expect(backup.localSummary().changedAt).toBeNull();
  sqlite
    .prepare(
      "INSERT INTO accounts (id, name, kind, credentials_enc, created_at) VALUES ('a1', 'Fondeada', 'sync', 'secreto-trabajo', '2026-01-01')",
    )
    .run();
  addDay("2026-10-20", "Lunes trabajo");
  sqlite
    .prepare("INSERT INTO settings (key, value) VALUES ('anthropicKeyEnc', 'clave-trabajo')")
    .run();
  backup.setPcName("Trabajo");
  expect(backup.localSummary().changedAt).not.toBeNull();

  // La copia no lleva claves ni el nombre del PC en ajustes, pero sí sus metadatos.
  const { bytes, filename } = backup.createBackup();
  expect(filename).toMatch(/^journal-Trabajo-\d{4}-\d{2}-\d{2}_\d{4}\.db$/);
  const copyDir = mkdtempSync(join(tmpdir(), "journal-backup-copy-"));
  const Database = (await import("better-sqlite3")).default;
  const copyPath = join(copyDir, "c.db");
  (await import("node:fs")).writeFileSync(copyPath, bytes);
  const copy = new Database(copyPath, { readonly: true });
  expect(copy.prepare("SELECT credentials_enc FROM accounts").get()).toEqual({
    credentials_enc: null,
  });
  expect(
    copy.prepare("SELECT count(*) n FROM settings WHERE key IN ('anthropicKeyEnc','pcName')").get(),
  ).toEqual({ n: 0 });
  expect(copy.prepare("SELECT value FROM backup_meta WHERE key='pcName'").get()).toEqual({
    value: "Trabajo",
  });
  copy.close();
  rmSync(copyDir, { recursive: true, force: true });

  // "Casa": otros datos y otras claves. Cambiar después de la copia ⇒ aviso.
  await new Promise((resolve) => setTimeout(resolve, 5));
  sqlite.exec("DELETE FROM journal_days");
  addDay("2026-10-18", "Finde casa");
  sqlite.prepare("UPDATE settings SET value = 'clave-casa' WHERE key = 'anthropicKeyEnc'").run();
  sqlite.prepare("UPDATE accounts SET credentials_enc = 'secreto-casa'").run();
  backup.setPcName("Casa");

  const inspect = await restoreRoute.POST(
    new Request("http://localhost/api/backup/restore", {
      method: "POST",
      body: new Uint8Array(bytes),
    }),
  );
  expect(inspect.status).toBe(200);
  const info = await inspect.json();
  expect(info.copy).toMatchObject({ pcName: "Trabajo", days: 1 });
  expect(info.local).toMatchObject({ pcName: "Casa", days: 1 });
  expect(info.localIsNewer).toBe(true);

  const restored = await restoreRoute.PUT();
  expect(restored.status).toBe(200);
  expect(notes()).toEqual(["Lunes trabajo"]);
  expect(setting("anthropicKeyEnc")).toBe("clave-casa");
  expect(setting("pcName")).toBe("Casa");
  expect(sqlite.prepare("SELECT credentials_enc FROM accounts").get()).toEqual({
    credentials_enc: "secreto-casa",
  });
  // Restaurar no cuenta como cambio: ahora la misma copia ya no avisa.
  const again = await restoreRoute.POST(
    new Request("http://localhost/api/backup/restore", {
      method: "POST",
      body: new Uint8Array(bytes),
    }),
  );
  expect((await again.json()).localIsNewer).toBe(false);
  await restoreRoute.DELETE();

  // Se guardó una copia de seguridad de lo anterior, y la pendiente se borró.
  const files = readdirSync(join(scratch, "copias"));
  expect(files.some((name) => name.startsWith("antes-de-restaurar-"))).toBe(true);
  expect(existsSync(join(scratch, "copias", "pendiente.db"))).toBe(false);
});

it("rejects files that are not a journal copy", async () => {
  const response = await restoreRoute.POST(
    new Request("http://localhost/api/backup/restore", {
      method: "POST",
      body: "esto no es una base de datos".repeat(10),
    }),
  );
  expect(response.status).toBe(400);
  expect((await response.json()).error).toBe("Este archivo no es una copia del journal.");
  const restore = await restoreRoute.PUT();
  expect(restore.status).toBe(400);
});
