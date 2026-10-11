"use client";
import { OptionSelect } from "@/components/ui/option-select";
import { Checkbox } from "@/components/ui/checkbox";

import type { AnalysisFilters, FilterKey } from "@luxalgo/journal-core";
import { useApi } from "@/lib/use-api";
import { MonetaryField } from "./privacy";
import { ChevronDown, CircleHelp } from "lucide-react";
import { HoverHint } from "./ui/tooltip";
import { DatePicker } from "./ui/date-picker";
const FIELD_HINTS: Record<string, string> = {
  Desde:
    "Primera fecha incluida. Los trades cerrados usan su día de cierre; los abiertos, su día de apertura.",
  Hasta: "Última fecha incluida. Las fechas siguen la zona horaria del journal.",
  Estrategia:
    "Incluye los trades asignados a este playbook. «Todos» incluye también los trades sin playbook.",
  "Símbolos (separados por comas)":
    "Incluye estos símbolos. Separa varios con comas, por ejemplo MNQ, MES.",
  "Excluir símbolos": "Oculta estos símbolos de los resultados. Separa varios con comas.",
  "Etiquetas requeridas (separadas por comas)":
    "Filtra por las etiquetas guardadas en tus trades. Separa varias con comas.",
  "Errores requeridos": "Filtra por los errores de trading registrados. Separa varios con comas.",
  "Estado de revisión":
    "Busca los trades que has marcado como revisados, o los que faltan por revisar.",
  "R realizado": "Beneficio o pérdida del trade expresado como múltiplo del riesgo inicial.",
  "R planificado": "La recompensa planificada respecto al riesgo inicial del trade.",
  "Minutos en el trade": "Tiempo entre la apertura y el cierre del trade, en minutos.",
};
export const fieldClass = "h-9 w-full min-w-0 rounded-md border bg-background px-2 text-sm";
export function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="journal-filter-field grid min-w-0 gap-1 text-xs text-muted-foreground">
      <span className="flex items-center gap-1.5">
        {label}
        {FIELD_HINTS[label.split(" · ")[0]!] && (
          <HoverHint heading={label} content={FIELD_HINTS[label.split(" · ")[0]!]}>
            <span
              tabIndex={0}
              aria-label={`Sobre ${label}`}
              className="inline-flex cursor-help rounded-sm text-muted-foreground/70 outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <CircleHelp aria-hidden="true" className="h-3 w-3" />
            </span>
          </HoverHint>
        )}
      </span>
      {children}
    </label>
  );
}
export function FilterFields({
  value,
  onChange,
}: {
  value: AnalysisFilters;
  onChange: (v: AnalysisFilters) => void;
}) {
  const { data: accounts } = useApi<{
    accounts: { id: string; name: string; archivedAt: string | null }[];
  }>("/api/accounts");
  const { data: playbooks } = useApi<{ playbooks: { id: string; name: string }[] }>(
    "/api/playbooks",
  );
  const set = (key: FilterKey, v: string) => onChange({ ...value, [key]: v });
  const input = (key: FilterKey, label: string, type = "text") => (
    <Field key={key} label={label}>
      <MonetaryField sensitive={/^(entry|exit|pnl)(Min|Max)$/.test(key)}>
        {type === "date" ? (
          <DatePicker
            value={value[key] ?? ""}
            onValueChange={(next) => set(key, next)}
            label={label}
          />
        ) : (
          <input
            className={fieldClass}
            aria-label={label}
            type={type}
            step={type === "number" ? "any" : undefined}
            value={value[key] ?? ""}
            onChange={(e) => set(key, e.target.value)}
          />
        )}
      </MonetaryField>
    </Field>
  );
  const select = (key: FilterKey, label: string, choices: [string, string][]) => (
    <Field key={key} label={label}>
      <span className="journal-filter-select relative block min-w-0">
        <OptionSelect
          className={fieldClass}
          value={value[key] ?? ""}
          onValueChange={(next) => set(key, next)}
        >
          <option value="">Todos</option>
          {choices.map(([v, l]) => (
            <option key={v} value={v}>
              {l}
            </option>
          ))}
        </OptionSelect>
      </span>
    </Field>
  );
  return (
    <div className="journal-filter-fields space-y-5">
      <div className="grid grid-cols-1 gap-3 min-[420px]:grid-cols-2 md:grid-cols-3">
        {input("from", "Desde", "date")}
        {input("to", "Hasta", "date")}
        {select(
          "playbookId",
          "Estrategia",
          (playbooks?.playbooks ?? []).map((p) => [p.id, p.name]),
        )}
        {input("symbol", "Símbolos (separados por comas)")}
        {input("excludeSymbol", "Excluir símbolos")}
        {input("tag", "Etiquetas requeridas (separadas por comas)")}
        {input("mistake", "Errores requeridos")}
        {select("direction", "Dirección", [
          ["long", "Long"],
          ["short", "Short"],
        ])}
        {select("status", "Resultado", [
          ["closed", "Todos los cerrados"],
          ["open", "Abiertos"],
          ["win", "Win"],
          ["loss", "Loss"],
          ["breakeven", "Breakeven"],
        ])}
        {select("reviewed", "Estado de revisión", [
          ["yes", "Revisados"],
          ["no", "Sin revisar"],
        ])}
        {select("assetClass", "Tipo de activo", [
          ["equity", "Acciones"],
          ["futures", "Futuros"],
          ["forex", "Forex"],
          ["option", "Opciones"],
          ["crypto", "Cripto"],
          ["cfd", "CFD"],
          ["other", "Otros"],
        ])}
      </div>
      <fieldset className="journal-filter-accounts rounded-lg border p-3">
        <legend className="px-1 text-xs text-muted-foreground">
          Cuentas · si no marcas ninguna, se incluyen todas
        </legend>
        <div className="flex flex-wrap gap-3">
          {accounts?.accounts
            .filter((a) => !a.archivedAt)
            .map((a) => (
              <label key={a.id} className="journal-filter-choice flex items-center gap-2 text-xs">
                <Checkbox
                  checked={(value.accounts ?? "").split(",").includes(a.id)}
                  onCheckedChange={(checked) => {
                    const ids = new Set((value.accounts ?? "").split(",").filter(Boolean));
                    if (checked === true) ids.add(a.id);
                    else ids.delete(a.id);
                    set("accounts", [...ids].join(","));
                  }}
                />
                {a.name}
              </label>
            ))}
        </div>
      </fieldset>
      <details className="journal-filter-advanced">
        <summary className="flex cursor-pointer items-center justify-between gap-3 text-sm">
          <span>Tamaño, precio, riesgo y tiempo</span>
          <ChevronDown aria-hidden="true" className="h-4 w-4 shrink-0 text-muted-foreground" />
        </summary>
        <div className="journal-filter-advanced-grid mt-3 grid grid-cols-1 gap-3 min-[420px]:grid-cols-2 md:grid-cols-4">
          {(
            [
              ["quantity", "Cantidad total de entrada"],
              ["entry", "Precio de entrada"],
              ["exit", "Precio de salida"],
              ["duration", "Minutos en el trade"],
              ["r", "R realizado"],
              ["plannedR", "R planificado"],
              ["pnl", "P&L neto"],
              ["rating", "Valoración"],
            ] as const
          ).flatMap(([k, l]) => [
            input(`${k}Min` as FilterKey, `${l} · min`, "number"),
            input(`${k}Max` as FilterKey, `${l} · max`, "number"),
          ])}
          {input("entryAfter", "Entrada después de", "time")}
          {input("entryBefore", "Entrada antes de", "time")}
          {input("exitAfter", "Salida después de", "time")}
          {input("exitBefore", "Salida antes de", "time")}
        </div>
        <div className="journal-filter-weekdays mt-3 flex flex-wrap gap-2">
          {["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"].map((day, i) => (
            <label key={day} className="journal-filter-choice flex items-center gap-2 text-xs">
              <Checkbox
                checked={(value.weekdays ?? "").split(",").includes(String(i))}
                onCheckedChange={(checked) => {
                  const days = new Set((value.weekdays ?? "").split(",").filter(Boolean));
                  if (checked === true) days.add(String(i));
                  else days.delete(String(i));
                  set("weekdays", [...days].join(","));
                }}
              />
              {day}
            </label>
          ))}
        </div>
      </details>
    </div>
  );
}
