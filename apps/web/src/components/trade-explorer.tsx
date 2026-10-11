"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useMemo, useState } from "react";
import {
  clockLabel,
  plotTradePoints,
  type PlottedTrade,
  type TradeExplorerResponse,
  type TradeXAxis,
  type TradeYAxis,
} from "@/lib/trade-explorer";
import { useApi } from "@/lib/use-api";
import { ReportMarketEstimates } from "./report-market-estimates";
import { MonetaryValue } from "./privacy";
import { fmtMoney } from "@/lib/utils";
import { Pnl } from "./pnl";
import { Button } from "./ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "./ui/card";
import { OptionSelect } from "./ui/option-select";
import { Skeleton } from "./ui/skeleton";

const TradeScatter = dynamic(
  () => import("./charts/trade-scatter").then((module) => module.TradeScatter),
  {
    loading: () => (
      <div role="status" aria-label="Cargando gráfico de dispersión">
        <Skeleton className="h-80" />
      </div>
    ),
  },
);
const PAGE_SIZE = 25;
const detailHref = (key: string) => `/trades/${encodeURIComponent(key)}`;

export function TradeExplorer({ query }: { query: string }) {
  const { data, error, loading, refresh } = useApi<TradeExplorerResponse>(
    `/api/trade-explorer?${query}`,
  );
  const [x, setX] = useState<TradeXAxis>("durationMinutes");
  const [y, setY] = useState<TradeYAxis>("netPnl");
  const [selected, setSelected] = useState<PlottedTrade | null>(null);
  const [page, setPage] = useState(0);
  const [tableOpen, setTableOpen] = useState(false);
  const points = useMemo(() => plotTradePoints(data?.points ?? [], x, y), [data, x, y]);
  const date = useMemo(
    () =>
      new Intl.DateTimeFormat("es-ES", {
        timeZone: data?.timeZone ?? "UTC",
        dateStyle: "medium",
        timeStyle: "short",
      }),
    [data?.timeZone],
  );
  if (loading && !data)
    return (
      <div role="status" aria-label="Cargando explorador de trades">
        <Skeleton className="h-96" />
      </div>
    );
  if (error || !data)
    return (
      <div role="alert" className="rounded-xl border p-5">
        <p className="text-sm text-destructive">
          {error ?? "No se pudo cargar el explorador de trades."}
        </p>
        <Button onClick={refresh} variant="outline" size="sm" className="mt-3">
          Reintentar
        </Button>
      </div>
    );
  const currency = data.currencies[0] ?? "USD";
  const excursion = x === "mae" || x === "mfe" || y === "mae" || y === "mfe";
  const blocked = (y !== "realizedR" || excursion) && data.currencies.length > 1;
  const xTitle =
    x === "durationMinutes"
      ? "Duración (minutos)"
      : x === "entryMinute"
        ? `Hora de entrada (${data.timeZone})`
        : `${x.toUpperCase()} estimado (${currency})`;
  const yTitle =
    y === "netPnl"
      ? `P&L neto (${currency})`
      : y === "realizedR"
        ? "R realizado"
        : `${y.toUpperCase()} estimado (${currency})`;
  const value = (point: PlottedTrade) =>
    y === "mae" || y === "mfe" ? (
      <MonetaryValue>{fmtMoney(point.y, currency)}</MonetaryValue>
    ) : y === "netPnl" ? (
      <Pnl value={point.y} currency={currency} />
    ) : (
      <span className="tabular-nums">
        {point.y > 0 ? "+" : ""}
        {point.y.toFixed(2)}R
      </span>
    );
  const xValue = (point: PlottedTrade) =>
    x === "mae" || x === "mfe" ? (
      <MonetaryValue>{fmtMoney(point.x, currency)}</MonetaryValue>
    ) : x === "entryMinute" ? (
      clockLabel(point.x)
    ) : (
      `${point.x.toLocaleString(undefined, { maximumFractionDigits: 2 })} min`
    );
  const pages = Math.ceil(points.length / PAGE_SIZE);
  const shownPage = Math.min(page, Math.max(0, pages - 1));
  const table = (
    <div className="space-y-3 px-4 pb-4">
      <div className="overflow-x-auto">
        <table className="w-full text-left text-xs">
          <caption className="pb-3 text-left text-muted-foreground">
            Los {points.length} trades comparables, del cierre más reciente al más antiguo. Cada
            enlace abre el trade original.
          </caption>
          <thead>
            <tr className="border-b">
              <th scope="col" className="py-2 pr-3">
                Trade / cierre
              </th>
              <th scope="col" className="px-2 text-right">
                {xTitle}
              </th>
              <th scope="col" className="pl-2 text-right">
                {yTitle}
              </th>
            </tr>
          </thead>
          <tbody>
            {points.slice(shownPage * PAGE_SIZE, (shownPage + 1) * PAGE_SIZE).map((point) => (
              <tr key={point.key} className="border-b last:border-0">
                <th scope="row" className="py-3 pr-3 font-normal">
                  <Link
                    href={detailHref(point.key)}
                    className="rounded underline underline-offset-4"
                  >
                    <span className="break-all font-medium">
                      {point.symbol} · {point.direction}
                    </span>
                    <span className="mt-1 block text-muted-foreground">
                      {date.format(new Date(point.closedAt))}
                    </span>
                  </Link>
                </th>
                <td className="px-2 text-right tabular-nums">{xValue(point)}</td>
                <td className="pl-2 text-right">{value(point)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {pages > 1 && (
        <div className="flex items-center justify-between gap-2">
          <Button
            size="sm"
            variant="outline"
            disabled={shownPage === 0}
            onClick={() => setPage(shownPage - 1)}
          >
            Anterior
          </Button>
          <p aria-live="polite" className="text-xs text-muted-foreground">
            Página {shownPage + 1} de {pages}
          </p>
          <Button
            size="sm"
            variant="outline"
            disabled={shownPage === pages - 1}
            onClick={() => setPage(shownPage + 1)}
          >
            Siguiente
          </Button>
        </div>
      )}
    </div>
  );
  return (
    <section className="space-y-4" aria-labelledby="trade-explorer-title" data-trade-explorer>
      <div>
        <h2 id="trade-explorer-title" className="text-lg font-semibold">
          Explorador de trades
        </h2>
        <p className="mt-1 text-xs text-muted-foreground">
          Compara trades individuales, no medias de grupos · Cuenta y filtros activos ·{" "}
          {data.timeZone}
        </p>
      </div>
      <ReportMarketEstimates
        points={data.points}
        currencies={data.currencies}
        onComplete={refresh}
      />
      <div className="flex flex-wrap gap-2" aria-label="Vistas predefinidas">
        {(
          [
            ["durationMinutes", "netPnl", "Tiempo en el trade"],
            ["mae", "netPnl", "MAE vs net P&L"],
            ["mfe", "netPnl", "MFE vs net P&L"],
            ["mae", "mfe", "MAE vs MFE"],
          ] as const
        ).map(([nextX, nextY, label]) => (
          <Button
            key={label}
            size="sm"
            variant={x === nextX && y === nextY ? "secondary" : "outline"}
            onClick={() => {
              setX(nextX);
              setY(nextY);
              setSelected(null);
              setPage(0);
            }}
          >
            {label}
          </Button>
        ))}
      </div>
      <Card className="min-w-0 overflow-hidden">
        <CardHeader>
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <CardTitle>
                {excursion
                  ? `${xTitle} vs ${yTitle}`
                  : `Resultados por ${x === "durationMinutes" ? "tiempo en el trade" : "hora de entrada"}`}
              </CardTitle>
              <p className="mt-2 text-xs text-muted-foreground">
                {blocked
                  ? `${data.points.length} trades cerrados`
                  : `${points.length} de ${data.points.length} trades cerrados comparables`}{" "}
                · Un punto por trade ·{" "}
                {excursion
                  ? "Excursiones brutas estimadas; P&L neto tras comisiones"
                  : "Tras comisiones"}
              </p>
            </div>
            <div className="flex w-full flex-wrap gap-3 sm:w-auto">
              <div className="min-w-0 flex-1 sm:w-44">
                <label
                  htmlFor="trade-x-axis"
                  className="mb-1.5 block text-xs text-muted-foreground"
                >
                  Eje X
                </label>
                <OptionSelect
                  id="trade-x-axis"
                  value={x}
                  onValueChange={(value) => {
                    setX(value as TradeXAxis);
                    setSelected(null);
                    setPage(0);
                  }}
                >
                  <option value="durationMinutes">Duración (minutos)</option>
                  <option value="entryMinute">Hora de entrada</option>
                  <option value="mae">MAE estimado</option>
                  <option value="mfe">MFE estimado</option>
                </OptionSelect>
              </div>
              <div className="min-w-0 flex-1 sm:w-44">
                <label
                  htmlFor="trade-y-axis"
                  className="mb-1.5 block text-xs text-muted-foreground"
                >
                  Eje Y
                </label>
                <OptionSelect
                  id="trade-y-axis"
                  value={y}
                  onValueChange={(value) => {
                    setY(value as TradeYAxis);
                    setSelected(null);
                    setPage(0);
                  }}
                >
                  <option value="netPnl">P&L neto</option>
                  <option value="realizedR">R realizado</option>
                  <option value="mae">MAE estimado</option>
                  <option value="mfe">MFE estimado</option>
                </OptionSelect>
              </div>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {data.points.length === 0 ? (
            <div className="py-10 text-center">
              <h3 className="font-medium">No hay trades cerrados en esta selección</h3>
              <p className="mt-2 text-sm text-muted-foreground">
                Cambia el rango de fechas o los filtros para explorar tu historial. Las posiciones
                abiertas no se incluyen.
              </p>
            </div>
          ) : blocked ? (
            <p role="note" className="rounded-lg bg-muted/30 p-4 text-sm text-muted-foreground">
              Estos trades usan divisas distintas ({data.currencies.join(", ")}). Selecciona cuentas
              con una sola divisa para los ejes en dinero, o usa Duración y R realizado para
              comparar resultados normalizados por riesgo. No se aplica conversión de divisas.
            </p>
          ) : (
            <>
              {points.length < data.points.length && (
                <p role="note" className="text-xs leading-relaxed text-muted-foreground">
                  {data.points.length - points.length} trades excluidos:{" "}
                  {y === "realizedR"
                    ? "la R realizada necesita un stop loss planificado válido y, si hace falta, el multiplicador del contrato; "
                    : ""}
                  {excursion
                    ? "el MAE/MFE necesita estimaciones guardadas y actualizadas con datos de mercado. "
                    : ""}
                  Ambos ejes necesitan valores y horas válidos.
                </p>
              )}
              {y === "realizedR" && (
                <p className="text-xs leading-relaxed text-muted-foreground">
                  R = P&L neto ÷ riesgo planificado según tu stop loss. Usa la entrada media
                  ponderada y la cantidad total de entrada; no mide el riesgo máximo dentro del
                  trade.
                </p>
              )}
              {points.length >= (excursion ? 1 : 8) ? (
                <>
                  <div className="flex flex-wrap items-center justify-between gap-3 text-xs text-muted-foreground">
                    <span>{yTitle}</span>
                    <span className="flex flex-wrap gap-x-4 gap-y-1">
                      <span>
                        <span aria-hidden="true" className="text-[var(--profit)]">
                          ●
                        </span>{" "}
                        P&L neto positivo
                      </span>
                      <span>
                        <span aria-hidden="true" className="text-[var(--loss)]">
                          ●
                        </span>{" "}
                        P&L neto negativo
                      </span>
                      <span>
                        <span aria-hidden="true">●</span> P&L neto cero
                      </span>
                    </span>
                  </div>
                  <TradeScatter
                    points={points}
                    x={x}
                    y={y}
                    currency={currency}
                    timeZone={data.timeZone}
                    onSelect={setSelected}
                  />
                  <p className="text-center text-xs text-muted-foreground">{xTitle}</p>
                  <p className="text-xs text-muted-foreground">
                    Selecciona un punto para ver su trade. Los puntos superpuestos se pueden abrir
                    uno a uno desde la tabla.
                  </p>
                  <div aria-live="polite">
                    {selected && (
                      <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border bg-muted/20 p-4">
                        <div>
                          <p className="text-sm font-medium break-all">
                            {selected.symbol} · {selected.direction} · {value(selected)}
                          </p>
                          <p className="mt-1 text-xs text-muted-foreground">
                            {xValue(selected)} · Cerrado {date.format(new Date(selected.closedAt))}
                          </p>
                        </div>
                        <div className="flex items-center gap-3">
                          <Link
                            href={detailHref(selected.key)}
                            className="rounded text-sm underline underline-offset-4"
                          >
                            Abrir trade ↗
                          </Link>
                          <Button size="sm" variant="ghost" onClick={() => setSelected(null)}>
                            Cerrar
                          </Button>
                        </div>
                      </div>
                    )}
                  </div>
                </>
              ) : (
                <p className="rounded-lg bg-muted/30 px-4 py-6 text-sm text-muted-foreground">
                  {points.length === 0
                    ? "Ningún trade tiene los datos necesarios para estos ejes. Prueba otro eje o ajusta los filtros."
                    : "Hay menos de 8 trades comparables. Revisa los valores exactos abajo o amplía los filtros para ver un gráfico útil."}
                </p>
              )}
              {points.length > 0 && points.length < 20 && (
                <p className="text-xs text-muted-foreground">
                  Muestra pequeña: toma con cautela cualquier patrón hasta tener más trades.
                </p>
              )}
            </>
          )}
        </CardContent>
      </Card>
      {!blocked &&
        points.length > 0 &&
        (points.length < 8 ? (
          <Card>
            <CardHeader>
              <CardTitle>Trades comparables</CardTitle>
            </CardHeader>
            {table}
          </Card>
        ) : (
          <details
            className="rounded-xl border bg-card"
            onToggle={(event) => setTableOpen(event.currentTarget.open)}
          >
            <summary className="cursor-pointer rounded-xl px-4 py-3 text-sm font-medium">
              Ver los {points.length} trades
            </summary>
            {tableOpen && table}
          </details>
        ))}
      <p className="text-xs leading-relaxed text-muted-foreground">
        La duración es el tiempo desde la primera entrada hasta la salida final, incluidas las horas
        nocturnas. La hora de entrada usa la zona horaria del journal; las horas cercanas a la
        medianoche aparecen en extremos opuestos del eje. Los patrones describen esta selección, no
        una relación causa-efecto ni un tiempo recomendado.
      </p>
    </section>
  );
}
