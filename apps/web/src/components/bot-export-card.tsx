"use client";

import { useEffect, useState } from "react";
import { Bot } from "lucide-react";
import { Button } from "./ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "./ui/card";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import { postJson, useApi } from "@/lib/use-api";

interface Status {
  path: string | null;
  last: { at: string; trades: number; skipped: number } | null;
}

/** Ajustes → Exportar para el bot. */
export function BotExportCard() {
  const { data, refresh } = useApi<Status>("/api/bot-export");
  const [path, setPath] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [failure, setFailure] = useState("");

  useEffect(() => {
    if (data) setPath(data.path ?? "");
  }, [data]);

  const run = async () => {
    setBusy(true);
    setFailure("");
    setMessage("");
    try {
      if (path.trim() !== (data?.path ?? "")) await postJson("/api/bot-export", { path }, "PATCH");
      const result = await postJson<{
        trades: number;
        notTaken: number;
        executions: number;
        images: number;
      }>("/api/bot-export", {});
      setMessage(
        `Exportado: ${result.trades} trades, ${result.notTaken} setups no tomados, ${result.executions} ejecuciones y ${result.images} imágenes.`,
      );
      refresh();
    } catch (cause) {
      setFailure(cause instanceof Error ? cause.message : "No se ha podido exportar.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Bot className="h-3.5 w-3.5" aria-hidden="true" />
          Exportar para el bot
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        <p className="text-muted-foreground">
          Escribe en la carpeta del bot todo tu histórico: trades.csv, ejecuciones.csv, reglas.csv,
          un LEEME y una carpeta por trade con sus capturas. Incluye los setups no tomados de
          «Trades perdidos». Se sobrescribe entera cada vez; cada trade tiene un id fijo.
        </p>
        <div className="space-y-1.5">
          <Label htmlFor="bot-export-path">Carpeta de la exportación (en este PC)</Label>
          <Input
            id="bot-export-path"
            value={path}
            placeholder="C:\Users\USUARIO\Documents\...\gxt_research\data\journal\exportacion"
            onChange={(event) => setPath(event.target.value)}
            spellCheck={false}
          />
        </div>
        <Button disabled={busy || !path.trim()} onClick={() => void run()}>
          {busy ? "Exportando…" : "Exportar ahora"}
        </Button>
        {data?.last && !message && (
          <p className="text-xs text-muted-foreground">
            Última exportación: {new Date(data.last.at).toLocaleString("es-ES")} ·{" "}
            {data.last.trades} trades · {data.last.skipped} no tomados.
          </p>
        )}
        {message && (
          <p role="status" className="text-xs text-muted-foreground">
            {message}
          </p>
        )}
        {failure && (
          <p role="alert" className="text-xs text-destructive">
            {failure}
          </p>
        )}
      </CardContent>
    </Card>
  );
}
