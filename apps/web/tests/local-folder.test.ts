import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const scratch = mkdtempSync(join(tmpdir(), "journal-local-folder-"));
process.env.JOURNAL_DATA_DIR = join(scratch, "journal");
vi.stubEnv("JOURNAL_PASSWORD", "");
vi.stubEnv("JOURNAL_MARKET_FOLDER", "");
vi.mock("next/headers", () => ({ cookies: async () => ({ get: () => undefined }) }));

const { db, accounts, executions, trades, settings } = await import("../src/db");
const { insertExecutions } = await import("../src/server/executions");
const { saveConnection } = await import("../src/server/market-data/connections");
const { symbolCandidates, chicagoToUtc } = await import("../src/server/market-data/local-folder");
const { POST: loadHistory } = await import("../src/app/api/trades/[key]/market-data/route");

afterAll(() => rmSync(scratch, { recursive: true, force: true }));

const START = Date.UTC(2026, 2, 5, 0, 0); // jueves 5 de marzo de 2026
const END = Date.UTC(2026, 2, 12, 0, 0); // incluye el cambio de hora del 8 de marzo
const ADJUST = 1.02; // contrato continuo ajustado: precios del archivo = reales × 1,02
const realBase = (time: number) => 20000 + (((time - START) / 60_000) % 100);

const wall = new Intl.DateTimeFormat("en-GB", {
  timeZone: "America/Chicago",
  hourCycle: "h23",
  weekday: "short",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
});

/** Archivo como los de BacktestMarket: hora de Chicago, día/mes/año, separador ";". */
function writeFolder(name: string, closeTime: boolean) {
  const folder = join(scratch, name);
  mkdirSync(join(folder, "NQ"), { recursive: true });
  const lines: string[] = [];
  for (let time = START; time < END; time += 60_000) {
    const p = Object.fromEntries(wall.formatToParts(new Date(time)).map((x) => [x.type, x.value]));
    const hour = Number(p.hour);
    if (p.weekday === "Sat" || (p.weekday === "Fri" && hour >= 16)) continue;
    if (p.weekday === "Sun" && hour < 17) continue;
    if (hour === 16) continue; // pausa diaria
    const base = realBase(time);
    const stamp = closeTime ? new Date(time + 60_000) : new Date(time);
    const q = Object.fromEntries(wall.formatToParts(stamp).map((x) => [x.type, x.value]));
    const f = (n: number) => (n * ADJUST).toFixed(6);
    lines.push(
      `${q.day}/${q.month}/${q.year};${q.hour}:${q.minute};${f(base)};${f(base + 5)};${f(base - 5)};${f(base + 1)};100`,
    );
  }
  writeFileSync(join(folder, "NQ", "nq-1m_bk.csv"), lines.join("\r\n") + "\r\n");
  return folder;
}

const workFolder = writeFolder("open-time", false);
const closeFolder = writeFolder("close-time", true);

describe("símbolos y hora de Chicago", () => {
  it("maps micro contracts to their full-size data", () => {
    expect(symbolCandidates("MNQZ5")).toContain("NQ");
    expect(symbolCandidates("MES")).toContain("ES");
    expect(symbolCandidates("mymh6")).toContain("YM");
    expect(symbolCandidates("NQ")).toEqual(["NQ"]);
  });
  it("converts Chicago wall time to UTC across daylight saving", () => {
    expect(new Date(chicagoToUtc(2026, 1, 15, 8, 30)).toISOString()).toBe(
      "2026-01-15T14:30:00.000Z",
    );
    expect(new Date(chicagoToUtc(2026, 7, 15, 8, 30)).toISOString()).toBe(
      "2026-07-15T13:30:00.000Z",
    );
  });
});

describe("Mi carpeta de datos", () => {
  beforeEach(() => {
    db.delete(settings).run();
    db.delete(trades).run();
    db.delete(executions).run();
    db.delete(accounts).run();
  });

  const seed = (entry: string, exit: string) => {
    db.insert(accounts)
      .values({ id: "bt", name: "BT", kind: "manual", createdAt: "2026-01-01" })
      .run();
    const entryTime = Date.parse(entry);
    insertExecutions(
      "bt",
      [
        {
          symbol: "MNQH6",
          side: "buy",
          quantity: 1,
          price: realBase(entryTime) + 1,
          fee: 0,
          executedAt: entry,
          assetClass: "equity",
        },
        {
          symbol: "MNQH6",
          side: "sell",
          quantity: 1,
          price: realBase(Date.parse(exit)) + 2,
          fee: 0,
          executedAt: exit,
          assetClass: "equity",
        },
      ],
      "manual",
    );
    return db.select().from(trades).all()[0]!.key;
  };
  const load = (key: string) =>
    loadHistory(
      new Request("http://localhost/x", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          provider: "local-folder",
          symbol: "MNQH6",
          resolution: "1m",
          basisConfirmed: true,
        }),
      }),
      { params: Promise.resolve({ key }) },
    );

  for (const [label, folder] of [
    ["bar-open timestamps", workFolder],
    ["bar-close timestamps", closeFolder],
  ] as const)
    it(`reads the trade's day, converts Chicago time and undoes the adjustment (${label})`, async () => {
      saveConnection("local-folder", JSON.stringify({ path: folder }));
      // Lunes 9 de marzo, ya en horario de verano: 09:30 en Chicago = 14:30 UTC.
      const key = seed("2026-03-09T14:30:00Z", "2026-03-09T14:33:00Z");
      const response = await load(key);
      expect(response.status).toBe(200);
      const body = await response.json();
      expect(body.symbol).toBe("NQ");
      expect(body.warnings.join(" ")).toMatch(/multiplicado por 0\.98\d\d/);
      const entryBar = body.bars.find(
        (bar: { time: number }) => bar.time === Date.parse("2026-03-09T14:30:00Z"),
      );
      const real = realBase(Date.parse("2026-03-09T14:30:00Z"));
      // El factor exacto no se puede saber desde dentro de la vela: margen de pocos puntos.
      expect(Math.abs(entryBar.low - (real - 5))).toBeLessThan(3);
      expect(Math.abs(entryBar.high - (real + 5))).toBeLessThan(3);
      expect(body.bars.length).toBeGreaterThan(40); // incluye contexto antes y después
      expect(body.estimate.mae).not.toBeNull();
      expect(body.estimate.mfe).not.toBeNull();
      expect(body.estimate.priceBasisMismatch).toBeUndefined();
    });

  it("says how far the data goes when a trade is newer than the files", async () => {
    saveConnection("local-folder", JSON.stringify({ path: workFolder }));
    const key = seed("2026-04-01T14:30:00Z", "2026-04-01T14:33:00Z");
    const response = await load(key);
    expect(response.status).toBe(502);
    expect((await response.json()).error).toContain("llegan hasta el 11/03/2026");
  });

  it("explains a missing folder", async () => {
    saveConnection("local-folder", JSON.stringify({ path: join(scratch, "no-existe") }));
    const key = seed("2026-03-09T14:30:00Z", "2026-03-09T14:33:00Z");
    const response = await load(key);
    expect(response.status).toBe(502);
    expect((await response.json()).error).toContain("No encuentro esa carpeta");
  });
});
