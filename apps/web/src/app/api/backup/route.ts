import { handler } from "@/server/api";
import { createBackup } from "@/server/backup";

export const dynamic = "force-dynamic";

/** Descarga la copia completa para llevarla a otro PC. */
export const GET = handler(() => {
  const { bytes, filename } = createBackup();
  return new Response(new Uint8Array(bytes), {
    headers: {
      "Content-Type": "application/octet-stream",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "private, no-store",
    },
  });
});
