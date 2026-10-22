"use client";

import { useEffect, useState } from "react";
import { Bot } from "lucide-react";
import { Button } from "./ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "./ui/card";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import { postJson, useApi } from "@/lib/use-api";

interface Selection {
  accounts: string[];
  missedPlaybooks: string[];
}
interface Status {
  path: string | null;
  last: { at: string; trades: number; skipped: number } | null;
  selection: Selection;
}

/** Ajustes → Exportar para el bot. */
export function BotExportCard() {
  const { data, refresh } = useApi<Status>("/api/bot-export");
  const [path, setPath] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [failure, setFailure] = useState("");
  const [selection, setSelection] = useState<Selection>({ accounts: [], missedPlaybooks: [] });
  const { data: accountData } = useApi<{
    accounts: { id: string; name: string; archivedAt: string | null }[];
  }>("/api/accounts");
  const { data: playbookData } = useApi<{ playbooks: { id: string; name: string }[] }>(
    "/api/playbooks",
  );

  useEffect(() => {
    if (!data) return;
    setPath(data.path ?? "");
    setSelection(data.selection);
  }, [data]);

  const toggle = async (list: keyof Selection, id: string) => {
    const current = selection[list];
    const next = {
      ...selection,
      [list]: current.includes(id) ? current.filter((item) => item !== id) : [...current, id],
    };
    setSelection(next);
    try {
      await postJson("/api/bot-export", { selection: next }, "PATCH");
    } catch (cause) {
      setFailure(cause instanceof Error ? cause.message : "No se ha podido guardar la selección.");
    }
  };
  const checkbox = (list: keyof Selection, id: string, label: string) => (
    <label key={id || "none"} className="flex items-center gap-2">
      <input
        type="checkbox"
        checked={selection[list].includes(id)}
        onChange={() => void toggle(list, id)}
      />
      {label}
    </label>
  );

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
          Escribe en la carpeta del bot los trades de las cuentas que marques: trades.csv,
          ejecuciones.csv, reglas.csv, un LEEME y una carpeta por trade con sus capturas, más los
          setups no tomados de los playbooks marcados. Se sobrescribe entera cada vez (lo que
          desmarques desaparece de la carpeta) y cada trade tiene un id fijo.
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
        <div className="grid gap-4 sm:grid-cols-2">
          <fieldset className="space-y-1.5">
            <legend className="mb-1 text-xs text-muted-foreground">
              Cuentas que verá el bot (las nuevas salen desmarcadas)
            </legend>
            {(accountData?.accounts ?? [])
              .filter((account) => !account.archivedAt)
              .map((account) => checkbox("accounts", account.id, account.name))}
            {accountData && !accountData.accounts.length && (
              <p className="text-xs text-muted-foreground">Aún no tienes cuentas.</p>
            )}
          </fieldset>
          <fieldset className="space-y-1.5">
            <legend className="mb-1 text-xs text-muted-foreground">
              Setups no tomados (Trades perdidos) de estos playbooks
            </legend>
            {(playbookData?.playbooks ?? []).map((book) =>
              checkbox("missedPlaybooks", book.id, book.name),
            )}
            {checkbox("missedPlaybooks", "", "Sin playbook")}
          </fieldset>
        </div>
        {selection.accounts.length === 0 && (
          <p className="text-xs text-muted-foreground">
            Marca al menos una cuenta: si no, la exportación saldrá sin trades.
          </p>
        )}
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
