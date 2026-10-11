"use client";

import { Suspense, useState } from "react";
import { Archive, ArchiveRestore, RefreshCw, Trash2 } from "lucide-react";
import { FilterBar } from "@/components/filter-bar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { postJson, useApi } from "@/lib/use-api";
import { fmtMoney } from "@/lib/utils";
import { MonetaryValue, MonetaryField } from "@/components/privacy";

interface AccountRow {
  id: string;
  name: string;
  broker: string;
  kind: "sync" | "import" | "manual";
  currency: string;
  initialBalance: number;
  profitCalcMethod: "fifo" | "lifo" | "wavg";
  autoSync: boolean;
  lastSyncAt: string | null;
  archivedAt: string | null;
  connected: boolean;
  snapshot: { equity: number; positions: unknown[] } | null;
}

export default function AccountsPage() {
  return (
    <Suspense>
      <Accounts />
    </Suspense>
  );
}

function Accounts() {
  const { data, refresh } = useApi<{ accounts: AccountRow[] }>("/api/accounts");
  const [syncing, setSyncing] = useState<string | null>(null);

  const action = async <T = unknown,>(id: string, body: Record<string, unknown>) => {
    const result = await postJson<T>(`/api/accounts/${id}/actions`, body);
    refresh();
    return result;
  };

  const sync = async (id: string) => {
    setSyncing(id);
    try {
      const { sync: outcome } = await action<{
        sync: { inserted: number; skipped: number; skippedReasons: string[] };
      }>(id, { action: "sync" });
      if (outcome.skipped > 0)
        alert(
          `Sincronización terminada con ${outcome.inserted} ejecuciones nuevas. Se omitieron ${outcome.skipped} registro(s) del bróker: ${outcome.skippedReasons.join(" ")}`,
        );
    } catch (error) {
      alert(error instanceof Error ? error.message : "Falló la sincronización");
    } finally {
      setSyncing(null);
    }
  };

  return (
    <div>
      <FilterBar title="Cuentas" />
      <div className="grid gap-3 p-4 md:grid-cols-2">
        {data?.accounts.length === 0 && (
          <p className="col-span-full py-16 text-center text-sm text-muted-foreground">
            Aún no hay cuentas: crea una en la página Importar.
          </p>
        )}
        {data?.accounts.map((account) => (
          <Card key={account.id} className={account.archivedAt ? "opacity-60" : undefined}>
            <CardHeader className="flex-row flex-wrap items-center justify-between gap-2">
              <CardTitle className="min-w-0 flex-1 text-base font-semibold normal-case tracking-normal text-foreground">
                <span className="block break-words">{account.name}</span>
                <Badge variant="secondary" className="mt-1.5 mr-2">
                  {account.kind === "sync"
                    ? "sincronizada"
                    : account.kind === "import"
                      ? "importada"
                      : "manual"}
                </Badge>
                {account.broker && (
                  <span className="text-xs font-normal text-muted-foreground">
                    {account.broker}
                  </span>
                )}
              </CardTitle>
              <div className="ml-auto flex shrink-0 items-center gap-1">
                {account.kind === "sync" && (
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8"
                    disabled={syncing === account.id}
                    onClick={() => void sync(account.id)}
                    title="Sincronizar ahora"
                  >
                    <RefreshCw className={syncing === account.id ? "animate-spin" : undefined} />
                  </Button>
                )}
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8"
                  title={account.archivedAt ? "Desarchivar" : "Archivar"}
                  onClick={() =>
                    void action(account.id, {
                      action: account.archivedAt ? "unarchive" : "archive",
                    })
                  }
                >
                  {account.archivedAt ? <ArchiveRestore /> : <Archive />}
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 text-muted-foreground hover:text-destructive"
                  title="Borrar cuenta"
                  onClick={async () => {
                    if (
                      confirm(`¿Borrar "${account.name}" y TODOS sus trades? No se puede deshacer.`)
                    ) {
                      await postJson(`/api/accounts/${account.id}`, undefined, "DELETE");
                      refresh();
                    }
                  }}
                >
                  <Trash2 />
                </Button>
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              {account.snapshot && (
                <div className="text-sm">
                  Equity en el bróker:{" "}
                  <span className="tnum font-medium">
                    <MonetaryValue>{fmtMoney(account.snapshot.equity)}</MonetaryValue>
                  </span>
                  <span className="ml-2 text-xs text-muted-foreground">
                    {account.snapshot.positions.length} posiciones abiertas · sincronizado{" "}
                    {account.lastSyncAt?.slice(0, 16).replace("T", " ")}
                  </span>
                </div>
              )}
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div>
                  <label className="text-xs text-muted-foreground">
                    Saldo inicial (base del % de drawdown)
                  </label>
                  <MonetaryField>
                    <Input
                      defaultValue={account.initialBalance || ""}
                      placeholder="0"
                      inputMode="decimal"
                      onBlur={async (event) => {
                        const value = Number(event.target.value || 0);
                        if (value !== account.initialBalance) {
                          await postJson(
                            `/api/accounts/${account.id}`,
                            { initialBalance: value },
                            "PATCH",
                          );
                          refresh();
                        }
                      }}
                    />
                  </MonetaryField>
                </div>
                <div>
                  <label className="text-xs text-muted-foreground">Cálculo del beneficio</label>
                  <Select
                    value={account.profitCalcMethod}
                    onValueChange={async (value) => {
                      await postJson(
                        `/api/accounts/${account.id}`,
                        { profitCalcMethod: value },
                        "PATCH",
                      );
                      refresh();
                    }}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="fifo">FIFO</SelectItem>
                      <SelectItem value="lifo">LIFO</SelectItem>
                      <SelectItem value="wavg">Media ponderada</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={async () => {
                    if (
                      confirm(
                        `¿Borrar TODOS los trades de "${account.name}"? La cuenta se mantiene.`,
                      )
                    ) {
                      await action(account.id, { action: "clear" });
                    }
                  }}
                >
                  Vaciar trades
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={async () => {
                    const others = data.accounts.filter((candidate) => candidate.id !== account.id);
                    if (others.length === 0)
                      return alert("No hay otra cuenta a la que transferir.");
                    const target = prompt(
                      `¿A qué cuenta quieres transferir todos los datos?\n${others.map((candidate, index) => `${index + 1}. ${candidate.name}`).join("\n")}\n\nEscribe un número:`,
                    );
                    const chosen = others[Number(target) - 1];
                    if (chosen) {
                      try {
                        await action(account.id, { action: "transfer", toAccountId: chosen.id });
                      } catch (error) {
                        alert(error instanceof Error ? error.message : "Falló la transferencia");
                      }
                    }
                  }}
                >
                  Transferir datos
                </Button>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
