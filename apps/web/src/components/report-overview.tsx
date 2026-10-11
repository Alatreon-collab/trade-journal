"use client";

import type { AnalysisFilters, BucketStats } from "@luxalgo/journal-core";
import { TimeHeatmap } from "./charts/time-heatmap";
import { ReviewExport } from "./review-export";
import { MonetaryValue } from "./privacy";
import { Card, CardContent, CardHeader, CardTitle } from "./ui/card";
import { Skeleton } from "./ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "./ui/table";
import { useApi } from "@/lib/use-api";
import { fmtMoney, fmtPercent, pnlClass } from "@/lib/utils";
import { describeFilters } from "@/lib/filter-description";
import { groupLabel } from "@/lib/group-labels";

interface OverviewData {
  buckets: Record<
    "symbol" | "tag" | "mistake" | "playbook" | "weekday" | "hour" | "duration" | "direction",
    BucketStats[]
  >;
  currencies: string[];
  timeZone: string;
  accounts: { id: string; name: string }[];
  playbooks: { id: string; name: string }[];
}

// Keep the original overview's aggregations and ordering alongside the advanced reports.
const SECTIONS = [
  { key: "symbol", title: "Por símbolo", column: "Símbolo" },
  { key: "direction", title: "Long vs short", column: "Dirección" },
  { key: "weekday", title: "Por día de la semana", column: "Día" },
  { key: "duration", title: "Por tiempo en el trade", column: "Tiempo" },
  { key: "tag", title: "Por etiqueta", column: "Etiqueta" },
  { key: "mistake", title: "Por error", column: "Error" },
  { key: "playbook", title: "Por playbook", column: "Playbook" },
] as const;

export function ReportOverview({ query, filters }: { query: string; filters: AnalysisFilters }) {
  const { data, error, loading } = useApi<OverviewData>(`/api/stats?${query}`);
  if (error)
    return (
      <p role="alert" className="text-sm text-destructive">
        {error}
      </p>
    );
  if (loading || !data) return <Skeleton className="h-72" />;
  if (data.currencies.length > 1)
    return (
      <p className="rounded-lg border p-4 text-sm">
        Estas cuentas usan divisas distintas ({data.currencies.join(", ")}). Selecciona en Filtros
        cuentas con la misma divisa para comparar resultados.
      </p>
    );
  const currency = data.currencies[0] ?? "USD";
  const label = (dimension: string, key: string) =>
    dimension === "playbook"
      ? (data.playbooks.find((book) => book.id === key)?.name ?? groupLabel(key))
      : groupLabel(key);
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-xs text-muted-foreground">
          Resumen de trading · {data.timeZone} · {currency}
        </p>
        <ReviewExport
          containsFinancialData
          document={{
            title: "Resumen de trading",
            subtitle: `${data.timeZone} · ${currency}`,
            lines: [
              `Filtros: ${describeFilters(filters, data.accounts, data.playbooks)}`,
              "",
              "Rendimiento por hora (hora de apertura)",
              ...data.buckets.hour.map(
                (b) => `${b.key}:00: ${b.trades} trades | P&L neto ${fmtMoney(b.netPnl, currency)}`,
              ),
              ...SECTIONS.flatMap((section) => [
                "",
                section.title,
                ...data.buckets[section.key].map(
                  (b) =>
                    `${label(section.key, b.key)}: ${b.trades} trades | Winrate ${fmtPercent(b.winRate, 0)} | P&L neto ${fmtMoney(b.netPnl, currency)}`,
                ),
              ]),
            ],
          }}
        />
      </div>
      <div className="grid gap-3 lg:grid-cols-2">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Rendimiento por hora</CardTitle>
          </CardHeader>
          <CardContent>
            <TimeHeatmap hours={data.buckets.hour} currency={currency} />
          </CardContent>
        </Card>
        {SECTIONS.map((section) => (
          <Card key={section.key}>
            <CardHeader>
              <CardTitle>{section.title}</CardTitle>
            </CardHeader>
            <CardContent>
              {data.buckets[section.key].length === 0 ? (
                <p className="py-8 text-center text-sm text-muted-foreground">
                  {section.key === "tag" || section.key === "mistake" || section.key === "playbook"
                    ? "Anota tus trades para ver este desglose."
                    : "Aún no hay datos."}
                </p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>{section.column}</TableHead>
                      <TableHead className="text-right">Trades</TableHead>
                      <TableHead className="text-right">% ganadores</TableHead>
                      <TableHead className="text-right">P&L neto</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {data.buckets[section.key].map((bucket) => (
                      <TableRow key={bucket.key}>
                        <TableCell className="font-medium">
                          {label(section.key, bucket.key)}
                        </TableCell>
                        <TableCell className="tnum text-right text-muted-foreground">
                          {bucket.trades}
                        </TableCell>
                        <TableCell className="tnum text-right">
                          {fmtPercent(bucket.winRate, 0)}
                        </TableCell>
                        <TableCell className={`tnum text-right ${pnlClass(bucket.netPnl)}`}>
                          <MonetaryValue>{fmtMoney(bucket.netPnl, currency)}</MonetaryValue>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        ))}
      </div>
      <p className="text-xs leading-relaxed text-muted-foreground">
        El día de la semana y la hora usan la hora de apertura. El número de trades del resumen
        incluye posiciones abiertas; el winrate usa solo trades cerrados. El tiempo en el trade
        necesita un trade cerrado. Las etiquetas y los errores pueden solaparse. «Por símbolo»
        muestra los 20 mejores por P&L neto; en «Desglose» están todos los símbolos y más métricas
        de los trades cerrados.
      </p>
    </div>
  );
}
