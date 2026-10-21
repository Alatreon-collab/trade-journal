import { bad, handler, ok } from "@/server/api";
import { editManualTrade, type EditedExecution } from "@/server/edit-trade";

type Params = { params: Promise<{ key: string }> };

/** Corrige las ejecuciones de un trade metido a mano, conservando lo anotado. */
export const PUT = handler(async (request: Request, { params }: Params) => {
  const { key } = await params;
  const body = (await request.json().catch(() => null)) as {
    executions?: EditedExecution[];
  } | null;
  if (!body || !Array.isArray(body.executions)) return bad("Faltan las ejecuciones.");
  return ok(editManualTrade(key, body.executions));
});
