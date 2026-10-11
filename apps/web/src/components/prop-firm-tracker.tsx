"use client";
import { useEffect, useMemo, useState } from "react";
import {
  ArrowDownLeft,
  ArrowUpRight,
  Clock3,
  Landmark,
  Plus,
  Download,
  Upload,
} from "lucide-react";
import { FilterBar } from "./filter-bar";
import { Field } from "./filter-fields";
import { Card, CardContent, CardHeader, CardTitle } from "./ui/card";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { OptionSelect } from "./ui/option-select";
import { DatePicker } from "./ui/date-picker";
import { EquityArea } from "./charts/equity-area";
import { usePrivacy } from "./privacy";
import { useApi } from "@/lib/use-api";
import { PropCashSummary, PropCashComparison } from "./prop-cash-overview";
import { createPropDemo } from "@/lib/prop-demo";
import { PropFirmModal, type PropModal } from "./prop-firm-forms";
import {
  cashMovements,
  cashSummary,
  cashTimeline,
  payoutProgress,
  propMoney,
  currencyDigits,
  fromMinor,
  label,
  type PropData,
  type PropEntry,
  type CashMovement,
  type PropReceipt,
} from "@/lib/prop-firms";
const PAGE_SIZE = 40;
const inDates = (day: string, from: string, to: string) =>
  (!from || day >= from) && (!to || day <= to);
function downloadCsv(rows: CashMovement[]) {
  const cell = (value: string) => {
    const safe = /^[\s]*[=+@-]/.test(value) ? `'${value}` : value;
    return `"${safe.replaceAll('"', '""')}"`;
  };
  const header = "id,entry_id,account_id,firm,currency,date,kind,amount,category,reference";
  const csv = [
    header,
    ...rows.map((row) =>
      [
        row.id,
        row.entryId,
        row.accountId ?? "",
        row.firm,
        row.currency,
        row.date,
        row.kind,
        fromMinor(row.amountMinor, row.currency),
        row.category,
        row.reference,
      ]
        .map(cell)
        .join(","),
    ),
  ].join("\r\n");
  const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = "prop-cash-flows.csv";
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
function Empty({ children }: { children: React.ReactNode }) {
  return <p className="py-8 text-center text-sm text-muted-foreground">{children}</p>;
}
export function PropFirmTracker() {
  const { data: savedData, error, loading, refresh } = useApi<PropData>("/api/prop-firms");
  const [demo, setDemo] = useState<PropData | null>(null);
  const [showBreakdowns, setShowBreakdowns] = useState(false);
  const data = demo ?? savedData;
  const privacy = usePrivacy();
  const [tab, setTab] = useState("overview"),
    [firm, setFirm] = useState(""),
    [accountId, setAccountId] = useState(""),
    [currency, setCurrency] = useState(""),
    [from, setFrom] = useState(""),
    [to, setTo] = useState(""),
    [search, setSearch] = useState(""),
    [showArchived, setShowArchived] = useState(false),
    [showVoided, setShowVoided] = useState(false),
    [page, setPage] = useState(0),
    [modal, setModal] = useState<PropModal | null>(null);
  useEffect(
    () => setPage(0),
    [tab, firm, accountId, currency, from, to, search, showArchived, showVoided],
  );
  useEffect(() => {
    if (privacy) setModal(null);
  }, [privacy]);
  const readOnly = privacy || Boolean(demo);
  const switchDemo = () => {
    setDemo(
      demo ? null : createPropDemo(savedData?.today ?? new Date().toISOString().slice(0, 10)),
    );
    setModal(null);
    setFirm("");
    setAccountId("");
    setCurrency(demo ? "" : "USD");
    setFrom("");
    setTo("");
    setSearch("");
    setPage(0);
    setShowArchived(false);
    setShowVoided(false);
    setTab("overview");
  };
  const allCash = useMemo(() => (data ? cashMovements(data.entries, data.receipts) : []), [data]);
  const payouts = useMemo(
    () => (data ? payoutProgress(data.entries, data.receipts, data.today) : []),
    [data],
  );
  const payoutById = useMemo(() => new Map(payouts.map((row) => [row.entry.id, row])), [payouts]);
  const receiptsById = useMemo(() => {
    const map = new Map<string, PropReceipt[]>();
    for (const row of data?.receipts ?? []) {
      const list = map.get(row.payoutId) ?? [];
      list.push(row);
      map.set(row.payoutId, list);
    }
    return map;
  }, [data]);
  const firms = useMemo(
    () =>
      [
        ...new Set([
          ...(data?.accounts.map((a) => a.firm) ?? []),
          ...(data?.entries.map((e) => e.firm) ?? []),
        ]),
      ].sort(),
    [data],
  );
  const currencies = useMemo(
    () =>
      [
        ...new Set([
          ...(data?.accounts.map((a) => a.currency) ?? []),
          ...(data?.entries.map((e) => e.currency) ?? []),
        ]),
      ].sort(),
    [data],
  );
  const selectedCurrency = currency || (currencies.length === 1 ? currencies[0]! : "");
  const matches = (row: { firm: string; accountId: string | null; currency: string }) =>
    (!firm || row.firm === firm) &&
    (!accountId || row.accountId === accountId) &&
    (!currency || row.currency === currency);
  const cash = useMemo(
    () => allCash.filter((row) => matches(row) && inDates(row.date, from, to)),
    [allCash, firm, accountId, currency, from, to],
  );
  const summaryCash = useMemo(
    () => cash.filter((row) => row.currency === selectedCurrency),
    [cash, selectedCurrency],
  );
  const summary = useMemo(() => cashSummary(summaryCash), [summaryCash]);
  const selectedPayouts = payouts.filter((row) => matches(row.entry));
  const outstanding = selectedPayouts
    .filter((row) => row.entry.currency === selectedCurrency)
    .reduce((sum, row) => sum + row.remaining, 0);
  const overdue = selectedPayouts.filter((row) => row.overdue);
  const accountRows = (data?.accounts ?? []).filter((a) => matches({ ...a, accountId: a.id }));
  const active = accountRows.filter((a) => a.status === "active" && !a.archived);
  const resolved = accountRows.filter(
    (a) =>
      ["evaluation", "verification"].includes(a.program) &&
      ["passed", "breached"].includes(a.status),
  );
  const passed = resolved.filter((a) => a.status === "passed").length;
  const renewals = active
    .filter(
      (a) =>
        a.renewalOn &&
        a.renewalOn <=
          new Date(Date.parse(`${data?.today}T12:00:00Z`) + 30 * 86_400_000)
            .toISOString()
            .slice(0, 10),
    )
    .sort((a, b) => a.renewalOn!.localeCompare(b.renewalOn!));
  const money = (amount: number, code = selectedCurrency) =>
    privacy ? "••••" : code ? propMoney(amount, code) : "—";
  const name = (id: string | null) =>
    data?.accounts.find((a) => a.id === id)?.name ?? "Gasto común de la firma";
  const query = search.toLowerCase().trim();
  const entries = (data?.entries ?? [])
    .filter(
      (e) =>
        matches(e) &&
        (showVoided || !e.voided) &&
        inDates(e.occurredOn, from, to) &&
        (!query ||
          `${e.firm} ${name(e.accountId)} ${e.kind} ${e.category} ${e.reference}`
            .toLowerCase()
            .includes(query)),
    )
    .sort(
      (a, b) => b.occurredOn.localeCompare(a.occurredOn) || b.createdAt.localeCompare(a.createdAt),
    );
  const listedPayouts = selectedPayouts
    .filter(
      (row) =>
        (row.entry.status === "requested" ||
          row.entry.status === "approved" ||
          inDates(row.entry.occurredOn, from, to)) &&
        (!query ||
          `${row.entry.firm} ${name(row.entry.accountId)} ${row.entry.status} ${row.entry.reference}`
            .toLowerCase()
            .includes(query)),
    )
    .sort(
      (a, b) =>
        Number(b.overdue) - Number(a.overdue) ||
        b.entry.occurredOn.localeCompare(a.entry.occurredOn),
    );
  const listedAccounts = accountRows.filter(
    (a) =>
      (showArchived || !a.archived) &&
      (!query || `${a.firm} ${a.name} ${a.program} ${a.status}`.toLowerCase().includes(query)),
  );
  const cashByAccount = useMemo(() => {
    const groups = new Map<string, CashMovement[]>();
    for (const row of cash) {
      const key = row.accountId ?? "";
      const group = groups.get(key) ?? [];
      group.push(row);
      groups.set(key, group);
    }
    return groups;
  }, [cash]);
  const byFirm = [...new Set(summaryCash.map((row) => row.firm))]
    .map((value) => ({
      firm: value,
      ...cashSummary(summaryCash.filter((row) => row.firm === value)),
    }))
    .sort((a, b) => b.net - a.net);
  const byCategory = EXPENSE_ROWS(summaryCash);
  const months = [...new Set(summaryCash.map((row) => row.date.slice(0, 7)))]
    .sort()
    .reverse()
    .map((month) => ({
      month,
      ...cashSummary(summaryCash.filter((row) => row.date.startsWith(month))),
    }));
  const rowCount =
    tab === "accounts"
      ? listedAccounts.length
      : tab === "payouts"
        ? listedPayouts.length
        : entries.length;
  const safePage = Math.min(page, Math.max(0, Math.ceil(rowCount / PAGE_SIZE) - 1));
  const slice = <T,>(rows: T[]) => rows.slice(safePage * PAGE_SIZE, (safePage + 1) * PAGE_SIZE);
  const entryActions = (entry: PropEntry) => (
    <div className="flex flex-wrap gap-1">
      <Button
        size="sm"
        variant="ghost"
        disabled={readOnly}
        onClick={() => setModal({ kind: "detail", type: "entry", id: entry.id })}
      >
        Detalles
      </Button>
      {!entry.voided && (
        <Button
          size="sm"
          variant="ghost"
          disabled={readOnly}
          onClick={() => setModal({ kind: "entry", entry, type: entry.kind })}
        >
          Editar
        </Button>
      )}
      {!entry.voided && entry.kind === "expense" && (
        <Button
          size="sm"
          variant="ghost"
          disabled={readOnly}
          onClick={() => setModal({ kind: "entry", type: "refund", expense: entry })}
        >
          Reembolso
        </Button>
      )}
      <Button
        size="sm"
        variant="ghost"
        disabled={readOnly}
        onClick={() =>
          setModal({
            kind: "change",
            action: "entry.void",
            id: entry.id,
            revision: entry.revision,
            value: !entry.voided,
            name: entry.voided ? "Restaurar registro" : "Anular registro",
          })
        }
      >
        {entry.voided ? "Restaurar" : "Anular"}
      </Button>
    </div>
  );
  return (
    <div>
      <FilterBar
        title="Prop firms"
        actions={
          <div className="flex flex-wrap gap-2">
            <Button
              size="sm"
              variant="outline"
              disabled={!data || readOnly}
              onClick={() => setModal({ kind: "account" })}
            >
              <Plus className="h-4 w-4" />
              Seguir cuenta
            </Button>
            <Button
              size="sm"
              variant="outline"
              disabled={!data || readOnly}
              onClick={() => setModal({ kind: "entry", type: "expense" })}
            >
              <ArrowUpRight className="h-4 w-4" />
              Añadir gasto
            </Button>
            <Button
              size="sm"
              disabled={!data || readOnly}
              onClick={() => setModal({ kind: "entry", type: "payout" })}
            >
              <ArrowDownLeft className="h-4 w-4" />
              Registrar payout
            </Button>
          </div>
        }
      />
      <div className="space-y-5 p-4 sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold">Gastos y payouts</h2>
            <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
              Lo que has pagado, lo que has recuperado y tu resultado neto.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="outline" onClick={switchDemo}>
              {demo ? "Salir de la demo" : "Cargar datos de demo"}
            </Button>
            <details className="relative">
              <summary className="cursor-pointer rounded-md border px-3 py-2 text-xs font-medium">
                Herramientas
              </summary>
              <div className="absolute right-0 z-20 mt-2 flex w-48 flex-col gap-1 rounded-lg border bg-card p-2 shadow-lg">
                <Button
                  size="sm"
                  variant="outline"
                  disabled={!data || readOnly}
                  onClick={() => setModal({ kind: "import" })}
                >
                  <Upload className="h-4 w-4" />
                  Importar CSV
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={!cash.length || readOnly}
                  onClick={() => downloadCsv(cash)}
                >
                  <Download className="h-4 w-4" />
                  Exportar CSV de caja
                </Button>
              </div>
            </details>
          </div>
        </div>
        {demo && (
          <div
            role="status"
            className="rounded-lg border border-primary/30 bg-primary/5 p-4 text-sm"
          >
            <span className="font-medium">Vista de demo</span>
            <span className="ml-2 text-muted-foreground">
              Registros simulados · Solo lectura · No se guarda nada
            </span>
          </div>
        )}
        {privacy && (
          <p className="rounded-lg border p-3 text-sm text-muted-foreground">
            El modo privado oculta importes, gráficos y detalles financieros. Desactívalo para
            editar registros o exportar los datos de caja.
          </p>
        )}
        {error && !demo && (
          <p
            role="alert"
            className="rounded-lg border border-destructive p-3 text-sm text-destructive"
          >
            {error}{" "}
            <Button variant="ghost" onClick={refresh}>
              Reintentar
            </Button>
          </p>
        )}
        {loading && !data && (
          <p role="status" className="text-sm text-muted-foreground">
            Cargando tus registros de prop firms…
          </p>
        )}
        {data && (
          <>
            {!data.accounts.length && !data.entries.length && (
              <Card>
                <CardContent className="flex flex-wrap items-center gap-5 py-7">
                  <Landmark className="h-10 w-10 text-muted-foreground" />
                  <div className="max-w-2xl">
                    <h3 className="font-semibold">Empieza con una cuenta o un gasto</h3>
                    <p className="mt-1 text-sm text-muted-foreground">
                      Añade la firma y el intento que quieras seguir, y después registra las cuotas
                      y los payouts reales. También puedes apuntar gastos comunes de una firma antes
                      de vincular una cuenta. No viene precargada ninguna firma, tarifa ni regla de
                      payout.
                    </p>
                  </div>
                </CardContent>
              </Card>
            )}
            <details className="rounded-xl border bg-card">
              <summary className="cursor-pointer px-4 py-3 text-sm">
                <span className="font-medium">Filtros</span>
                <span className="ml-3 text-xs text-muted-foreground">
                  {firm || "Todas las firmas"} · {accountId ? name(accountId) : "Todas las cuentas"}{" "}
                  · {from || to ? `${from || "Inicio"} a ${to || "Hoy"}` : "Todas las fechas"}
                  {selectedCurrency ? ` · ${selectedCurrency}` : " · Elige divisa"}
                </span>
              </summary>
              <div className="grid gap-3 border-t p-4 sm:grid-cols-2 xl:grid-cols-5">
                <Field label="Firma">
                  <OptionSelect
                    value={firm}
                    onValueChange={(value) => {
                      setFirm(value);
                      setAccountId("");
                    }}
                  >
                    <option value="">Todas las firmas</option>
                    {firms.map((v) => (
                      <option key={v} value={v}>
                        {v}
                      </option>
                    ))}
                  </OptionSelect>
                </Field>
                <Field label="Cuenta prop">
                  <OptionSelect value={accountId} onValueChange={setAccountId}>
                    <option value="">Todas las cuentas y gastos comunes</option>
                    {data.accounts
                      .filter((a) => !firm || a.firm === firm)
                      .map((a) => (
                        <option key={a.id} value={a.id}>
                          {a.name}
                          {a.archived ? " (archivada)" : ""}
                        </option>
                      ))}
                  </OptionSelect>
                </Field>
                <Field label="Divisa">
                  <OptionSelect value={currency} onValueChange={setCurrency}>
                    <option value="">
                      {currencies.length > 1
                        ? "Elige divisa para los totales"
                        : "Todas las divisas"}
                    </option>
                    {currencies.map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </OptionSelect>
                </Field>
                <Field label="Caja desde">
                  <DatePicker
                    label="Fecha de caja desde"
                    value={from}
                    max={to || data.today}
                    onValueChange={setFrom}
                  />
                </Field>
                <Field label="Caja hasta">
                  <DatePicker
                    label="Fecha de caja hasta"
                    value={to}
                    min={from}
                    max={data.today}
                    onValueChange={setTo}
                  />
                </Field>
                <div className="flex flex-wrap items-center justify-between gap-2 sm:col-span-2 xl:col-span-5">
                  <p className="text-xs text-muted-foreground">
                    Las fechas se aplican al dinero cobrado o pagado. El historial de cuentas y las
                    solicitudes pendientes abarcan todas las fechas.
                  </p>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      setFirm("");
                      setAccountId("");
                      setCurrency("");
                      setFrom("");
                      setTo("");
                      setSearch("");
                    }}
                  >
                    Quitar filtros
                  </Button>
                </div>
              </div>
            </details>
            {from && to && from > to && (
              <p role="alert" className="text-sm text-destructive">
                La fecha de inicio debe ser igual o anterior a la de fin.
              </p>
            )}
            {currencies.length > 1 && !selectedCurrency && (
              <Card>
                <CardContent className="py-4">
                  <p className="mb-3 text-sm">
                    Las divisas nunca se suman entre sí. Elige una arriba para ver gráficos y
                    totales detallados.
                  </p>
                  <div className="flex flex-wrap gap-4">
                    {currencies.map((c) => (
                      <p key={c} className="text-sm">
                        <strong>{c}</strong> · Caja neta{" "}
                        {money(cashSummary(cash.filter((r) => r.currency === c)).net, c)}
                      </p>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}
            <PropCashSummary summary={summary} currency={selectedCurrency} privacy={privacy} />
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-dashed px-4 py-3">
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
                <span className="text-muted-foreground">Payouts pendientes</span>
                <strong className="tabular-nums">{money(outstanding)}</strong>
                <span className="text-xs text-muted-foreground">
                  {overdue.length ? `${overdue.length} con retraso · ` : ""}Todas las fechas · No
                  cuenta como dinero cobrado
                </span>
              </div>
              <Button size="sm" variant="ghost" onClick={() => setTab("payouts")}>
                Ver solicitudes de payout →
              </Button>
            </div>
            <div
              role="tablist"
              aria-label="Secciones del seguimiento de prop firms"
              className="flex gap-2 overflow-x-auto"
            >
              {["overview", "accounts", "payouts", "ledger"].map((v) => (
                <Button
                  key={v}
                  role="tab"
                  aria-selected={tab === v}
                  variant={tab === v ? "secondary" : "outline"}
                  onClick={() => setTab(v)}
                >
                  {v === "ledger" ? "Movimientos" : label(v)}
                </Button>
              ))}
            </div>
            {tab === "overview" ? (
              <div className="space-y-4">
                <PropCashComparison months={months} currency={selectedCurrency} privacy={privacy} />
                <details
                  className="rounded-xl border bg-card"
                  open={showBreakdowns}
                  onToggle={(event) => setShowBreakdowns(event.currentTarget.open)}
                >
                  <summary className="cursor-pointer p-4">
                    <span className="text-sm font-medium">Desgloses detallados</span>
                    <span className="mt-1 block text-xs text-muted-foreground">
                      Evolución de la caja neta, retorno por firma, categorías de gasto, progreso de
                      cuentas, renovaciones y registros mensuales
                    </span>
                  </summary>
                  {showBreakdowns && (
                    <div className="space-y-4 border-t p-3 sm:p-4">
                      <div className="grid gap-4 xl:grid-cols-3">
                        <Card className="xl:col-span-2">
                          <CardHeader>
                            <CardTitle>
                              Caja neta en el tiempo
                              {selectedCurrency ? ` · ${selectedCurrency}` : ""}
                            </CardTitle>
                          </CardHeader>
                          <CardContent>
                            {privacy ? (
                              <Empty>Gráfico oculto en modo privado.</Empty>
                            ) : !selectedCurrency ? (
                              <Empty>Elige una divisa para dibujar el retorno de caja.</Empty>
                            ) : summaryCash.length ? (
                              <EquityArea
                                curve="stepAfter"
                                currency={selectedCurrency}
                                valueLabel="Caja neta en el periodo seleccionado"
                                data={cashTimeline(summaryCash).map((p) => ({
                                  t: p.date,
                                  cumNetPnl: p.net / 10 ** currencyDigits(selectedCurrency),
                                }))}
                              />
                            ) : (
                              <Empty>
                                Registra un gasto o un cobro de payout para crear tu historial de
                                caja.
                              </Empty>
                            )}
                            <p className="mt-3 text-xs text-muted-foreground">
                              Empieza en cero en el periodo seleccionado. Payouts + reembolsos −
                              gastos − reversiones.
                            </p>
                          </CardContent>
                        </Card>
                        <Card>
                          <CardHeader>
                            <CardTitle>Progreso de cuentas · todas las fechas</CardTitle>
                          </CardHeader>
                          <CardContent className="space-y-4">
                            <div className="flex justify-between text-sm">
                              <span>Evaluaciones / verificaciones activas</span>
                              <strong>
                                {
                                  active.filter((a) =>
                                    ["evaluation", "verification"].includes(a.program),
                                  ).length
                                }
                              </strong>
                            </div>
                            <div className="flex justify-between text-sm">
                              <span>Fondeadas / live activas</span>
                              <strong>
                                {
                                  active.filter((a) =>
                                    ["funded", "instant_funded", "live"].includes(a.program),
                                  ).length
                                }
                              </strong>
                            </div>
                            <div className="flex justify-between text-sm">
                              <span>% aprobado en fases resueltas</span>
                              <strong>
                                {resolved.length
                                  ? `${Math.round((passed / resolved.length) * 100)}%`
                                  : "—"}
                              </strong>
                            </div>
                            <p className="text-xs text-muted-foreground">
                              {passed} aprobadas / {resolved.length} fases de evaluación aprobadas o
                              quemadas. No cuentan las fases activas ni las cerradas
                              voluntariamente; no es el % de éxito del challenge completo.
                            </p>
                            <p className="border-t pt-4 text-xs text-muted-foreground">
                              Vincula las cuentas con los trades del journal desde los detalles de
                              la cuenta. El tamaño de la cuenta es solo descriptivo y nunca cuenta
                              como dinero invertido.
                            </p>
                          </CardContent>
                        </Card>
                      </div>
                      <div className="grid gap-4 xl:grid-cols-2">
                        <Card>
                          <CardHeader>
                            <CardTitle>
                              Retorno por firma{selectedCurrency ? ` · ${selectedCurrency}` : ""}
                            </CardTitle>
                          </CardHeader>
                          <CardContent>
                            {byFirm.length ? (
                              <div className="overflow-x-auto">
                                <table className="w-full text-left text-sm">
                                  <thead>
                                    <tr className="border-b text-xs text-muted-foreground">
                                      <th className="py-2">Firma</th>
                                      <th>Gasto neto</th>
                                      <th>Payouts cobrados</th>
                                      <th>Retorno neto</th>
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {byFirm.map((row) => (
                                      <tr key={row.firm} className="border-b last:border-0">
                                        <td className="py-3 pr-3">{row.firm}</td>
                                        <td className="pr-3">{money(row.netSpend)}</td>
                                        <td className="pr-3">{money(row.received)}</td>
                                        <td>{money(row.net)}</td>
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                              </div>
                            ) : (
                              <Empty>No hay movimientos de caja en esta selección.</Empty>
                            )}
                          </CardContent>
                        </Card>
                        <Card>
                          <CardHeader>
                            <CardTitle>Desglose de gastos</CardTitle>
                          </CardHeader>
                          <CardContent className="space-y-3">
                            {byCategory.length ? (
                              byCategory.map((row) => (
                                <div key={row.category}>
                                  <div className="flex justify-between gap-3 text-sm">
                                    <span>{label(row.category)}</span>
                                    <span>{money(row.amount)}</span>
                                  </div>
                                  {!privacy && (
                                    <div className="mt-1 h-1.5 rounded-full bg-muted">
                                      <div
                                        className="h-full rounded-full bg-foreground/60"
                                        style={{
                                          width: `${summary.spent ? (row.amount / summary.spent) * 100 : 0}%`,
                                        }}
                                      />
                                    </div>
                                  )}
                                </div>
                              ))
                            ) : (
                              <Empty>No hay gastos registrados en esta selección.</Empty>
                            )}
                            <p className="text-xs text-muted-foreground">
                              Gasto bruto por categoría. Los reembolsos aparecen aparte en el
                              resumen.
                            </p>
                          </CardContent>
                        </Card>
                      </div>
                      <Card>
                        <CardHeader>
                          <CardTitle>Próximas renovaciones · 30 días y atrasadas</CardTitle>
                        </CardHeader>
                        <CardContent>
                          {renewals.length ? (
                            <div className="space-y-3">
                              {renewals.map((a) => (
                                <div
                                  key={a.id}
                                  className="flex flex-wrap items-center justify-between gap-3 rounded-lg border p-3"
                                >
                                  <div>
                                    <p className="text-sm font-medium">
                                      {a.firm} · {a.name}
                                    </p>
                                    <p className="text-xs text-muted-foreground">
                                      {a.renewalOn} ·{" "}
                                      {a.renewalMinor === null
                                        ? "Importe sin definir"
                                        : money(a.renewalMinor, a.currency)}
                                      {a.renewalOn! < data.today
                                        ? " · Revisa la renovación atrasada"
                                        : ""}
                                    </p>
                                  </div>
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    disabled={readOnly}
                                    onClick={() =>
                                      setModal({
                                        kind: "entry",
                                        type: "expense",
                                        accountId: a.id,
                                        category: "subscription",
                                      })
                                    }
                                  >
                                    Registrar cargo
                                  </Button>
                                </div>
                              ))}
                            </div>
                          ) : (
                            <Empty>No hay renovaciones programadas.</Empty>
                          )}
                          <p className="mt-3 text-xs text-muted-foreground">
                            Los recordatorios no crean gastos ni cobran nada. Actualiza la próxima
                            fecha después de revisar una renovación.
                          </p>
                        </CardContent>
                      </Card>
                      <Card>
                        <CardHeader>
                          <CardTitle>Revisión mensual de caja</CardTitle>
                        </CardHeader>
                        <CardContent>
                          {months.length ? (
                            <div className="overflow-x-auto">
                              <table className="w-full text-left text-sm">
                                <thead>
                                  <tr className="border-b text-xs text-muted-foreground">
                                    <th className="py-2">Mes</th>
                                    <th>Gastado</th>
                                    <th>Reembolsado</th>
                                    <th>Payouts cobrados</th>
                                    <th>Neto</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {months.map((row) => (
                                    <tr key={row.month} className="border-b last:border-0">
                                      <td className="py-3">{row.month}</td>
                                      <td>{money(row.spent)}</td>
                                      <td>{money(row.refunds)}</td>
                                      <td>{money(row.received)}</td>
                                      <td>{money(row.net)}</td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          ) : (
                            <Empty>Aún no hay movimientos de caja liquidados.</Empty>
                          )}
                        </CardContent>
                      </Card>
                    </div>
                  )}
                </details>
              </div>
            ) : (
              <div className="space-y-3">
                <div className="flex flex-wrap items-center gap-3">
                  <Input
                    aria-label="Buscar registros de prop firms"
                    className="max-w-sm"
                    placeholder="Buscar firma, cuenta, referencia o estado"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                  />
                  {tab === "accounts" && (
                    <label className="flex items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        checked={showArchived}
                        onChange={(e) => setShowArchived(e.target.checked)}
                      />
                      Mostrar cuentas archivadas
                    </label>
                  )}
                  {tab === "ledger" && (
                    <label className="flex items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        checked={showVoided}
                        onChange={(e) => setShowVoided(e.target.checked)}
                      />
                      Mostrar registros anulados
                    </label>
                  )}
                  <p className="ml-auto text-xs text-muted-foreground">{rowCount} registros</p>
                </div>
                {tab === "accounts" && (
                  <div className="grid gap-3 lg:grid-cols-2">
                    {slice(listedAccounts).map((a) => {
                      const accountSummary = cashSummary(
                        (cashByAccount.get(a.id) ?? []).filter(
                          (row) => row.currency === a.currency,
                        ),
                      );
                      return (
                        <Card key={a.id}>
                          <CardContent className="space-y-4 py-5">
                            <div className="flex items-start justify-between gap-3">
                              <div>
                                <h3 className="font-semibold">{a.name}</h3>
                                <p className="text-xs text-muted-foreground">
                                  {a.firm} · {label(a.program)}
                                  {a.sizeMinor !== null
                                    ? ` · ${money(a.sizeMinor, a.currency)} nominales`
                                    : ""}
                                </p>
                              </div>
                              <span className="rounded-md border px-2 py-1 text-xs">
                                {a.archived ? "Archivada · " : ""}
                                {label(a.status)}
                              </span>
                            </div>
                            <div className="grid grid-cols-3 gap-2 text-sm">
                              <div>
                                <p className="text-xs text-muted-foreground">Gasto neto</p>
                                {money(accountSummary.netSpend, a.currency)}
                              </div>
                              <div>
                                <p className="text-xs text-muted-foreground">Payouts cobrados</p>
                                {money(accountSummary.received, a.currency)}
                              </div>
                              <div>
                                <p className="text-xs text-muted-foreground">Retorno neto</p>
                                {money(accountSummary.net, a.currency)}
                              </div>
                            </div>
                            <p className="text-xs text-muted-foreground">
                              Abierta el {a.openedOn}
                              {a.closedOn ? ` · Resuelta el ${a.closedOn}` : ""}
                              {a.parentId ? ` · Viene de ${name(a.parentId)}` : ""}. La caja sigue
                              las fechas seleccionadas.
                            </p>
                            <div className="flex flex-wrap gap-1">
                              <Button
                                size="sm"
                                variant="outline"
                                disabled={readOnly}
                                onClick={() =>
                                  setModal({ kind: "detail", type: "account", id: a.id })
                                }
                              >
                                Detalles y cobros
                              </Button>
                              <Button
                                size="sm"
                                variant="ghost"
                                disabled={readOnly}
                                onClick={() => setModal({ kind: "account", account: a })}
                              >
                                Editar
                              </Button>
                              <Button
                                size="sm"
                                variant="ghost"
                                disabled={readOnly}
                                onClick={() => setModal({ kind: "account", parent: a })}
                              >
                                Siguiente intento / fase
                              </Button>
                              <Button
                                size="sm"
                                variant="ghost"
                                disabled={readOnly}
                                onClick={() =>
                                  setModal({
                                    kind: "change",
                                    action: "account.archive",
                                    id: a.id,
                                    revision: a.revision,
                                    value: !a.archived,
                                    name: a.archived ? "Restaurar cuenta" : "Archivar cuenta",
                                  })
                                }
                              >
                                {a.archived ? "Restaurar" : "Archivar"}
                              </Button>
                            </div>
                          </CardContent>
                        </Card>
                      );
                    })}
                  </div>
                )}
                {tab === "payouts" && (
                  <>
                    <p className="text-xs text-muted-foreground">
                      Las solicitudes abiertas siempre se ven. Las completadas, rechazadas y
                      canceladas usan el filtro por fecha de solicitud. Los importes esperados son
                      tras tu reparto y las comisiones retenidas; los reales salen solo de los
                      cobros.
                    </p>
                    {slice(listedPayouts).map((row) => (
                      <Card key={row.entry.id}>
                        <CardContent className="space-y-4 py-5">
                          <div className="flex flex-wrap justify-between gap-3">
                            <div>
                              <h3 className="font-medium">
                                {row.entry.firm} · {name(row.entry.accountId)}
                              </h3>
                              <p className="text-xs text-muted-foreground">
                                Solicitado el {row.entry.occurredOn}
                                {row.entry.dueOn ? ` · Previsto el ${row.entry.dueOn}` : ""}
                              </p>
                            </div>
                            <span
                              className={`rounded-md border px-2 py-1 text-xs ${row.overdue ? "border-destructive text-destructive" : ""}`}
                            >
                              {row.overdue
                                ? "Con retraso · "
                                : row.partial
                                  ? "Cobrado en parte · "
                                  : ""}
                              {label(row.entry.status)}
                            </span>
                          </div>
                          <div className="grid gap-3 sm:grid-cols-4">
                            <div>
                              <p className="text-xs text-muted-foreground">Neto esperado</p>
                              {money(row.expected, row.entry.currency)}
                            </div>
                            <div>
                              <p className="text-xs text-muted-foreground">Cobrado real</p>
                              {money(row.actual, row.entry.currency)}
                            </div>
                            <div>
                              <p className="text-xs text-muted-foreground">Pendiente</p>
                              {money(row.remaining, row.entry.currency)}
                            </div>
                            <div>
                              <p className="text-xs text-muted-foreground">Real − esperado</p>
                              {money(row.variance, row.entry.currency)}
                            </div>
                          </div>
                          <div className="flex flex-wrap gap-2">
                            <Button
                              size="sm"
                              disabled={
                                readOnly || ["rejected", "cancelled"].includes(row.entry.status)
                              }
                              onClick={() => setModal({ kind: "receipt", payout: row.entry })}
                            >
                              Registrar cobro / reversión
                            </Button>
                            {entryActions(row.entry)}
                          </div>
                          <details>
                            <summary className="cursor-pointer text-xs">
                              Movimientos de caja · {(receiptsById.get(row.entry.id) ?? []).length}
                            </summary>
                            <div className="mt-2 space-y-2">
                              {(receiptsById.get(row.entry.id) ?? []).map((r) => (
                                <div
                                  key={r.id}
                                  className="flex flex-wrap items-center justify-between gap-2 rounded border p-2 text-xs"
                                >
                                  <span>
                                    {r.occurredOn} · {label(r.kind)} ·{" "}
                                    {money(r.amountMinor, row.entry.currency)}
                                    {r.voided ? " · Anulado" : ""}
                                  </span>
                                  <Button
                                    size="sm"
                                    variant="ghost"
                                    disabled={readOnly || row.entry.voided}
                                    onClick={() =>
                                      setModal({
                                        kind: "change",
                                        action: "receipt.void",
                                        id: r.id,
                                        payoutId: r.payoutId,
                                        revision: row.entry.revision,
                                        value: !r.voided,
                                        name: r.voided
                                          ? "Restaurar movimiento de caja"
                                          : "Anular movimiento de caja",
                                      })
                                    }
                                  >
                                    {r.voided ? "Restaurar" : "Anular"}
                                  </Button>
                                </div>
                              ))}
                            </div>
                          </details>
                        </CardContent>
                      </Card>
                    ))}
                  </>
                )}
                {tab === "ledger" && (
                  <Card>
                    <CardContent className="overflow-x-auto pt-4">
                      <p className="mb-3 text-xs text-muted-foreground">
                        Los gastos y reembolsos usan la fecha de pago; los payouts, la fecha de
                        solicitud. Exporta el CSV de caja para ver cada fecha de liquidación. Las
                        solicitudes de payout no cuentan como ingreso.
                      </p>
                      <table className="w-full min-w-[740px] text-left text-sm">
                        <thead>
                          <tr className="border-b text-xs text-muted-foreground">
                            <th className="py-2">Fecha</th>
                            <th>Firma / cuenta</th>
                            <th>Registro</th>
                            <th>Importe</th>
                            <th>Estado</th>
                            <th>Acciones</th>
                          </tr>
                        </thead>
                        <tbody>
                          {slice(entries).map((entry) => (
                            <tr
                              key={entry.id}
                              className={`border-b last:border-0 ${entry.voided ? "opacity-60" : ""}`}
                            >
                              <td className="py-3 pr-3">{entry.occurredOn}</td>
                              <td className="pr-3">
                                {entry.firm}
                                <p className="text-xs text-muted-foreground">
                                  {name(entry.accountId)}
                                </p>
                              </td>
                              <td className="pr-3">
                                {label(entry.kind)}
                                <p className="text-xs text-muted-foreground">
                                  {entry.kind === "expense"
                                    ? label(entry.category)
                                    : entry.reference}
                                </p>
                              </td>
                              <td className="pr-3 tabular-nums">
                                {money(
                                  entry.kind === "payout"
                                    ? (payoutById.get(entry.id)?.expected ?? 0)
                                    : entry.amountMinor,
                                  entry.currency,
                                )}
                                {entry.kind === "payout" && (
                                  <p className="text-xs text-muted-foreground">Neto esperado</p>
                                )}
                              </td>
                              <td>{entry.voided ? "Anulado" : label(entry.status)}</td>
                              <td>{entryActions(entry)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </CardContent>
                  </Card>
                )}
                {!rowCount && <Empty>Ningún registro coincide con esta vista.</Empty>}
                {rowCount > PAGE_SIZE && (
                  <div className="flex items-center justify-between">
                    <Button
                      variant="outline"
                      disabled={safePage === 0}
                      onClick={() => setPage(safePage - 1)}
                    >
                      Anterior
                    </Button>
                    <span className="text-xs">
                      Página {safePage + 1} de {Math.ceil(rowCount / PAGE_SIZE)}
                    </span>
                    <Button
                      variant="outline"
                      disabled={(safePage + 1) * PAGE_SIZE >= rowCount}
                      onClick={() => setPage(safePage + 1)}
                    >
                      Siguiente
                    </Button>
                  </div>
                )}
              </div>
            )}
            <details className="rounded-xl border p-4 text-xs text-muted-foreground">
              <summary className="cursor-pointer font-medium">
                Cómo se calculan estos números
              </summary>
              <div className="mt-3 space-y-2">
                <p>
                  Retorno neto de caja = payouts cobrados − reversiones de payout + reembolsos de
                  gastos − gastos. Gasto neto = gastos − reembolsos. ROI = retorno neto de caja ÷
                  gasto neto; no se calcula si el gasto neto es cero o negativo.
                </p>
                <p>
                  Los importes usan las unidades menores de cada divisa. Las divisas nunca se
                  convierten ni se combinan solas. Lo que manda es la aprobación real de tu firma,
                  sus reglas de payout y tu extracto bancario.
                </p>
                <p>
                  Los intentos anteriores, las cuentas quemadas y las archivadas siguen contando en
                  el retorno de caja. Los gastos comunes de una firma se incluyen en sus totales,
                  pero no se reparten sin avisar entre las cuentas.
                </p>
                <p>
                  Las solicitudes y los recordatorios nunca mueven dinero. Este seguimiento no abre
                  trades, no conecta bancos, no deduce si puedes pedir payout ni cambia el P&L de
                  trading del journal. Las exportaciones JSON de Ajustes incluyen estos registros y
                  su historial; copia la carpeta de datos para conservar también los adjuntos.
                </p>
              </div>
            </details>
          </>
        )}
        {modal && data && !readOnly && (
          <PropFirmModal modal={modal} data={data} close={() => setModal(null)} refresh={refresh} />
        )}
      </div>
    </div>
  );
}
function EXPENSE_ROWS(rows: CashMovement[]) {
  const groups = new Map<string, number>();
  for (const row of rows)
    if (row.kind === "expense")
      groups.set(row.category, (groups.get(row.category) ?? 0) + row.amountMinor);
  return [...groups]
    .map(([category, amount]) => ({ category, amount }))
    .sort((a, b) => b.amount - a.amount);
}
