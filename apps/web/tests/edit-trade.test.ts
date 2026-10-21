import { afterAll, expect, it, vi } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const scratch = mkdtempSync(join(tmpdir(), "journal-edit-trade-"));
process.env.JOURNAL_DATA_DIR = scratch;
vi.stubEnv("JOURNAL_PASSWORD", "");
vi.mock("next/headers", () => ({ cookies: async () => ({ get: () => undefined }) }));

const { db, accounts, trades, attachments, tradeRuleChecks, executions } =
  await import("../src/db");
const { insertExecutions } = await import("../src/server/executions");
const { PUT } = await import("../src/app/api/trades/[key]/executions/route");

afterAll(() => rmSync(scratch, { recursive: true, force: true }));

const put = (key: string, body: unknown) =>
  PUT(
    new Request("http://localhost/x", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }),
    { params: Promise.resolve({ key }) },
  );

it("fixes a manual trade's time and keeps every annotation", async () => {
  db.insert(accounts)
    .values({ id: "bt", name: "BT", kind: "manual", createdAt: "2026-01-01" })
    .run();
  insertExecutions(
    "bt",
    [
      {
        symbol: "NQ",
        side: "buy",
        quantity: 1,
        price: 29335.75,
        fee: 0,
        executedAt: "2026-08-04T03:29:00.000Z",
      },
      {
        symbol: "NQ",
        side: "sell",
        quantity: 1,
        price: 29373.25,
        fee: 0,
        executedAt: "2026-08-04T03:40:00.000Z",
      },
    ],
    "manual",
  );
  const oldKey = db.select().from(trades).all()[0]!.key;
  db.update(trades)
    .set({
      notes: "<p>Mi nota</p>",
      tagsJson: '["sweep"]',
      psychJson: '{"entry":"patient"}',
      rating: 4,
    })
    .run();
  db.insert(attachments)
    .values({
      id: "img",
      ownerType: "trade",
      ownerId: oldKey,
      name: "4h.png",
      mime: "image/png",
      size: 1,
      data: Buffer.from("x"),
      createdAt: "2026-08-04",
    })
    .run();
  db.insert(tradeRuleChecks)
    .values({ id: "r1", tradeKey: oldKey, playbookId: "p", rule: "Sweep", followed: true })
    .run();

  const response = await put(oldKey, {
    executions: [
      { side: "buy", quantity: 1, price: 29335.75, fee: 0, executedAt: "2026-08-04T09:29:00.000Z" },
      {
        side: "sell",
        quantity: 1,
        price: 29373.25,
        fee: 0,
        executedAt: "2026-08-04T09:40:00.000Z",
      },
    ],
  });
  expect(response.status).toBe(200);
  const { key } = await response.json();
  expect(key).not.toBe(oldKey);
  const all = db.select().from(trades).all();
  expect(all).toHaveLength(1);
  expect(all[0]).toMatchObject({
    key,
    openedAt: "2026-08-04T09:29:00.000Z",
    notes: "<p>Mi nota</p>",
    tagsJson: '["sweep"]',
    psychJson: '{"entry":"patient"}',
    rating: 4,
  });
  expect(db.select().from(attachments).all()[0]!.ownerId).toBe(key);
  expect(db.select().from(tradeRuleChecks).all()[0]!.tradeKey).toBe(key);
  expect(db.select().from(executions).all()).toHaveLength(2);
});

it("refuses imported trades and invalid executions without touching anything", async () => {
  db.insert(accounts)
    .values({ id: "imp", name: "Tradovate", kind: "import", createdAt: "2026-01-01" })
    .run();
  insertExecutions(
    "imp",
    [
      {
        symbol: "MNQ",
        side: "buy",
        quantity: 1,
        price: 100,
        fee: 0,
        executedAt: "2026-08-05T13:30:00.000Z",
      },
      {
        symbol: "MNQ",
        side: "sell",
        quantity: 1,
        price: 101,
        fee: 0,
        executedAt: "2026-08-05T13:31:00.000Z",
      },
    ],
    "import",
  );
  const imported = db
    .select()
    .from(trades)
    .all()
    .find((row) => row.accountId === "imp")!;
  const refused = await put(imported.key, {
    executions: [
      { side: "buy", quantity: 1, price: 1, fee: 0, executedAt: "2026-08-05T13:30:00.000Z" },
    ],
  });
  expect(refused.status).toBe(400);
  expect((await refused.json()).error).toContain("Solo se pueden editar los trades metidos a mano");

  const manual = db
    .select()
    .from(trades)
    .all()
    .find((row) => row.accountId === "bt")!;
  const invalid = await put(manual.key, {
    executions: [
      { side: "buy", quantity: -1, price: 1, fee: 0, executedAt: "2026-08-04T09:29:00.000Z" },
    ],
  });
  expect(invalid.status).toBe(400);
  expect(
    db
      .select()
      .from(trades)
      .all()
      .find((row) => row.key === manual.key),
  ).toBeTruthy();
});
