"use client";

import Link from "next/link";
import { Suspense, useState } from "react";
import type {
  CalendarMonth,
  DayStats,
  EdgeScore,
  EquityPoint,
  TradeMetrics,
} from "@luxalgo/journal-core";
import { dayKeyOf, relativeDrawdownCurve } from "@luxalgo/journal-core";
import { CalendarPnl } from "@/components/calendar-pnl";
import { DailyBars } from "@/components/charts/daily-bars";
import { EdgeRadar } from "@/components/charts/edge-radar";
import { EquityArea } from "@/components/charts/equity-area";
import { Gauge } from "@/components/charts/gauge";
import { RelativeDrawdownBars } from "@/components/charts/relative-drawdown-bars";
import { TimeHeatmap } from "@/components/charts/time-heatmap";
import {
  ArrowUpDown,
  CalendarCheck2,
  CircleDollarSign,
  Flame,
  Scale,
  Sigma,
  Target,
  Timer,
  TrendingDown,
  Trophy,
} from "lucide-react";
import { FilterBar, useFilters } from "@/components/filter-bar";
import { AddTradeDialog } from "@/components/add-trade-dialog";
import { DashboardLayout } from "@/components/dashboard-layout";
import { MonetaryValue } from "@/components/privacy";
import { Pnl } from "@/components/pnl";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { HelpHint, Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { postJson, useApi } from "@/lib/use-api";
import type { CalendarPnlPoint } from "@/lib/calendar-insights";
import { cn, fmtDuration, fmtMoney, fmtNumber, fmtPercent } from "@/lib/utils";

interface Bucket {
  key: string;
  trades: number;
  netPnl: number;
  winRate: number | null;
}

interface StatsPayload {
  timeZone: string;
  metrics: TradeMetrics;
  initialBalance: number;
  edgeScore: EdgeScore;
  days: DayStats[];
  dailyCumulative: EquityPoint[];
  calendar: CalendarMonth;
  calendarCurrencies: string[];
  runningPnl: Record<string, CalendarPnlPoint[]>;
  buckets: Record<"symbol" | "weekday" | "hour" | "duration" | "direction", Bucket[]>;
  openPositions: {
    key: string;
    symbol: string;
    direction: string;
    openedAt: string;
    quantity: number;
    avgEntry: number;
  }[];
  recentTrades: { key: string; symbol: string; closedAt: string; netPnl: number; status: string }[];
}

export default function DashboardPage() {
  return (
    <Suspense>
      <Dashboard />
    </Suspense>
  );
}

function Dashboard() {
  const { query } = useFilters();
  const { data, loading, error, refresh } = useApi<StatsPayload>(`/api/stats?${query}`);

  return (
    <>
      <FilterBar title="Dashboard" actions={<AddTradeDialog onSaved={refresh} />} />
      <DashboardContent
        data={data}
        loading={loading}
        error={error}
        refresh={refresh}
        query={query}
      />
    </>
  );
}

function DashboardContent({
  data,
  loading,
  error,
  refresh,
  query,
}: {
  data: StatsPayload | null;
  loading: boolean;
  error: string | null;
  refresh: () => void;
  query: string;
}) {
  if (loading && !data) return <DashboardSkeleton />;
  if (!data)
    return (
      <div>
        <div className="space-y-3 p-4">
          <p role="alert" className="text-sm text-destructive">
            {error ?? "No se pudo cargar el dashboard."}
          </p>
          <button
            type="button"
            className="rounded-md border px-3 py-2 text-sm hover:bg-accent"
            onClick={refresh}
          >
            Reintentar
          </button>
        </div>
      </div>
    );
  const { metrics: m, edgeScore } = data;

  if (m.totalTrades === 0)
    return query ? (
      <div>
        <p className="p-12 text-center text-sm text-muted-foreground">
          Ningún trade coincide con estos filtros. Quita o ajusta los filtros para ver más
          resultados.
        </p>
      </div>
    ) : (
      <EmptyState />
    );

  // Momentum: net P&L of the last 7 calendar days vs the 7 before them.
  // Hidden when either window has no trading days (e.g. the 7D range).
  const weekDelta = (() => {
    const now = Date.now();
    let last = 0;
    let prior = 0;
    let lastDays = 0;
    let priorDays = 0;
    for (const day of data.days) {
      const ageDays = (now - Date.parse(`${day.date}T00:00:00Z`)) / 86_400_000;
      if (ageDays <= 7) {
        last += day.netPnl;
        lastDays++;
      } else if (ageDays <= 14) {
        prior += day.netPnl;
        priorDays++;
      }
    }
    return lastDays > 0 && priorDays > 0 ? last - prior : null;
  })();
  const bestDay = data.days.length
    ? data.days.reduce((a, b) => (b.netPnl > a.netPnl ? b : a))
    : null;
  const worstDay = data.days.length
    ? data.days.reduce((a, b) => (b.netPnl < a.netPnl ? b : a))
    : null;

  return (
    <>
      <DashboardLayout
        widgets={[
          {
            id: "widget-0",
            label: "P&L neto",
            size: "small",
            layoutGroup: "summary",
            content: (
              <Card className="h-full">
                <StatHeader
                  title="P&L neto"
                  icon={CircleDollarSign}
                  hint="Beneficio o pérdida realizado, neto de comisiones, en el rango seleccionado."
                />
                <CardContent>
                  <Pnl value={m.netPnl} className="text-3xl font-semibold tracking-tight" />
                  {weekDelta !== null && (
                    <div
                      className={cn(
                        "mt-1.5 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium",
                        weekDelta >= 0 ? "bg-profit/10 text-profit" : "bg-loss/10 text-loss",
                      )}
                    >
                      {weekDelta >= 0 ? "▲" : "▼"}{" "}
                      <MonetaryValue>
                        {fmtMoney(Math.abs(weekDelta)).replace("+", "")}
                      </MonetaryValue>{" "}
                      vs 7d anteriores
                    </div>
                  )}
                  <div className="mt-1 text-xs text-muted-foreground">
                    {m.closedTrades} trades cerrados ·{" "}
                    <MonetaryValue>{fmtMoney(m.fees)}</MonetaryValue> comisiones
                  </div>
                </CardContent>
              </Card>
            ),
          },
          {
            id: "widget-1",
            label: "% trades ganadores",
            size: "small",
            layoutGroup: "summary",
            content: (
              <Card className="h-full">
                <StatHeader
                  title="% trades ganadores"
                  icon={Target}
                  hint="Trades ganadores entre todos los trades cerrados, incluidos los breakeven."
                />
                <CardContent className="flex items-center justify-between gap-2">
                  <Gauge value={m.winRate} label="Winrate por trade" />
                  <div className="space-y-0.5 text-xs text-muted-foreground">
                    <div>{m.wins} W</div>
                    <div>{m.breakevens} BE</div>
                    <div>{m.losses} L</div>
                  </div>
                </CardContent>
              </Card>
            ),
          },
          {
            id: "widget-2",
            label: "Profit factor",
            size: "small",
            layoutGroup: "summary",
            content: (
              <Card className="h-full">
                <StatHeader
                  title="Profit factor"
                  icon={Scale}
                  hint="Beneficio bruto ÷ pérdida bruta. Por encima de 1, las ganancias superan a las pérdidas."
                />
                <CardContent>
                  <div className="text-3xl font-semibold tracking-tight tnum">
                    {m.profitFactorIsInfinite
                      ? "∞"
                      : m.profitFactor === null
                        ? "–"
                        : fmtNumber(m.profitFactor)}
                  </div>
                  <div className="mt-1 text-xs text-muted-foreground">
                    beneficio bruto ÷ pérdida bruta
                  </div>
                </CardContent>
              </Card>
            ),
          },
          {
            id: "widget-3",
            label: "% días ganadores",
            size: "small",
            layoutGroup: "summary",
            content: (
              <Card className="h-full">
                <StatHeader
                  title="% días ganadores"
                  icon={CalendarCheck2}
                  hint="Días en verde ÷ todos los días operados en el rango seleccionado."
                />
                <CardContent className="flex items-center justify-between gap-2">
                  <Gauge value={m.dayWinRate} label="Winrate por día" />
                  <div className="text-xs text-muted-foreground">{m.tradingDays} días</div>
                </CardContent>
              </Card>
            ),
          },
          {
            id: "widget-4",
            label: "Ganancia / pérdida media",
            size: "small",
            layoutGroup: "summary",
            content: (
              <Card className="h-full">
                <StatHeader
                  title="Ganancia / pérdida media"
                  icon={ArrowUpDown}
                  hint="Trade ganador medio ÷ trade perdedor medio. La barra muestra ambos a escala."
                />
                <CardContent>
                  <div className="text-3xl font-semibold tracking-tight tnum">
                    {m.avgWinLossRatio === null ? "–" : fmtNumber(m.avgWinLossRatio)}
                  </div>
                  {m.avgWin !== null && m.avgLoss !== null && m.avgWin + m.avgLoss > 0 && (
                    <div
                      className="journal-progress-visual mt-2 flex h-1.5 gap-0.5"
                      role="img"
                      aria-label="Ganancia media frente a pérdida media, a escala"
                    >
                      <span
                        className="rounded-full bg-profit"
                        style={{
                          width: `${((m.avgWin / (m.avgWin + m.avgLoss)) * 100).toFixed(1)}%`,
                        }}
                      />
                      <span className="flex-1 rounded-full bg-loss" />
                    </div>
                  )}
                  <div className="mt-1 text-xs text-muted-foreground">
                    <span className="text-profit">
                      {m.avgWin === null ? (
                        "–"
                      ) : (
                        <MonetaryValue>{fmtMoney(m.avgWin)}</MonetaryValue>
                      )}
                    </span>
                    {" ganancia media · "}
                    <span className="text-loss">
                      {m.avgLoss === null ? (
                        "–"
                      ) : (
                        <MonetaryValue>{fmtMoney(-m.avgLoss)}</MonetaryValue>
                      )}
                    </span>
                    {" pérdida media"}
                  </div>
                </CardContent>
              </Card>
            ),
          },
          {
            id: "widget-5",
            label: "Edge Score",
            size: "medium",
            layoutGroup: "visuals",
            content: (
              <Card className="dashboard-visual-card h-full">
                <CardHeader className="flex-row items-center justify-between">
                  <div className="flex min-w-0 items-center gap-1">
                    <CardTitle>Edge Score</CardTitle>
                    <HelpHint heading="Edge Score">
                      Puntuación de 0 a 100 que combina winrate, profit factor, ganancia/pérdida
                      media, drawdown, recuperación y consistencia. Necesita al menos cinco trades
                      cerrados.
                    </HelpHint>
                  </div>
                  <span className="text-2xl font-semibold tracking-tight tnum">
                    {edgeScore.score === null ? (
                      "–"
                    ) : (
                      <span className="text-brand">{edgeScore.score}</span>
                    )}
                    <span className="text-xs text-muted-foreground"> /100</span>
                  </span>
                </CardHeader>
                <CardContent className="dashboard-visual-card-content">
                  {edgeScore.score === null ? (
                    <p className="py-8 text-center text-sm text-muted-foreground">
                      Necesita 5 o más trades cerrados. La fórmula es pública:{" "}
                      <a
                        className="underline"
                        href="https://github.com/LuxAlgo/trade-journal/blob/main/docs/edge-score.md"
                        target="_blank"
                        rel="noreferrer"
                      >
                        léela aquí
                      </a>
                      .
                    </p>
                  ) : (
                    <EdgeRadar components={edgeScore.components} height="100%" />
                  )}
                </CardContent>
              </Card>
            ),
          },
          {
            id: "widget-6",
            label: "P&L acumulado",
            size: "medium",
            layoutGroup: "visuals",
            content: (
              <Card className="dashboard-visual-card h-full">
                <CardHeader className="flex-row items-center justify-between">
                  <CardTitle>P&L neto acumulado por día</CardTitle>
                  <HelpHint heading="P&L acumulado">
                    Suma acumulada del P&L neto en el periodo seleccionado. Las barras de drawdown
                    de abajo muestran las caídas desde el máximo de equity.
                  </HelpHint>
                </CardHeader>
                <CardContent>
                  <EquityArea
                    data={data.dailyCumulative.map((p) => ({ t: p.t, cumNetPnl: p.cumNetPnl }))}
                  />
                  <RelativeDrawdownBars
                    data={relativeDrawdownCurve(data.dailyCumulative, data.initialBalance)}
                  />
                </CardContent>
              </Card>
            ),
          },
          {
            id: "widget-7",
            label: "P&L diario",
            size: "medium",
            layoutGroup: "visuals",
            content: (
              <Card className="dashboard-visual-card h-full">
                <CardHeader className="flex-row items-center justify-between">
                  <CardTitle>P&L neto diario</CardTitle>
                  <HelpHint heading="P&L diario">
                    Beneficio o pérdida neta de cada día operado. Las barras por encima de cero son
                    días en positivo; las de debajo, días en pérdida.
                  </HelpHint>
                </CardHeader>
                <CardContent className="dashboard-visual-card-content">
                  <DailyBars
                    data={data.days.map((d) => ({ date: d.date, netPnl: d.netPnl }))}
                    height="100%"
                  />
                </CardContent>
              </Card>
            ),
          },
          {
            id: "widget-8",
            label: "Calendario",
            size: "wide",
            layoutGroup: "detail",
            content: (
              <Card className="h-full">
                <CardHeader className="flex-row items-center justify-between">
                  <CardTitle>
                    {new Date(Date.UTC(data.calendar.year, data.calendar.month - 1)).toLocaleString(
                      "es-ES",
                      { month: "long", year: "numeric", timeZone: "UTC" },
                    )}
                  </CardTitle>
                  <Link
                    href={`/calendar?${query}`}
                    className="text-xs text-muted-foreground underline underline-offset-2 hover:text-foreground"
                  >
                    Calendario completo
                  </Link>
                </CardHeader>
                <CardContent>
                  <CalendarPnl
                    calendar={data.calendar}
                    runningPnl={data.runningPnl}
                    currency={data.calendarCurrencies[0] ?? "USD"}
                    monetary={data.calendarCurrencies.length <= 1}
                  />
                </CardContent>
              </Card>
            ),
          },
          {
            id: "widget-9",
            label: "Actividad",
            size: "medium",
            layoutGroup: "detail",
            content: (
              <Card className="h-full">
                <CardHeader>
                  <CardTitle>Actividad</CardTitle>
                </CardHeader>
                <CardContent>
                  <Tabs defaultValue="recent">
                    <TabsList className="h-8">
                      <TabsTrigger value="recent" className="text-xs">
                        Trades recientes
                      </TabsTrigger>
                      <TabsTrigger value="open" className="text-xs">
                        Posiciones abiertas
                      </TabsTrigger>
                    </TabsList>
                    <TabsContent value="recent" className="space-y-1">
                      {data.recentTrades.length === 0 && (
                        <Empty label="Aún no hay trades cerrados" />
                      )}
                      {data.recentTrades.map((trade) => (
                        <Link
                          key={trade.key}
                          href={`/trades/${encodeURIComponent(trade.key)}?${query}`}
                          className="dashboard-activity-row flex items-center justify-between rounded-md px-2 py-1.5 text-sm hover:bg-accent/60"
                        >
                          <span className="flex items-center gap-2">
                            <Badge
                              variant={
                                trade.status === "win"
                                  ? "profit"
                                  : trade.status === "loss"
                                    ? "loss"
                                    : "secondary"
                              }
                            >
                              {trade.status.toUpperCase()}
                            </Badge>
                            {trade.symbol}
                          </span>
                          <span className="dashboard-activity-detail flex items-center">
                            <span className="text-xs text-muted-foreground">
                              {trade.closedAt && dayKeyOf(trade.closedAt, data.timeZone)}
                            </span>
                            <Pnl value={trade.netPnl} />
                          </span>
                        </Link>
                      ))}
                    </TabsContent>
                    <TabsContent value="open" className="space-y-1">
                      {data.openPositions.length === 0 && (
                        <Empty label="Flat: sin posiciones abiertas" />
                      )}
                      {data.openPositions.map((position) => (
                        <div
                          key={position.key}
                          className="dashboard-activity-row flex items-center justify-between rounded-md px-2 py-1.5 text-sm"
                        >
                          <span className="flex items-center gap-2">
                            <Badge variant="secondary">{position.direction.toUpperCase()}</Badge>
                            {position.symbol}
                          </span>
                          <span className="tnum text-xs text-muted-foreground">
                            {fmtNumber(position.quantity, 4)} @{" "}
                            <MonetaryValue>{fmtNumber(position.avgEntry)}</MonetaryValue>
                          </span>
                        </div>
                      ))}
                    </TabsContent>
                  </Tabs>
                </CardContent>
              </Card>
            ),
          },
          {
            id: "widget-10",
            label: "Drawdown máximo",
            size: "small",
            layoutGroup: "secondary",
            content: (
              <Card className="h-full">
                <StatHeader
                  title="Drawdown máximo"
                  icon={TrendingDown}
                  hint="Mayor caída desde un máximo hasta un mínimo de la curva de P&L acumulado."
                />
                <CardContent>
                  <div className="text-xl font-semibold tnum text-loss">
                    <MonetaryValue>{fmtMoney(-m.maxDrawdown)}</MonetaryValue>
                  </div>
                  <div className="mt-1 text-xs text-muted-foreground">
                    {m.maxDrawdownPct === null
                      ? "pon un saldo inicial para ver el %"
                      : fmtPercent(m.maxDrawdownPct)}
                    {m.recoveryFactor !== null && ` · recuperación ${fmtNumber(m.recoveryFactor)}x`}
                  </div>
                </CardContent>
              </Card>
            ),
          },
          {
            id: "widget-11",
            label: "Rachas",
            size: "small",
            layoutGroup: "secondary",
            content: (
              <Card className="h-full">
                <StatHeader
                  title="Rachas"
                  icon={Flame}
                  hint="Racha actual de ganadores (W) o perdedores (L) seguidos, con la mejor y la peor racha."
                />
                <CardContent>
                  <div className="text-xl font-semibold tnum">
                    {m.currentStreak > 0
                      ? `${m.currentStreak}W`
                      : m.currentStreak < 0
                        ? `${-m.currentStreak}L`
                        : "–"}
                  </div>
                  <div className="mt-1 text-xs text-muted-foreground">
                    mejor {m.maxWinStreak}W · peor {m.maxLossStreak}L
                  </div>
                </CardContent>
              </Card>
            ),
          },
          {
            id: "widget-12",
            label: "Esperanza / trade",
            size: "small",
            layoutGroup: "secondary",
            content: (
              <Card className="h-full">
                <StatHeader
                  title="Esperanza / trade"
                  icon={Sigma}
                  hint="P&L neto medio por trade cerrado: lo que vale un trade más según tus números."
                />
                <CardContent>
                  {m.expectancy === null ? (
                    "–"
                  ) : (
                    <Pnl value={m.expectancy} className="text-xl font-semibold" />
                  )}
                  <div className="mt-1 text-xs text-muted-foreground">
                    {m.avgRealizedR !== null && m.tradesWithRisk > 0
                      ? `media ${fmtNumber(m.avgRealizedR)}R en ${m.tradesWithRisk} trades con riesgo marcado`
                      : "marca los stop loss para ver los múltiplos de R"}
                  </div>
                </CardContent>
              </Card>
            ),
          },
          {
            id: "widget-13",
            label: "Duración media",
            size: "small",
            layoutGroup: "secondary",
            content: (
              <Card className="h-full">
                <StatHeader
                  title="Duración media"
                  icon={Timer}
                  hint="Tiempo medio desde la primera ejecución de entrada hasta la salida final."
                />
                <CardContent>
                  <div className="text-xl font-semibold tnum">{fmtDuration(m.avgDurationMs)}</div>
                  <div className="mt-1 text-xs text-muted-foreground">
                    ganadores vs perdedores en Informes
                  </div>
                </CardContent>
              </Card>
            ),
          },
          {
            id: "widget-14",
            label: "Mejor / peor día",
            size: "small",
            layoutGroup: "secondary",
            content: (
              <Card className="h-full">
                <StatHeader
                  title="Mejor / peor día"
                  icon={Trophy}
                  hint="P&L neto más alto y más bajo de un solo día en el rango seleccionado."
                />
                <CardContent className="space-y-1">
                  {bestDay && (
                    <div className="flex flex-wrap items-baseline justify-between gap-x-2">
                      <Pnl value={bestDay.netPnl} className="text-base font-semibold" />
                      <span className="text-xs text-muted-foreground">{bestDay.date.slice(5)}</span>
                    </div>
                  )}
                  {worstDay && (
                    <div className="flex flex-wrap items-baseline justify-between gap-x-2">
                      <Pnl value={worstDay.netPnl} className="text-base font-semibold" />
                      <span className="text-xs text-muted-foreground">
                        {worstDay.date.slice(5)}
                      </span>
                    </div>
                  )}
                </CardContent>
              </Card>
            ),
          },
          {
            id: "widget-15",
            label: "Rendimiento por hora",
            size: "full",
            layoutGroup: "full",
            content: (
              <Card className="h-full">
                <CardHeader className="flex-row items-center justify-between">
                  <CardTitle>Rendimiento por hora</CardTitle>
                  <HelpHint heading="Rendimiento por hora">
                    Trades agrupados por su hora de apertura. El gráfico de arriba muestra el P&L
                    neto; el de abajo, el número de trades.
                  </HelpHint>
                </CardHeader>
                <CardContent>
                  <TimeHeatmap
                    hours={data.buckets.hour.map((b) => ({
                      key: b.key,
                      netPnl: b.netPnl,
                      trades: b.trades,
                    }))}
                  />
                </CardContent>
              </Card>
            ),
          },
        ]}
      />
    </>
  );
}

/** Stat-tile header: quiet label left, metric icon with an explainer right. */
function StatHeader({
  title,
  hint,
  icon: Icon,
}: {
  title: string;
  hint: string;
  icon: React.ComponentType<{ className?: string }>;
}) {
  return (
    <CardHeader className="flex-row items-center justify-between space-y-0">
      <CardTitle>{title}</CardTitle>
      <Tooltip>
        <TooltipTrigger className="cursor-help" aria-label={`Sobre ${title}`}>
          <Icon className="h-3.5 w-3.5 text-muted-foreground/70" />
        </TooltipTrigger>
        <TooltipContent>
          <div className="mb-1 font-semibold">{title}</div>
          <div className="text-muted-foreground">{hint}</div>
        </TooltipContent>
      </Tooltip>
    </CardHeader>
  );
}

function Empty({ label }: { label: string }) {
  return <p className="px-2 py-6 text-center text-sm text-muted-foreground">{label}</p>;
}

function EmptyState() {
  const [loadingDemo, setLoadingDemo] = useState(false);
  const loadDemo = async () => {
    setLoadingDemo(true);
    try {
      await postJson("/api/demo", {});
      window.location.reload();
    } catch {
      setLoadingDemo(false);
    }
  };
  return (
    <div>
      <div className="flex flex-col items-center justify-center gap-3 px-4 py-24 text-center">
        <h2 className="text-xl font-semibold">Tu journal está vacío</h2>
        <p className="max-w-md text-sm text-muted-foreground">
          Conecta un bróker para sincronizar automáticamente, sube un extracto de más de 10
          plataformas (incluida tu exportación de TradeZella) o añade trades a mano.
        </p>
        <div className="flex flex-wrap items-center justify-center gap-2">
          <Link
            href="/import"
            className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
          >
            Importa tus primeros trades
          </Link>
          <button
            onClick={loadDemo}
            disabled={loadingDemo}
            className="rounded-md border px-4 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:opacity-50"
          >
            {loadingDemo ? "Cargando…" : "Cargar datos de demo"}
          </button>
        </div>
        <p className="text-xs text-muted-foreground">
          Los datos de demo van a su propia cuenta; puedes borrarlos cuando quieras desde Cuentas.
        </p>
      </div>
    </div>
  );
}

function DashboardSkeleton() {
  return (
    <div>
      <div className="dashboard-grid-stage space-y-3 p-4">
        <div className="dashboard-grid grid gap-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} data-card-size="small" className="dashboard-grid-card h-28" />
          ))}
        </div>
        <div className="dashboard-grid grid gap-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} data-card-size="medium" className="dashboard-grid-card h-72" />
          ))}
        </div>
      </div>
    </div>
  );
}
