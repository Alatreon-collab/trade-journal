import { readFilters } from "@luxalgo/journal-core";
import { desc } from "drizzle-orm";
import { dailyStats } from "@luxalgo/journal-core";
import { db, journalDays } from "@/db";
import { handler, ok } from "@/server/api";
import { getTimeZone } from "@/server/settings";
import { queryTrades } from "@/server/trades-query";
import { DAY_PSYCH_GROUPS, parsePsych } from "@/lib/psychology";

/**
 * The journal chronology: every day that has trades OR a note, newest first.
 * Days with notes but no trades exist (planning days, review days).
 */
export const GET = handler(async (request: Request) => {
  const url = new URL(request.url);
  const timeZone = getTimeZone();
  const { trades } = queryTrades(readFilters(url.searchParams));

  const tradeDays = new Map(dailyStats(trades, timeZone).map((day) => [day.date, day]));
  const noteRows = db.select().from(journalDays).orderBy(desc(journalDays.date)).all();
  const noteDays = new Map(noteRows.map((row) => [row.date, row]));

  const filters = readFilters(url.searchParams);
  const allDates = [...new Set([...tradeDays.keys(), ...noteDays.keys()])]
    .filter(
      (date) => (!filters.from || date >= filters.from) && (!filters.to || date <= filters.to),
    )
    .sort()
    .reverse();
  return ok({
    days: allDates.map((date) => ({
      date,
      stats: tradeDays.get(date) ?? null,
      hasNote: (noteDays.get(date)?.note ?? "") !== "",
      notePreview: (noteDays.get(date)?.note ?? "").slice(0, 200),
      mood:
        DAY_PSYCH_GROUPS[0]!.options.find(
          (option) => option.value === parsePsych(noteDays.get(date)?.psychJson).mood,
        )?.label ?? null,
    })),
  });
});
