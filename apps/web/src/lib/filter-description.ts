import type { AnalysisFilters } from "@luxalgo/journal-core";
const names: Record<string, string> = {
  accounts: "Cuentas",
  from: "Desde",
  to: "Hasta",
  symbol: "Símbolos",
  excludeSymbol: "Excluir símbolos",
  tag: "Etiquetas requeridas",
  mistake: "Errores requeridos",
  playbookId: "Estrategia",
  direction: "Dirección",
  status: "Resultado",
  assetClass: "Tipo de activo",
  reviewed: "Revisado",
  ratingMin: "Valoración mínima",
  ratingMax: "Valoración máxima",
  quantityMin: "Cantidad mínima",
  quantityMax: "Cantidad máxima",
  entryMin: "Precio de entrada mínimo",
  entryMax: "Precio de entrada máximo",
  exitMin: "Precio de salida mínimo",
  exitMax: "Precio de salida máximo",
  durationMin: "Minutos mínimos en el trade",
  durationMax: "Minutos máximos en el trade",
  rMin: "R realizado mínimo",
  rMax: "R realizado máximo",
  plannedRMin: "R planificado mínimo",
  plannedRMax: "R planificado máximo",
  pnlMin: "P&L mínimo",
  pnlMax: "P&L máximo",
  weekdays: "Días de entrada",
  entryAfter: "Entrada después de",
  entryBefore: "Entrada antes de",
  exitAfter: "Salida después de",
  exitBefore: "Salida antes de",
};
export function describeFilters(
  filters: AnalysisFilters,
  accounts: { id: string; name: string }[] = [],
  playbooks: { id: string; name: string }[] = [],
  privateMode = false,
) {
  return (
    Object.entries(filters)
      .filter(([, v]) => v)
      .map(([k, v]) => {
        let value = v;
        if (k === "accounts")
          value = v
            .split(",")
            .map((id) => accounts.find((a) => a.id === id)?.name ?? "Cuenta seleccionada")
            .join(", ");
        if (k === "playbookId")
          value = playbooks.find((p) => p.id === v)?.name ?? "Estrategia seleccionada";
        if (k === "weekdays")
          value = v
            .split(",")
            .map((d) => ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"][Number(d)] ?? d)
            .join(", ");
        if (privateMode && /^(entry|exit|pnl)(Min|Max)$/.test(k)) value = "••••";
        return `${names[k] ?? k}: ${value}`;
      })
      .join(" · ") || "Todos los trades"
  );
}
