import { readFilters } from "@luxalgo/journal-core";
import { eq } from "drizzle-orm";
import { computeMetrics, dayKeyOf, intradayCurve } from "@luxalgo/journal-core";
import { db, executions, journalDays } from "@/db";
import { bad, handler, ok } from "@/server/api";
import { nowIso } from "@/server/ids";
import { getTimeZone } from "@/server/settings";
import { queryTrades } from "@/server/trades-query";
import { DAY_PSYCH_GROUPS, parsePsych, sanitizePsych } from "@/lib/psychology";

type Params = { params: Promise<{ date: string }> };

export const GET = handler(async (request: Request, { params }: Params) => {
  const { date } = await params;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return bad("date must be YYYY-MM-DD");
  const url = new URL(request.url);
  const timeZone = getTimeZone();

  const { rows, trades } = queryTrades(readFilters(url.searchParams));
  const dayTradeIndexes = trades
    .map((trade, index) => ({ trade, index }))
    .filter(({ trade }) => trade.closedAt && dayKeyOf(trade.closedAt, timeZone) === date);
  const dayTrades = dayTradeIndexes.map(({ trade }) => trade);

  // Intraday curve needs exit timestamps — one fetch per involved account.
  const times = new Map<string, string>();
  for (const accountId of new Set(dayTrades.map((trade) => trade.accountId))) {
    const fills = db.select().from(executions).where(eq(executions.accountId, accountId)).all();
    for (const fill of fills) times.set(fill.id, fill.executedAt);
  }

  const note = db.select().from(journalDays).where(eq(journalDays.date, date)).get();
  return ok({
    date,
    metrics: computeMetrics(dayTrades, { timeZone }),
    trades: dayTradeIndexes.map(({ index }) => rows[index]),
    intraday: intradayCurve(dayTrades, times, date, timeZone),
    note: note?.note ?? "",
    psych: parsePsych(note?.psychJson),
  });
});

export const PUT = handler(async (request: Request, { params }: Params) => {
  const { date } = await params;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return bad("date must be YYYY-MM-DD");
  const body = (await request.json()) as { note?: string; psych?: unknown };
  if (body.note !== undefined && typeof body.note !== "string") return bad("Nota no válida.");
  let psychJson: string | null | undefined;
  if (body.psych !== undefined) {
    try {
      const psych = sanitizePsych(body.psych, DAY_PSYCH_GROUPS);
      psychJson = psych ? JSON.stringify(psych) : null;
    } catch (error) {
      return bad((error as Error).message);
    }
  }
  // Guardar solo lo que llega: la nota y la psicología se editan por separado.
  const set: Partial<typeof journalDays.$inferInsert> = { updatedAt: nowIso() };
  if (body.note !== undefined) set.note = body.note;
  if (psychJson !== undefined) set.psychJson = psychJson;
  db.insert(journalDays)
    .values({ date, note: body.note ?? "", psychJson: psychJson ?? null, updatedAt: nowIso() })
    .onConflictDoUpdate({ target: journalDays.date, set })
    .run();
  return ok({ saved: true });
});
