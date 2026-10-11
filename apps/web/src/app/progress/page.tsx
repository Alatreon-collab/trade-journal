"use client";
import { DatePicker } from "@/components/ui/date-picker";
import { OptionSelect } from "@/components/ui/option-select";
import { Checkbox } from "@/components/ui/checkbox";

import { HoverHint } from "@/components/ui/tooltip";
import { Suspense, useState } from "react";
import { FilterBar } from "@/components/filter-bar";
import { Field, fieldClass } from "@/components/filter-fields";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ReviewExport } from "@/components/review-export";
import { useApi, postJson } from "@/lib/use-api";
import { scheduledRules, progressScore, type Routine, type RoutineCheck } from "@/lib/progress";
// Los valores se guardan en inglés en la base de datos; solo se traduce lo que se muestra.
const STAGES = ["Before trading", "During trading", "After trading"];
const STAGE_LABELS: Record<string, string> = {
  "Before trading": "Antes de operar",
  "During trading": "Mientras operas",
  "After trading": "Después de operar",
};
const stageLabel = (stage: string) => STAGE_LABELS[stage] ?? stage;
export default function ProgressPage() {
  return (
    <Suspense>
      <Progress />
    </Suspense>
  );
}
function Progress() {
  const { data, error, refresh } = useApi<{
    rules: Routine[];
    checks: RoutineCheck[];
    today: string;
  }>("/api/workspace/progress");
  const [date, setDate] = useState(""),
    [open, setOpen] = useState(false),
    [title, setTitle] = useState(""),
    [stage, setStage] = useState(STAGES[0]!),
    [weekdays, setWeekdays] = useState([1, 2, 3, 4, 5]),
    [failure, setFailure] = useState(""),
    [busy, setBusy] = useState(false);
  const selected = date || data?.today || "",
    rules = data ? scheduledRules(data.rules, selected) : [],
    score = data ? progressScore(data.rules, data.checks, selected) : null;
  const days = data
    ? Array.from({ length: 91 }, (_, i) => {
        const d = new Date(`${data.today}T12:00:00Z`);
        d.setUTCDate(d.getUTCDate() - 90 + i);
        const key = d.toISOString().slice(0, 10);
        return { date: key, ...progressScore(data.rules, data.checks, key) };
      })
    : [];
  async function act(body: unknown, method: "POST" | "DELETE" = "POST") {
    setBusy(true);
    try {
      await postJson("/api/workspace/progress", body, method);
      setFailure("");
      refresh();
      return true;
    } catch (e) {
      setFailure(e instanceof Error ? e.message : "No se pudo guardar.");
      return false;
    } finally {
      setBusy(false);
    }
  }
  return (
    <div>
      <FilterBar
        title="Progreso"
        actions={
          <Button size="sm" onClick={() => setOpen(true)}>
            Añadir rutina
          </Button>
        }
      />
      <div className="space-y-4 p-4">
        <p className="text-sm text-muted-foreground">
          Construye un día de trading repetible. Las rutinas se siguen al margen de los filtros y
          del beneficio.
        </p>
        {(error || failure) && (
          <p role="alert" className="text-sm text-destructive">
            {error || failure}
          </p>
        )}
        <Card>
          <CardContent className="flex flex-wrap items-center justify-between gap-6 py-6">
            <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
              <div>
                <p className="text-xs text-muted-foreground">Cumplimiento del día</p>
                <p className="text-4xl font-semibold">
                  {score?.score == null ? "-" : `${Math.round(score.score * 100)}%`}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {score?.completed ?? 0} de {score?.total ?? 0} rutinas programadas
                </p>
              </div>
              <Field label="Fecha a revisar">
                <DatePicker
                  label="Fecha de progreso"
                  value={selected}
                  max={data?.today}
                  onValueChange={setDate}
                />
              </Field>
            </div>
            <ReviewExport
              document={{
                title: `Revisión de rutinas · ${selected}`,
                lines: [
                  `Completadas: ${score?.completed ?? 0}/${score?.total ?? 0}`,
                  ...rules.map(
                    (r) =>
                      `${data?.checks.some((c) => c.date === selected && c.ruleId === r.id && c.done) ? "[hecho]" : "[ ]"} ${stageLabel(r.stage)}: ${r.title}`,
                  ),
                ],
              }}
            />
          </CardContent>
        </Card>
        <div className="grid gap-4 xl:grid-cols-3">
          {STAGES.map((s) => (
            <Card key={s}>
              <CardHeader>
                <CardTitle>{stageLabel(s)}</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {rules
                  .filter((r) => r.stage === s)
                  .map((r) => (
                    <div key={r.id} className="flex items-start justify-between gap-2">
                      <label className="flex items-start gap-3 text-sm">
                        <Checkbox
                          className="mt-1"
                          checked={
                            data?.checks.some(
                              (c) => c.ruleId === r.id && c.date === selected && c.done,
                            ) ?? false
                          }
                          disabled={busy || selected > (data?.today ?? "")}
                          onCheckedChange={(checked) =>
                            void act({ ruleId: r.id, date: selected, done: checked === true })
                          }
                        />
                        {r.title}
                      </label>
                      {!r.archivedAt && (
                        <button
                          className="text-xs text-muted-foreground underline"
                          onClick={() => {
                            if (
                              confirm(`¿Archivar «${r.title}»? Los días anteriores se conservan.`)
                            )
                              void act({ id: r.id }, "DELETE");
                          }}
                        >
                          Archivar
                        </button>
                      )}
                    </div>
                  ))}
                {!rules.some((r) => r.stage === s) && (
                  <p className="text-xs text-muted-foreground">No hay rutinas programadas.</p>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
        <Card>
          <CardHeader>
            <CardTitle>Últimas 13 semanas</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-flow-col grid-rows-7 gap-1 overflow-x-auto">
              {days.map((d) => (
                <HoverHint
                  key={d.date}
                  heading={d.date}
                  content={`${d.completed} de ${d.total} rutinas completadas`}
                >
                  <button
                    key={d.date}
                    aria-label={`${d.date}: ${d.completed}/${d.total} completadas`}
                    onClick={() => setDate(d.date)}
                    className={`min-h-7 min-w-7 rounded border ${selected === d.date ? "border-foreground" : "border-transparent"}`}
                    style={{
                      background:
                        d.score === null
                          ? "var(--muted)"
                          : `color-mix(in srgb, var(--brand) ${15 + d.score * 75}%, var(--card))`,
                    }}
                  />
                </HoverHint>
              ))}
            </div>
            <p className="mt-3 text-xs text-muted-foreground">
              Cuanto más brillante el cuadro, mayor el cumplimiento. Gris significa que no había
              rutinas programadas. Pulsa un día para revisarlo. Las rutinas nuevas empiezan hoy.
            </p>
          </CardContent>
        </Card>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Añadir una rutina diaria</DialogTitle>
            </DialogHeader>
            <Field label="Rutina">
              <input
                className={fieldClass}
                value={title}
                placeholder="Revisar el calendario económico"
                onChange={(e) => setTitle(e.target.value)}
              />
            </Field>
            <Field label="Cuándo">
              <OptionSelect
                className={fieldClass}
                value={stage}
                onValueChange={(next) => setStage(next)}
              >
                {STAGES.map((s) => (
                  <option key={s} value={s}>
                    {stageLabel(s)}
                  </option>
                ))}
              </OptionSelect>
            </Field>
            <div className="flex flex-wrap gap-3">
              {["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"].map((day, i) => (
                <label key={day} className="flex items-center gap-1 text-xs">
                  <Checkbox
                    checked={weekdays.includes(i)}
                    onCheckedChange={(checked) =>
                      setWeekdays(
                        checked === true ? [...weekdays, i] : weekdays.filter((n) => n !== i),
                      )
                    }
                  />
                  {day}
                </label>
              ))}
            </div>
            {failure && (
              <p role="alert" className="text-xs text-destructive">
                {failure}
              </p>
            )}
            <Button
              disabled={!title.trim() || !weekdays.length || busy}
              onClick={async () => {
                if (await act({ title, stage, weekdays })) {
                  setOpen(false);
                  setTitle("");
                }
              }}
            >
              Añadir rutina
            </Button>
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );
}
