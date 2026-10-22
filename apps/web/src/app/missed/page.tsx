"use client";
import { OptionSelect } from "@/components/ui/option-select";
import { Checkbox } from "@/components/ui/checkbox";

import { Suspense, useState } from "react";
import { FilterBar } from "@/components/filter-bar";
import { Field, fieldClass } from "@/components/filter-fields";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { RichEditor, Markdown } from "@/components/rich-editor";
import { Attachments } from "@/components/attachments";
import { ReviewExport } from "@/components/review-export";
import { MonetaryValue, MonetaryField } from "@/components/privacy";
import { useApi, postJson } from "@/lib/use-api";
import { PsychCard } from "@/components/psych-card";
import { toWallTime } from "@/components/edit-executions";
import { parsePsych } from "@/lib/psychology";
import { SETUP_GROUPS, SETUP_TEXT_FIELDS } from "@/lib/setup";
import { useJournalTimeZone } from "@/lib/journal-timezone";
import { parseTimestamp } from "@luxalgo/journal-importers";
import { formatTimestamp } from "@/lib/timezone";
import { Crosshair } from "lucide-react";
interface Missed {
  id: string;
  symbol: string;
  direction: string;
  observedAt: string;
  entry: number | null;
  stop: number | null;
  target: number | null;
  playbookId: string | null;
  notes: string;
  archivedAt: string | null;
  setupJson: string | null;
}
// Las horas se escriben en la zona del journal (Nueva York), no en la del PC.
const blank = (timeZone: string) => ({
  symbol: "",
  direction: "long",
  observedAt: toWallTime(new Date().toISOString(), timeZone).slice(0, 16),
  entry: "",
  stop: "",
  target: "",
  playbookId: "",
  notes: "",
});
export default function MissedPage() {
  return (
    <Suspense>
      <Missed />
    </Suspense>
  );
}
function Missed() {
  const { data, error, refresh } = useApi<{ trades: Missed[] }>("/api/workspace/missed"),
    { data: books } = useApi<{ playbooks: { id: string; name: string }[] }>("/api/playbooks");
  const [open, setOpen] = useState(false),
    [editing, setEditing] = useState<string | null>(null),
    timeZone = useJournalTimeZone() ?? "America/New_York",
    [draft, setDraft] = useState(() => blank("America/New_York")),
    [search, setSearch] = useState(""),
    [archived, setArchived] = useState(false),
    [failure, setFailure] = useState(""),
    [busy, setBusy] = useState(false);
  function edit(t?: Missed) {
    setEditing(t?.id ?? null);
    setDraft(
      t
        ? {
            symbol: t.symbol,
            direction: t.direction,
            observedAt: toWallTime(t.observedAt, timeZone).slice(0, 16),
            entry: t.entry?.toString() ?? "",
            stop: t.stop?.toString() ?? "",
            target: t.target?.toString() ?? "",
            playbookId: t.playbookId ?? "",
            notes: t.notes,
          }
        : blank(timeZone),
    );
    setFailure("");
    setOpen(true);
  }
  const rows =
    data?.trades.filter(
      (t) =>
        Boolean(t.archivedAt) === archived &&
        `${t.symbol} ${t.notes}`.toLowerCase().includes(search.toLowerCase()),
    ) ?? [];
  const formField = (
    key: "symbol" | "observedAt" | "entry" | "stop" | "target",
    label: string,
    type = "text",
  ) => (
    <Field label={label}>
      <MonetaryField sensitive={type === "number"}>
        <input
          className={fieldClass}
          type={type}
          step={type === "number" ? "any" : undefined}
          value={draft[key]}
          onChange={(e) => setDraft({ ...draft, [key]: e.target.value })}
        />
      </MonetaryField>
    </Field>
  );
  return (
    <div>
      <FilterBar
        title="Trades perdidos"
        actions={
          <Button size="sm" onClick={() => edit()}>
            Registrar oportunidad
          </Button>
        }
      />
      <div className="space-y-4 p-4">
        <p className="text-sm text-muted-foreground">
          Apunta los setups que viste pero no entraste. Estas observaciones nunca cuentan en tu
          número de trades, tu P&L ni tu winrate.
        </p>
        <div className="flex flex-wrap items-center gap-4">
          <input
            aria-label="Buscar trades perdidos"
            className={`${fieldClass} max-w-sm`}
            placeholder="Buscar símbolo o notas"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <label className="flex items-center gap-2 text-sm">
            <Checkbox
              checked={archived}
              onCheckedChange={(checked) => setArchived(checked === true)}
            />
            Mostrar archivados
          </label>
        </div>
        {(error || failure) && (
          <p role="alert" className="text-sm text-destructive">
            {error || failure}
          </p>
        )}
        <div className="grid gap-4 lg:grid-cols-2">
          {rows.map((t) => (
            <Card key={t.id}>
              <CardHeader>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <CardTitle>
                    {t.symbol} · {t.direction}
                  </CardTitle>
                  <div className="flex gap-2">
                    <Button variant="ghost" size="sm" onClick={() => edit(t)}>
                      Editar
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={async () => {
                        try {
                          await postJson(
                            "/api/workspace/missed",
                            { id: t.id, restore: !!t.archivedAt },
                            "DELETE",
                          );
                          refresh();
                        } catch (e) {
                          setFailure(String(e));
                        }
                      }}
                    >
                      {t.archivedAt ? "Restaurar" : "Archivar"}
                    </Button>
                  </div>
                </div>
                <p className="text-xs text-muted-foreground">
                  {formatTimestamp(t.observedAt, timeZone)} ·{" "}
                  {books?.playbooks.find((b) => b.id === t.playbookId)?.name ?? "Sin estrategia"}
                </p>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex flex-wrap gap-5 text-sm">
                  {[
                    ["Entrada", t.entry],
                    ["Stop", t.stop],
                    ["Objetivo", t.target],
                  ].map(([label, value]) => (
                    <span key={label}>
                      <span className="text-muted-foreground">{label}: </span>
                      <MonetaryValue>{value ?? "-"}</MonetaryValue>
                    </span>
                  ))}
                </div>
                <Markdown>{t.notes || "Aún sin revisión."}</Markdown>
                <ReviewExport
                  containsFinancialData
                  document={{
                    title: `Oportunidad perdida · ${t.symbol}`,
                    subtitle: `${t.direction} · ${t.observedAt}`,
                    lines: [
                      "Solo observación: no hay trade ejecutado ni P&L real.",
                      `Entrada planificada: ${t.entry ?? "-"} | Stop: ${t.stop ?? "-"} | Objetivo: ${t.target ?? "-"}`,
                      "",
                      t.notes,
                    ],
                  }}
                />
                <Attachments type="missed" id={t.id} />
                <PsychCard
                  key={`setup-${t.id}`}
                  title="Setup"
                  description="El motivo de no entrar va en la revisión de arriba. Va en la exportación para el bot como setup no tomado."
                  groups={SETUP_GROUPS}
                  initial={parsePsych(t.setupJson)}
                  url={`/api/missed/${encodeURIComponent(t.id)}`}
                  method="PATCH"
                  field="setup"
                  textFields={SETUP_TEXT_FIELDS}
                  notePlaceholder={null}
                  icon={<Crosshair className="h-3.5 w-3.5" aria-hidden="true" />}
                />
              </CardContent>
            </Card>
          ))}
        </div>
        {data && !rows.length && (
          <p className="py-16 text-center text-sm text-muted-foreground">
            Aún no hay oportunidades{archived ? " archivadas" : ""} aquí.
          </p>
        )}
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
            <DialogHeader>
              <DialogTitle>
                {editing ? "Editar oportunidad" : "Registrar una oportunidad perdida"}
              </DialogTitle>
            </DialogHeader>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {formField("symbol", "Símbolo")}
              <Field label="Dirección">
                <OptionSelect
                  className={fieldClass}
                  value={draft.direction}
                  onValueChange={(next) => setDraft({ ...draft, direction: next })}
                >
                  <option value="long">Long</option>
                  <option value="short">Short</option>
                </OptionSelect>
              </Field>
              {formField(
                "observedAt",
                `Vista a las (${timeZone === "America/New_York" ? "hora de Nueva York" : timeZone})`,
                "datetime-local",
              )}
              <Field label="Estrategia">
                <OptionSelect
                  className={fieldClass}
                  value={draft.playbookId}
                  onValueChange={(next) => setDraft({ ...draft, playbookId: next })}
                >
                  <option value="">Sin estrategia</option>
                  {books?.playbooks.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.name}
                    </option>
                  ))}
                </OptionSelect>
              </Field>
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              {formField("entry", "Entrada planificada", "number")}
              {formField("stop", "Stop planificado", "number")}
              {formField("target", "Objetivo planificado", "number")}
            </div>
            <RichEditor
              defaultMode="edit"
              value={draft.notes}
              onChange={(notes) => setDraft({ ...draft, notes })}
              placeholder="¿Por qué no entraste? ¿Qué harás distinto la próxima vez?"
            />
            {failure && (
              <p role="alert" className="text-xs text-destructive">
                {failure}
              </p>
            )}
            <Button
              disabled={busy || !draft.symbol.trim() || !draft.observedAt}
              onClick={async () => {
                setBusy(true);
                try {
                  await postJson("/api/workspace/missed", {
                    ...draft,
                    id: editing,
                    observedAt:
                      parseTimestamp(draft.observedAt, timeZone) ??
                      new Date(draft.observedAt).toISOString(),
                    entry: draft.entry === "" ? null : Number(draft.entry),
                    stop: draft.stop === "" ? null : Number(draft.stop),
                    target: draft.target === "" ? null : Number(draft.target),
                  });
                  setOpen(false);
                  refresh();
                  setFailure("");
                } catch (e) {
                  setFailure(e instanceof Error ? e.message : "No se pudo guardar.");
                } finally {
                  setBusy(false);
                }
              }}
            >
              Guardar oportunidad
            </Button>
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );
}
