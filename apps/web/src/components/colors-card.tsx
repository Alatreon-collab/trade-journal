"use client";

import { useEffect, useState } from "react";
import { Check } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "./ui/card";
import { COLORS_EVENT } from "./color-theme";
import { useTheme } from "./theme";
import { cn } from "@/lib/utils";
import { postJson, useApi } from "@/lib/use-api";
import {
  COLOR_PRESETS,
  CUSTOM_ID,
  DEFAULT_COLORS,
  DEFAULT_CUSTOM,
  resolveColors,
  type ColorSettings,
} from "@/lib/colors";

const Swatch = ({ color, label }: { color: string; label: string }) => (
  <span
    className="inline-block h-4 w-4 rounded-full border border-black/10"
    style={{ background: color }}
    title={label}
    aria-hidden="true"
  />
);

/** Ajustes → Colores: positivo, negativo y gráficos. */
export function ColorsCard() {
  const { data } = useApi<{ colors?: ColorSettings }>("/api/settings");
  const { theme } = useTheme();
  const mode = theme === "light" ? "light" : "dark";
  const [colors, setColors] = useState<ColorSettings>(DEFAULT_COLORS);
  const [custom, setCustom] = useState(DEFAULT_CUSTOM);
  const [status, setStatus] = useState("");

  useEffect(() => {
    if (!data?.colors) return;
    setColors(data.colors);
    if (data.colors.custom) setCustom(data.colors.custom);
  }, [data]);

  const choose = async (next: ColorSettings) => {
    setColors(next);
    window.dispatchEvent(new CustomEvent(COLORS_EVENT, { detail: next }));
    setStatus("Guardando…");
    try {
      await postJson("/api/settings", { colors: next }, "PATCH");
      setStatus("Guardado ✓");
    } catch (e) {
      setStatus(e instanceof Error ? e.message : "No se han podido guardar los colores");
    }
  };

  const options = [
    ...COLOR_PRESETS.map((preset) => ({
      id: preset.id,
      label: preset.label,
      description: preset.description,
      settings: { preset: preset.id } as ColorSettings,
    })),
    {
      id: CUSTOM_ID,
      label: "Personalizado",
      description: "Eliges tú los tres colores (iguales en modo claro y oscuro).",
      settings: { preset: CUSTOM_ID, custom } as ColorSettings,
    },
  ];
  const current = resolveColors(colors, mode);

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between space-y-0">
        <CardTitle>Colores</CardTitle>
        <span role="status" className="text-xs text-muted-foreground">
          {status}
        </span>
      </CardHeader>
      <CardContent className="space-y-4 text-sm">
        <p className="text-muted-foreground">
          Colores de los resultados positivos y negativos y de los gráficos. El signo (+/−) y las
          etiquetas WIN/LOSS se mantienen siempre, así que no pierdes información.
        </p>

        <div className="grid gap-2 sm:grid-cols-2">
          {options.map((option) => {
            const selected = colors.preset === option.id;
            const set = resolveColors(option.settings, mode);
            return (
              <button
                key={option.id}
                type="button"
                aria-pressed={selected}
                onClick={() => void choose(option.settings)}
                className={cn(
                  "flex flex-col gap-1.5 rounded-lg border p-3 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                  selected ? "border-primary bg-accent" : "hover:bg-accent/60",
                )}
              >
                <span className="flex items-center gap-2 font-medium">
                  <Swatch color={set.profit} label="Positivo" />
                  <Swatch color={set.loss} label="Negativo" />
                  <Swatch color={set.accent} label="Gráficos" />
                  <span className="ml-1">{option.label}</span>
                  {selected && <Check className="ml-auto h-4 w-4" aria-hidden="true" />}
                </span>
                <span className="text-xs text-muted-foreground">{option.description}</span>
              </button>
            );
          })}
        </div>

        {colors.preset === CUSTOM_ID && (
          <div className="flex flex-wrap gap-4">
            {(
              [
                ["profit", "Positivo"],
                ["loss", "Negativo"],
                ["accent", "Gráficos"],
              ] as const
            ).map(([key, label]) => (
              <label key={key} className="flex items-center gap-2 text-xs text-muted-foreground">
                <input
                  type="color"
                  value={custom[key]}
                  onChange={(event) => setCustom({ ...custom, [key]: event.target.value })}
                  onBlur={() => void choose({ preset: CUSTOM_ID, custom })}
                  className="h-8 w-10 cursor-pointer rounded border bg-transparent"
                />
                {label}
              </label>
            ))}
          </div>
        )}

        <div className="flex flex-wrap items-center gap-4 rounded-lg border p-3">
          <span className="text-xs text-muted-foreground">Vista previa:</span>
          <span className="tnum font-medium" style={{ color: current.profit }}>
            +$250,00
          </span>
          <span className="tnum font-medium" style={{ color: current.loss }}>
            −$120,00
          </span>
          <span className="flex items-end gap-0.5" aria-hidden="true">
            {[10, 16, 8, 20, 13].map((h, i) => (
              <span
                key={i}
                className="w-2 rounded-sm"
                style={{ height: h, background: i === 2 ? current.loss : current.profitFill }}
              />
            ))}
          </span>
          <svg width="70" height="22" viewBox="0 0 70 22" aria-hidden="true">
            <polyline
              points="0,18 12,14 24,16 36,9 48,11 60,4 70,6"
              fill="none"
              stroke={current.accent}
              strokeWidth="2"
            />
          </svg>
        </div>
      </CardContent>
    </Card>
  );
}
