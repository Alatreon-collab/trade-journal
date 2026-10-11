"use client";

import Link from "next/link";
import dynamic from "next/dynamic";
import { useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { ArrowUpRight, CalendarDays } from "lucide-react";
import type { DayStats } from "@luxalgo/journal-core";
import { calendarTradeHref, type CalendarResponse } from "@/lib/calendar-insights";
import { cn, fmtMoney, fmtPercent } from "@/lib/utils";
import { Card, CardContent, CardHeader, CardTitle } from "./ui/card";
import { HelpHint, HoverHint } from "./ui/tooltip";
import { Pnl } from "./pnl";
import { usePrivacy } from "./privacy";
// Keep the calendar and summaries usable before the plotting bundle loads.
const CalendarDailyChart = dynamic(
  () => import("./charts/calendar-daily-chart").then((module) => module.CalendarDailyChart),
  {
    loading: () => (
      <div
        role="status"
        aria-label="Cargando gráfico de rendimiento diario"
        className="h-60 rounded-lg bg-muted/20"
      />
    ),
  },
);

const dateFormatter = new Intl.DateTimeFormat("es-ES", {
  month: "short",
  day: "numeric",
  timeZone: "UTC",
});
const dateLabel = (date: string) => dateFormatter.format(new Date(`${date}T12:00:00Z`));

function Metric({
  title,
  value,
  detail,
  hint,
}: {
  title: string;
  value: ReactNode;
  detail: ReactNode;
  hint: string;
}) {
  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between space-y-0">
        <CardTitle>{title}</CardTitle>
        <HelpHint heading={title}>{hint}</HelpHint>
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-semibold tracking-tight tabular-nums">{value}</div>
        <div className="mt-1 text-xs text-muted-foreground">{detail}</div>
      </CardContent>
    </Card>
  );
}

export function CalendarPerformance({ data, query }: { data: CalendarResponse; query: string }) {
  const { insights: i, scope, timeZone, currencies } = data;
  const currency = currencies[0] ?? "USD";
  const mixed = currencies.length > 1;
  const privateMode = usePrivacy();
  const router = useRouter();
  const [weekday, setWeekday] = useState<number | null>(null);
  const href = (date?: string) => calendarTradeHref(query, scope, date);
  const money = (value: number | null) =>
    value === null || mixed ? (
      <span className="text-muted-foreground">—</span>
    ) : (
      <Pnl value={value} currency={currency} />
    );
  const selected = weekday === null ? null : i.weekdays[weekday]!;
  const peak = Math.max(1, ...i.weekdays.map((day) => Math.abs(day.netPnl)));
  const dayLink = (day: DayStats | null) =>
    day && !mixed ? (
      <Link
        href={href(day.date)}
        className="inline-flex max-w-full items-center gap-2 rounded text-sm font-medium outline-none hover:underline focus-visible:ring-2 focus-visible:ring-ring"
      >
        {money(day.netPnl)}
        <span className="text-xs font-normal text-muted-foreground">{dateLabel(day.date)}</span>
        <ArrowUpRight aria-hidden="true" className="size-3.5 shrink-0" />
      </Link>
    ) : (
      money(null)
    );
  return (
    <section
      aria-labelledby="calendar-insights-heading"
      className="space-y-3"
      data-calendar-insights
    >
      <div className="flex flex-wrap items-end justify-between gap-2 pt-3">
        <div>
          <h2 id="calendar-insights-heading" className="text-base font-semibold tracking-tight">
            Análisis de rendimiento
          </h2>
          <p className="mt-1 text-xs text-muted-foreground">
            Mes visible × filtros activos · Trades cerrados, tras comisiones · {timeZone}
          </p>
        </div>
        {i.trades > 0 && (
          <Link
            href={href()}
            className="inline-flex items-center gap-1 rounded text-xs text-muted-foreground outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
          >
            Ver estos trades <ArrowUpRight aria-hidden="true" className="size-3.5" />
          </Link>
        )}
      </div>
      {!i.tradingDays ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-2 py-10 text-center">
            <CalendarDays aria-hidden="true" className="mb-1 size-6 text-muted-foreground" />
            <h3 className="text-sm font-medium">No hay trades cerrados en esta vista</h3>
            <p className="max-w-md text-sm text-muted-foreground">
              Elige otro mes o ajusta la cuenta y los filtros. Las posiciones abiertas y los días
              sin trades no se incluyen en el análisis.
            </p>
          </CardContent>
        </Card>
      ) : (
        <>
          {mixed && (
            <p
              role="status"
              className="rounded-lg border bg-muted/40 px-4 py-3 text-sm text-muted-foreground"
            >
              Estos trades usan {currencies.join(", ")}. Selecciona cuentas con una sola divisa para
              comparar resultados; no se aplica conversión de divisas.
            </p>
          )}
          <div className="grid gap-3 min-[420px]:grid-cols-2 xl:grid-cols-4">
            <Metric
              title="P&L neto"
              value={money(i.netPnl)}
              detail={`${i.tradingDays} día${i.tradingDays === 1 ? "" : "s"} operado${i.tradingDays === 1 ? "" : "s"}${mixed ? "" : ` · ${currency}`}`}
              hint="Suma del P&L neto de los trades cerrados en este mes y con estos filtros. Incluye comisiones. Sin conversión de divisas."
            />
            <Metric
              title="P&L diario medio"
              value={money(i.avgDailyPnl)}
              detail="Por día con trades cerrados"
              hint="P&L neto dividido entre los días operados. Se excluyen los días sin trades cerrados; los días en breakeven sí cuentan."
            />
            <Metric
              title="Winrate por trade"
              value={fmtPercent(i.winRate)}
              detail={`${i.wins} ganadores · ${i.losses} perdedores · ${i.breakevens} breakeven`}
              hint="Trades cerrados ganadores entre todos los trades cerrados, incluidos los breakeven. Usa la regla de breakeven configurada en tu journal."
            />
            <Metric
              title="Total de trades cerrados"
              value={
                <Link
                  className="rounded outline-none hover:underline focus-visible:ring-2 focus-visible:ring-ring"
                  href={href()}
                >
                  {i.trades}
                </Link>
              }
              detail="Trades completos (entrada y salida), no ejecuciones"
              hint="Cuenta los trades completados cuyo día de cierre cae en el mes visible y en el rango de fechas seleccionado, con el resto de filtros aplicados."
            />
          </div>
          {!mixed && (
            <>
              <div className="grid gap-3 md:grid-cols-3">
                <Card>
                  <CardHeader>
                    <CardTitle>Mejor y peor día</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <div className="flex flex-wrap items-center justify-between gap-1">
                      <span className="text-xs text-muted-foreground">Mejor día</span>
                      {dayLink(i.bestDay)}
                    </div>
                    <div className="flex flex-wrap items-center justify-between gap-1">
                      <span className="text-xs text-muted-foreground">Peor día</span>
                      {dayLink(i.worstDay)}
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {i.tradingDays === 1
                        ? "Un solo día operado; el mejor y el peor coinciden."
                        : "P&L neto diario más alto y más bajo."}
                    </p>
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader>
                    <CardTitle>Día verde y rojo medio</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <div className="flex items-center justify-between gap-2 text-sm">
                      <span className="text-xs text-muted-foreground">
                        {i.greenDays} días en positivo
                      </span>
                      {money(i.avgGreenDay)}
                    </div>
                    <div className="flex items-center justify-between gap-2 text-sm">
                      <span className="text-xs text-muted-foreground">
                        {i.redDays} días en pérdida
                      </span>
                      {money(i.avgRedDay)}
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Cada media usa solo su propio grupo.
                    </p>
                  </CardContent>
                </Card>
                <Metric
                  title="Consistencia diaria"
                  value={fmtPercent(i.profitableDayRate)}
                  detail={`${i.greenDays} positivos · ${i.redDays} negativos · ${i.flatDays} días planos`}
                  hint="Porcentaje de días operados con P&L neto estrictamente positivo. Es un porcentaje de días en verde, no una puntuación ajustada al riesgo ni una predicción. Los días planos cuentan en el total."
                />
              </div>
              <div className="grid items-start gap-3 lg:grid-cols-[minmax(0,1.65fr)_minmax(0,1fr)]">
                <Card>
                  <CardHeader>
                    <h3 className="text-sm font-medium">Rendimiento diario</h3>
                    <p className="text-xs text-muted-foreground">
                      P&L neto por día de cierre · {currency}
                      {i.tradingDays >= 8 ? " · Línea discontinua: media de 5 días operados" : ""}
                    </p>
                  </CardHeader>
                  <CardContent>
                    {i.tradingDays >= 2 ? (
                      <CalendarDailyChart
                        data={i.trend}
                        currency={currency}
                        onInspect={(date) => router.push(href(date))}
                      />
                    ) : (
                      <div className="flex min-h-40 flex-col items-center justify-center gap-2 rounded-lg bg-muted/30 p-5 text-center">
                        <span className="text-sm font-medium">
                          Para ver una tendencia hace falta más de un día
                        </span>
                        <span className="text-xs text-muted-foreground">
                          {dateLabel(i.days[0]!.date)} · {money(i.netPnl)} · {i.trades} trades
                          cerrados
                        </span>
                        <span className="text-xs text-muted-foreground">
                          Mira un mes anterior con más historial.
                        </span>
                      </div>
                    )}
                    <details className="mt-3 border-t pt-3">
                      <summary className="cursor-pointer rounded text-xs text-muted-foreground outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring">
                        Valores diarios y enlaces a los trades ({i.tradingDays})
                      </summary>
                      <div className="mt-2 max-h-60 overflow-auto">
                        <table className="w-full text-left text-xs">
                          <caption className="sr-only">
                            Resultados diarios del mes y filtros actuales
                          </caption>
                          <thead className="sticky top-0 bg-card text-muted-foreground">
                            <tr>
                              <th scope="col" className="py-2 font-medium">
                                Día de cierre
                              </th>
                              <th scope="col" className="text-right font-medium">
                                Trades
                              </th>
                              <th scope="col" className="text-right font-medium">
                                P&L neto
                              </th>
                            </tr>
                          </thead>
                          <tbody>
                            {i.days.map((day) => (
                              <tr key={day.date} className="border-t">
                                <th scope="row" className="py-2 font-normal">
                                  <Link
                                    href={href(day.date)}
                                    className="rounded underline underline-offset-4 outline-none focus-visible:ring-2 focus-visible:ring-ring"
                                  >
                                    {dateLabel(day.date)}
                                  </Link>
                                </th>
                                <td className="text-right tabular-nums">{day.trades}</td>
                                <td className="text-right">{money(day.netPnl)}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </details>
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader>
                    <h3 className="text-sm font-medium">Rendimiento por día de la semana</h3>
                    <p className="text-xs text-muted-foreground">
                      P&L neto por día de cierre · {currency} · Selecciona una fila
                    </p>
                  </CardHeader>
                  <CardContent>
                    <div className="mb-3 rounded-lg bg-muted/40 px-3 py-2">
                      <div className="text-[11px] text-muted-foreground">
                        Día de la semana más rentable
                      </div>
                      <div className="mt-0.5 flex flex-wrap justify-between gap-1 text-sm font-medium">
                        {i.mostProfitableWeekday ? (
                          <>
                            <span>{i.mostProfitableWeekday.label}</span>
                            {money(i.mostProfitableWeekday.netPnl)}
                          </>
                        ) : (
                          <span className="text-muted-foreground">
                            Aún no hay ningún día rentable
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="space-y-1">
                      {i.weekdays.map((day) => (
                        <HoverHint
                          key={day.index}
                          heading={day.label}
                          content={`${day.days.length} días operados · ${day.trades} trades cerrados · ${privateMode ? "P&L oculto" : fmtMoney(day.netPnl, currency)}`}
                        >
                          <button
                            type="button"
                            disabled={!day.trades}
                            onClick={() => setWeekday(weekday === day.index ? null : day.index)}
                            aria-pressed={weekday === day.index}
                            aria-label={`${day.label}: ${day.trades} trades${privateMode ? "" : `, ${fmtMoney(day.netPnl, currency)}`}. Ver los días de cierre.`}
                            className={cn(
                              "grid w-full grid-cols-[2rem_minmax(0,1fr)_5.75rem] items-center gap-2 rounded-md px-2 py-2 text-left text-xs outline-none hover:bg-accent/60 focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-40 disabled:hover:bg-transparent",
                              weekday === day.index && "bg-accent",
                            )}
                          >
                            <span>{day.label.slice(0, 3)}</span>
                            <span aria-hidden="true" className="relative h-4">
                              <span className="absolute inset-y-0 left-1/2 w-px bg-border" />
                              <span
                                className={cn(
                                  "absolute top-1 h-2 rounded-sm",
                                  day.netPnl > 0
                                    ? "bg-profit"
                                    : day.netPnl < 0
                                      ? "bg-loss"
                                      : "bg-muted-foreground",
                                )}
                                style={{
                                  left:
                                    day.netPnl < 0
                                      ? `${50 - (Math.abs(day.netPnl) / peak) * 50}%`
                                      : "50%",
                                  width:
                                    day.netPnl === 0
                                      ? "2px"
                                      : `${(Math.abs(day.netPnl) / peak) * 50}%`,
                                }}
                              />
                            </span>
                            <span className="text-right">
                              {day.trades ? money(day.netPnl) : "—"}
                            </span>
                          </button>
                        </HoverHint>
                      ))}
                    </div>
                    {selected && (
                      <div className="mt-3 border-t pt-3" aria-live="polite">
                        <p className="mb-2 text-xs font-medium">
                          {selected.label} · {selected.trades} trades en {selected.days.length} días
                        </p>
                        <div className="flex flex-wrap gap-2">
                          {selected.days.map((day) => (
                            <Link
                              key={day.date}
                              href={href(day.date)}
                              className="rounded-md border px-2 py-1.5 text-xs outline-none hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring"
                            >
                              {dateLabel(day.date)}{" "}
                              <span className="text-muted-foreground">· {day.trades} trades</span>
                            </Link>
                          ))}
                        </div>
                      </div>
                    )}
                  </CardContent>
                </Card>
              </div>
              {i.tradingDays < 5 && (
                <p className="px-1 text-xs text-muted-foreground">
                  Muestra pequeña: {i.tradingDays} día{i.tradingDays === 1 ? "" : "s"} operado
                  {i.tradingDays === 1 ? "" : "s"}. Los resultados por día de la semana y la
                  consistencia solo describen esta selección.
                </p>
              )}
            </>
          )}
        </>
      )}
    </section>
  );
}
