import { bad, handler, ok } from "@/server/api";
import { cancelPending, inspectBackup, restorePending } from "@/server/backup";

export const dynamic = "force-dynamic";

const MAX_BACKUP_SIZE = 4 * 1024 * 1024 * 1024; // 4 GB

/** Paso 1: sube el archivo y devuelve qué contiene. No cambia nada todavía. */
export const POST = handler(async (request: Request) => {
  const declared = Number(request.headers.get("content-length") ?? 0);
  if (declared > MAX_BACKUP_SIZE) return bad("El archivo es demasiado grande.");
  const bytes = Buffer.from(await request.arrayBuffer());
  if (!bytes.length) return bad("Elige el archivo de la copia.");
  return ok(inspectBackup(bytes));
});

/** Paso 2: el usuario confirma y se sustituyen los datos. */
export const PUT = handler(() => ok(restorePending()));

/** Cancelar: borra la copia subida sin restaurar. */
export const DELETE = handler(() => {
  cancelPending();
  return ok({ cancelled: true });
});
