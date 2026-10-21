/** Puntos ganados o perdidos por contrato (salida media − entrada media, según la dirección). */
export const tradePoints = (
  direction: string,
  avgEntry: number,
  avgExit: number | null | undefined,
): number | null =>
  avgExit === null || avgExit === undefined || !Number.isFinite(avgExit)
    ? null
    : (avgExit - avgEntry) * (direction === "short" ? -1 : 1);

export const fmtPoints = (points: number | null): string => {
  if (points === null) return "–";
  const rounded = Math.round(points * 100) / 100;
  const text = Math.abs(rounded).toLocaleString("es-ES", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  return `${rounded > 0 ? "+" : rounded < 0 ? "−" : ""}${text} pts`;
};
