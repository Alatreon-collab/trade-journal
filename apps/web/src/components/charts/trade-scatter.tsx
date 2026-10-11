"use client";

import {
  CartesianGrid,
  ReferenceLine,
  ResponsiveContainer,
  Scatter,
  ScatterChart,
  Tooltip,
  XAxis,
  YAxis,
  ZAxis,
} from "recharts";
import { useMemo } from "react";
import {
  clockLabel,
  type PlottedTrade,
  type TradeXAxis,
  type TradeYAxis,
} from "@/lib/trade-explorer";
import { fmtMoney } from "@/lib/utils";
import { usePrivacy } from "../privacy";
import { ChartFrame } from "./chart-frame";
import { tooltipStyle, useVizTokens } from "./tokens";

export function TradeScatter({
  points,
  x,
  y,
  currency,
  timeZone,
  onSelect,
}: {
  points: PlottedTrade[];
  x: TradeXAxis;
  y: TradeYAxis;
  currency: string;
  timeZone: string;
  onSelect: (point: PlottedTrade) => void;
}) {
  const tokens = useVizTokens();
  const privateMode = usePrivacy();
  const groups = useMemo(
    () => [
      points.filter((p) => (p.netPnl ?? 0) > 0),
      points.filter((p) => (p.netPnl ?? 0) < 0),
      points.filter((p) => (p.netPnl ?? 0) === 0),
    ],
    [points],
  );
  const date = useMemo(
    () => new Intl.DateTimeFormat("es-ES", { timeZone, dateStyle: "medium", timeStyle: "short" }),
    [timeZone],
  );
  const yLabel = (n: number) =>
    y === "realizedR" ? `${n.toFixed(2)}R` : privateMode ? "••••" : fmtMoney(n, currency);
  const xLabel = (n: number) =>
    x === "entryMinute"
      ? clockLabel(n)
      : x === "mae" || x === "mfe"
        ? privateMode
          ? "••••"
          : fmtMoney(n, currency)
        : n.toLocaleString(undefined, { maximumFractionDigits: 1, notation: "compact" });
  if (!tokens) return <div className="h-80" />;
  return (
    <ChartFrame height={340}>
      <ResponsiveContainer width="100%" height="100%">
        <ScatterChart
          margin={{ top: 12, right: 24, bottom: 8, left: 0 }}
          aria-label="Resultados de cada trade. Pulsa un punto para verlo; todos los trades tienen también enlace en la tabla de abajo."
        >
          <CartesianGrid stroke={tokens.gridline} />
          <XAxis
            type="number"
            dataKey="x"
            domain={x === "entryMinute" ? [0, 1440] : [0, "auto"]}
            ticks={x === "entryMinute" ? [0, 360, 720, 1080, 1440] : undefined}
            minTickGap={24}
            tickFormatter={xLabel}
            tick={{ fill: tokens.inkMuted, fontSize: 11 }}
            tickLine={false}
            axisLine={{ stroke: tokens.baseline }}
          />
          <YAxis
            type="number"
            dataKey="y"
            width={82}
            domain={[(min: number) => Math.min(min, 0), (max: number) => Math.max(max, 0)]}
            tickFormatter={yLabel}
            tick={{ fill: tokens.inkMuted, fontSize: 11 }}
            tickLine={false}
            axisLine={false}
          />
          <ZAxis range={[44, 44]} />
          <ReferenceLine y={0} stroke={tokens.inkMuted} />
          <Tooltip
            cursor={{ strokeDasharray: "3 3", stroke: tokens.inkMuted }}
            content={({ active, payload }) => {
              const point = payload?.[0]?.payload as PlottedTrade | undefined;
              return active && point ? (
                <div style={{ ...tooltipStyle(tokens), maxWidth: 230, overflowWrap: "anywhere" }}>
                  <p className="font-medium">
                    {point.symbol} · {point.direction}
                  </p>
                  <p className="text-xs">Cerrado {date.format(new Date(point.closedAt))}</p>
                  <p>
                    {x === "durationMinutes"
                      ? `${point.x.toLocaleString("es-ES", { maximumFractionDigits: 2 })} minutos`
                      : x === "entryMinute"
                        ? `Entrada ${clockLabel(point.x)}`
                        : `${x.toUpperCase()} estimado: ${xLabel(point.x)}`}
                  </p>
                  <p>
                    {y === "netPnl"
                      ? "P&L neto"
                      : y === "realizedR"
                        ? "R realizado"
                        : `${y.toUpperCase()} estimado`}
                    : {yLabel(point.y)}
                  </p>
                  <p className="text-xs text-muted-foreground">Pulsa para ver este trade</p>
                </div>
              ) : null;
            }}
          />
          {groups.map((data, index) => (
            <Scatter
              key={index}
              data={data}
              name={["P&L neto positivo", "P&L neto negativo", "P&L neto cero"][index]}
              shape="circle"
              fill={[tokens.profitFill, tokens.loss, tokens.inkMuted][index]}
              fillOpacity={0.7}
              stroke={[tokens.profit, tokens.loss, tokens.inkMuted][index]}
              strokeWidth={1}
              isAnimationActive={false}
              onClick={(value: { payload?: PlottedTrade }) => {
                if (value.payload) onSelect(value.payload);
              }}
              cursor="pointer"
            />
          ))}
        </ScatterChart>
      </ResponsiveContainer>
    </ChartFrame>
  );
}
