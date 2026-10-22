import { handler, ok } from "@/server/api";
import { exportForBot, getExportPath, getLastExport, setExportPath } from "@/server/bot-export";

export const dynamic = "force-dynamic";

export const GET = handler(() => ok({ path: getExportPath(), last: getLastExport() }));

/** Guarda la carpeta donde se escribe la exportación (es de cada PC). */
export const PATCH = handler(async (request: Request) => {
  const body = (await request.json().catch(() => ({}))) as { path?: unknown };
  setExportPath(typeof body.path === "string" ? body.path : "");
  return ok({ path: getExportPath(), last: getLastExport() });
});

/** Escribe la exportación completa en la carpeta. */
export const POST = handler(() => ok(exportForBot()));
