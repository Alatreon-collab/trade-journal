import { bad, handler, ok } from "@/server/api";
import { localSummary, setPcName } from "@/server/backup";

export const dynamic = "force-dynamic";

export const GET = handler(() => ok(localSummary()));

/** Cambia el nombre con el que este PC firma sus copias. */
export const PATCH = handler(async (request: Request) => {
  const body = (await request.json().catch(() => null)) as { pcName?: unknown } | null;
  if (!body || typeof body.pcName !== "string") return bad("Nombre no válido.");
  setPcName(body.pcName);
  return ok(localSummary());
});
