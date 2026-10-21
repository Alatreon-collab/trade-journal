"use client";

import { useApi } from "./use-api";

/** Zona horaria del journal (Ajustes), para que los gráficos no muestren la hora en UTC. */
export const useJournalTimeZone = (): string | null =>
  useApi<{ timeZone: string }>("/api/settings").data?.timeZone ?? null;

interface WithRenderer {
  renderer: { applyConfig(config: unknown): unknown };
}

/** Pone el eje de tiempo del gráfico en la zona horaria del journal. */
export function applyChartTimeZone(chart: unknown, timeZone: string | null): void {
  if (!chart || !timeZone) return;
  try {
    (chart as WithRenderer).renderer.applyConfig({ timeScale: { timezone: timeZone } });
  } catch {
    // Si el gráfico no lo admite, se queda en UTC.
  }
}
