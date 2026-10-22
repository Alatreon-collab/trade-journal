import { afterAll, expect, it, vi } from "vitest";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const scratch = mkdtempSync(join(tmpdir(), "journal-bot-export-"));
process.env.JOURNAL_DATA_DIR = join(scratch, "journal");
vi.stubEnv("JOURNAL_PASSWORD", "");
vi.mock("next/headers", () => ({ cookies: async () => ({ get: () => undefined }) }));

const { db, accounts, trades, attachments, tradeRuleChecks, missedTrades, settings } =
  await import("../src/db");
const { insertExecutions } = await import("../src/server/executions");
const { editManualTrade } = await import("../src/server/edit-trade");
const { exportForBot, isoNewYork, plainText, microsEquivalent } =
  await import("../src/server/bot-export");

afterAll(() => rmSync(scratch, { recursive: true, force: true }));

const out = join(scratch, "exportacion");
const parse = (file: string) => {
  const [header, ...rows] = readFileSync(join(out, file), "utf8").trim().split("\r\n");
  const cols = header!.split(",");
  return rows.map((line) => {
    const cells: string[] = [];
    let cur = "",
      quoted = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i]!;
      if (quoted && ch === '"' && line[i + 1] === '"') ((cur += '"'), i++);
      else if (ch === '"') quoted = !quoted;
      else if (ch === "," && !quoted) (cells.push(cur), (cur = ""));
      else cur += ch;
    }
    cells.push(cur);
    return Object.fromEntries(cols.map((c, i) => [c, cells[i] ?? ""]));
  });
};

it("formats New York times with their offset and helper values", () => {
  expect(isoNewYork("2026-10-21T13:36:00.000Z")).toBe("2026-10-21T09:36:00-04:00");
  expect(isoNewYork("2026-01-15T14:30:00.000Z")).toBe("2026-01-15T09:30:00-05:00");
  expect(plainText("<p>Sweep de <b>Asia</b></p><p>Entré &amp; salí</p>")).toBe(
    "Sweep de Asia\nEntré & salí",
  );
  expect(microsEquivalent("NQ", 2)).toBe(20);
  expect(microsEquivalent("MNQ", 3)).toBe(3);
});

it("exports trades, executions, rules, images and not-taken setups with a fixed id", () => {
  db.insert(accounts)
    .values({ id: "bt", name: "Tradeify 50K", kind: "manual", createdAt: "2026-01-01" })
    .run();
  db.insert(settings).values({ key: "multipliers", value: '{"NQ":20}' }).run();
  insertExecutions(
    "bt",
    [
      {
        symbol: "NQ",
        side: "buy",
        quantity: 1,
        price: 29335.75,
        fee: 2,
        executedAt: "2026-10-21T13:36:00.000Z",
        assetClass: "futures",
      },
      {
        symbol: "NQ",
        side: "sell",
        quantity: 1,
        price: 29373.25,
        fee: 2,
        executedAt: "2026-10-21T13:47:00.000Z",
        assetClass: "futures",
      },
    ],
    "manual",
  );
  const trade = db.select().from(trades).all()[0]!;
  db.update(trades)
    .set({
      notes: "<p>Buen sweep</p>",
      tagsJson: '["sweep","a+"]',
      setupJson: JSON.stringify({
        nota_previa: "A+",
        tf_setup: "1H",
        tf_entrada: "1M",
        tipo_entrada: "c2_cierre",
        poi: "fvg",
        liquidez_tomada: ["asia", "pdl"],
        zona_htf: "fvg_4h",
        id_aviso_bot: "TG-123",
      }),
      psychJson: JSON.stringify({ entry: "patient", management: ["plan"] }),
    })
    .run();
  for (const name of ["4H", "4H", "15m"])
    db.insert(attachments)
      .values({
        id: `${name}-${Math.random()}`,
        ownerType: "trade",
        ownerId: trade.key,
        name,
        mime: "image/png",
        size: 1,
        data: Buffer.from("png"),
        createdAt: "2026-10-21",
      })
      .run();
  db.insert(tradeRuleChecks)
    .values({
      id: "r1",
      tradeKey: trade.key,
      playbookId: "p",
      rule: "Sweep de liquidez",
      followed: true,
    })
    .run();
  db.insert(missedTrades)
    .values({
      id: "m1",
      symbol: "NQ",
      direction: "short",
      observedAt: "2026-10-22T07:31:00.000Z",
      notes: "No había confirmación",
      createdAt: "2026-10-22",
      setupJson: '{"nota_previa":"B"}',
    })
    .run();

  db.insert(settings).values({ key: "botExportPath", value: out }).run();
  const result = exportForBot();
  expect(result).toMatchObject({ trades: 1, notTaken: 1, executions: 2, images: 3 });

  const [taken, notTaken] = parse("trades.csv");
  expect(taken).toMatchObject({
    id: trade.uid,
    tomado: "1",
    cuenta: "Tradeify 50K",
    origen: "manual",
    simbolo: "NQ",
    direccion: "long",
    hora_entrada_ny: "2026-10-21T09:36:00-04:00",
    hora_entrada_utc: "2026-10-21T13:36:00Z",
    sesion: "NY AM",
    micros_equivalentes: "10",
    puntos: "37.5",
    pnl_bruto: "750",
    pnl_neto: "746",
    comisiones: "4",
    etiquetas: "sweep|a+",
    nota_previa: "A+",
    tf_setup: "1H",
    tipo_entrada: "C2 al cierre",
    poi: "FVG",
    liquidez_tomada: "Asia|PDL",
    zona_htf: "FVG 4H",
    id_aviso_bot: "TG-123",
    psico_entrada: "Esperé pacientemente",
    psico_gestion: "Seguí el plan",
    notas: "Buen sweep",
  });
  expect(taken!.imagenes.split("|")).toEqual([
    `${trade.uid}/4H.png`,
    `${trade.uid}/4H (2).png`,
    `${trade.uid}/15m.png`,
  ]);
  expect(existsSync(join(out, trade.uid!, "4H (2).png"))).toBe(true);
  expect(notTaken).toMatchObject({
    id: "nt_m1",
    tomado: "0",
    motivo_no_tomado: "No había confirmación",
    direccion: "short",
    hora_entrada_ny: "2026-10-22T03:31:00-04:00",
    sesion: "Londres",
    nota_previa: "B",
  });
  expect(parse("ejecuciones.csv")[0]).toMatchObject({ trade_id: trade.uid, lado: "compra" });
  expect(parse("reglas.csv")).toEqual([
    { trade_id: trade.uid, regla: "Sweep de liquidez", cumplida: "1" },
  ]);
  expect(readFileSync(join(out, "LEEME.md"), "utf8")).toContain("nota_previa");

  // Corregir la hora no cambia el id, y lo que ya no existe se borra de la carpeta.
  const { key } = editManualTrade(trade.key, [
    { side: "buy", quantity: 1, price: 29335.75, fee: 2, executedAt: "2026-10-21T13:37:00.000Z" },
    { side: "sell", quantity: 1, price: 29373.25, fee: 2, executedAt: "2026-10-21T13:47:00.000Z" },
  ]);
  expect(db.select().from(trades).all()[0]!.uid).toBe(trade.uid);
  db.delete(attachments).run();
  db.delete(missedTrades).run();
  exportForBot();
  const again = parse("trades.csv");
  expect(again).toHaveLength(1);
  expect(again[0]!.id).toBe(trade.uid);
  expect(again[0]!.hora_entrada_ny).toBe("2026-10-21T09:37:00-04:00");
  expect(existsSync(join(out, trade.uid!, "4H.png"))).toBe(false);
  expect(key).not.toBe(trade.key);
});
