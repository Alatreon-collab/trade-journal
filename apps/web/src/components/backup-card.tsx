"use client";

import { useEffect, useRef, useState } from "react";
import { AlertTriangle, Download, Upload } from "lucide-react";
import { Button } from "./ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "./ui/card";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import { postJson, useApi } from "@/lib/use-api";

interface Summary {
  trades: number;
  days: number;
  images: number;
  changedAt: string | null;
}
interface Local extends Summary {
  pcName: string;
}
interface BackupInfo {
  copy: Summary & { pcName: string | null; createdAt: string | null };
  local: Local;
  localIsNewer: boolean;
}

const when = (iso: string | null) =>
  iso
    ? new Date(iso).toLocaleString("es-ES", {
        weekday: "short",
        day: "numeric",
        month: "short",
        hour: "2-digit",
        minute: "2-digit",
      })
    : "sin cambios registrados";

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;
const contents = (s: Summary) =>
  [
    plural(s.trades, "trade", "trades"),
    plural(s.days, "día de diario", "días de diario"),
    plural(s.images, "imagen", "imágenes"),
  ].join(" · ");

const readError = async (response: Response) => {
  const body = (await response.json().catch(() => null)) as { error?: string } | null;
  return body?.error ?? `Error ${response.status}`;
};

/** Pasar el journal de un PC a otro con un único archivo. */
export function BackupCard() {
  const { data: local, refresh } = useApi<Local>("/api/backup/info");
  const [pcName, setPcName] = useState("");
  const [info, setInfo] = useState<BackupInfo | null>(null);
  const [busy, setBusy] = useState<"" | "upload" | "restore">("");
  const [message, setMessage] = useState("");
  const [failure, setFailure] = useState("");
  const fileInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (local) setPcName(local.pcName);
  }, [local]);

  const saveName = async () => {
    if (!local || pcName.trim() === local.pcName) return;
    try {
      await postJson("/api/backup/info", { pcName }, "PATCH");
      refresh();
    } catch (e) {
      setFailure(e instanceof Error ? e.message : "No se ha podido guardar el nombre");
    }
  };

  const upload = async (file: File | undefined) => {
    if (!file) return;
    setFailure("");
    setMessage("");
    setBusy("upload");
    try {
      const response = await fetch("/api/backup/restore", { method: "POST", body: file });
      if (!response.ok) throw new Error(await readError(response));
      setInfo((await response.json()) as BackupInfo);
    } catch (e) {
      setFailure(e instanceof Error ? e.message : "No se ha podido leer la copia");
    } finally {
      setBusy("");
      if (fileInput.current) fileInput.current.value = "";
    }
  };

  const cancel = async () => {
    setInfo(null);
    await fetch("/api/backup/restore", { method: "DELETE" }).catch(() => undefined);
  };

  const restore = async () => {
    setFailure("");
    setBusy("restore");
    try {
      const response = await fetch("/api/backup/restore", { method: "PUT" });
      if (!response.ok) throw new Error(await readError(response));
      setInfo(null);
      setMessage("Copia restaurada. Recargando el journal…");
      setTimeout(() => window.location.reload(), 1200);
    } catch (e) {
      setFailure(e instanceof Error ? e.message : "No se ha podido restaurar");
    } finally {
      setBusy("");
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Pasar datos a otro PC</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4 text-sm">
        <p className="text-muted-foreground">
          «Descargar copia» guarda todo el journal (trades, diario, psicología e imágenes) en un
          solo archivo. Súbelo a tu nube y, en el otro PC, cárgalo con «Restaurar copia».
        </p>

        <div className="grid gap-1.5 sm:max-w-xs">
          <Label htmlFor="pc-name">Nombre de este PC</Label>
          <Input
            id="pc-name"
            value={pcName}
            maxLength={40}
            placeholder="Trabajo, Casa…"
            onChange={(event) => setPcName(event.target.value)}
            onBlur={saveName}
          />
        </div>
        {local && (
          <p className="text-xs text-muted-foreground">
            Aquí ahora: {contents(local)}. Último cambio: {when(local.changedAt)}.
          </p>
        )}

        <div className="flex flex-wrap gap-2">
          <a href="/api/backup" download>
            <Button>
              <Download />
              Descargar copia
            </Button>
          </a>
          <Button
            variant="outline"
            disabled={busy !== ""}
            onClick={() => fileInput.current?.click()}
          >
            <Upload />
            {busy === "upload" ? "Leyendo la copia…" : "Restaurar copia"}
          </Button>
          <input
            ref={fileInput}
            type="file"
            accept=".db"
            className="hidden"
            aria-label="Archivo de la copia"
            onChange={(event) => upload(event.target.files?.[0])}
          />
        </div>

        {info && (
          <div className="space-y-3 rounded-lg border p-3">
            <div>
              <p className="font-medium">
                Copia de «{info.copy.pcName ?? "otro PC"}»
                {info.copy.createdAt ? `, hecha el ${when(info.copy.createdAt)}` : ""}
              </p>
              <p className="text-muted-foreground">
                Contiene {contents(info.copy)}. Último cambio: {when(info.copy.changedAt)}.
              </p>
            </div>
            <p className="text-muted-foreground">
              Se sustituirá lo que hay en este PC ({contents(info.local)}).
            </p>
            {info.localIsNewer && (
              <p
                role="alert"
                className="flex gap-2 rounded-md border border-amber-500/40 bg-amber-500/10 p-2 text-amber-700 dark:text-amber-300"
              >
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                <span>
                  Ojo: en este PC hay cambios más recientes que la copia (último cambio aquí:{" "}
                  {when(info.local.changedAt)}). Si restauras, esos cambios se perderán. ¿Seguro que
                  es la copia buena?
                </span>
              </p>
            )}
            <div className="flex flex-wrap gap-2">
              <Button disabled={busy !== ""} onClick={restore}>
                {busy === "restore" ? "Restaurando…" : "Restaurar esta copia"}
              </Button>
              <Button variant="outline" disabled={busy !== ""} onClick={cancel}>
                Cancelar
              </Button>
            </div>
          </div>
        )}

        {message && (
          <p role="status" className="text-emerald-600 dark:text-emerald-400">
            {message}
          </p>
        )}
        {failure && (
          <p role="alert" className="text-destructive">
            {failure}
          </p>
        )}

        <p className="text-xs leading-relaxed text-muted-foreground">
          Antes de restaurar se guarda sola una copia de lo que había, en la carpeta
          apps/web/data/copias (se conservan las 10 últimas). Las claves de IA y de brokers no
          viajan en la copia: cada PC conserva las suyas.
        </p>
      </CardContent>
    </Card>
  );
}
