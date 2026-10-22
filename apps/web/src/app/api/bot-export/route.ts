import { handler, ok } from "@/server/api";
import {
  exportForBot,
  getExportPath,
  getLastExport,
  getSelection,
  setExportPath,
  setSelection,
} from "@/server/bot-export";

export const dynamic = "force-dynamic";

const status = () => ({ path: getExportPath(), last: getLastExport(), selection: getSelection() });

export const GET = handler(() => ok(status()));

/** Guarda la carpeta (es de cada PC) y qué cuentas y setups no tomados se exportan. */
export const PATCH = handler(async (request: Request) => {
  const body = (await request.json().catch(() => ({}))) as { path?: unknown; selection?: unknown };
  if (body.path !== undefined) setExportPath(typeof body.path === "string" ? body.path : "");
  if (body.selection !== undefined) setSelection(body.selection);
  return ok(status());
});

/** Escribe la exportación completa en la carpeta. */
export const POST = handler(() => ok(exportForBot()));
