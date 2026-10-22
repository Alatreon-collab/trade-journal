import { eq } from "drizzle-orm";
import { db, missedTrades } from "@/db";
import { bad, handler, ok } from "@/server/api";
import { sanitizeSetup } from "@/lib/setup";

type Params = { params: Promise<{ id: string }> };

/** Guarda el setup (chips) de un setup no tomado. */
export const PATCH = handler(async (request: Request, { params }: Params) => {
  const { id } = await params;
  if (!db.select({ id: missedTrades.id }).from(missedTrades).where(eq(missedTrades.id, id)).get())
    return bad("Setup no encontrado.", 404);
  const body = (await request.json().catch(() => null)) as { setup?: unknown } | null;
  if (!body || body.setup === undefined) return bad("Falta el setup.");
  let setup;
  try {
    setup = sanitizeSetup(body.setup);
  } catch (error) {
    return bad((error as Error).message);
  }
  db.update(missedTrades)
    .set({ setupJson: setup ? JSON.stringify(setup) : null })
    .where(eq(missedTrades.id, id))
    .run();
  return ok({ updated: true });
});
