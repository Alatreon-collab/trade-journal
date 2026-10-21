"use client";

import { Suspense, useEffect, useState } from "react";
import { JournalDefaultSettings } from "@/components/journal-default-settings";
import { MarketDataSettings } from "@/components/market-data-settings";
import { AiSettings } from "@/components/ai-settings";
import { BackupCard } from "@/components/backup-card";
import { ColorsCard } from "@/components/colors-card";
import { Download } from "lucide-react";
import { FilterBar } from "@/components/filter-bar";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { TimeZonePicker } from "@/components/timezone-picker";
import { Label } from "@/components/ui/label";
import { postJson, useApi } from "@/lib/use-api";

interface SettingsPayload {
  timeZone: string;
  importTimeZone: string;
  multipliers: Record<string, number>;
}

export default function SettingsPage() {
  return (
    <Suspense>
      <Settings />
    </Suspense>
  );
}

function Settings() {
  const { data, refresh } = useApi<SettingsPayload>("/api/settings");
  const [timeZone, setTimeZone] = useState("");
  const [importTimeZone, setImportTimeZone] = useState("");
  const [multipliers, setMultipliers] = useState("");
  const [saved, setSaved] = useState(false);
  const [failure, setFailure] = useState("");

  useEffect(() => {
    if (data) {
      setTimeZone(data.timeZone);
      setImportTimeZone(data.importTimeZone);
      setMultipliers(
        Object.entries(data.multipliers)
          .map(([symbol, multiplier]) => `${symbol}=${multiplier}`)
          .join("\n"),
      );
    }
  }, [data]);

  const save = async () => {
    const parsedMultipliers: Record<string, number> = {};
    for (const line of multipliers.split("\n")) {
      const [symbol, value] = line.split("=").map((part) => part.trim());
      if (symbol && value && Number.isFinite(Number(value))) {
        parsedMultipliers[symbol.toUpperCase()] = Number(value);
      }
    }
    try {
      await postJson(
        "/api/settings",
        { timeZone, importTimeZone, multipliers: parsedMultipliers },
        "PATCH",
      );
      setFailure("");
    } catch (e) {
      setFailure(e instanceof Error ? e.message : "Error al guardar");
      return;
    }
    setSaved(true);
    setTimeout(() => setSaved(false), 1500);
    refresh();
  };

  return (
    <div>
      <FilterBar title="Ajustes" />
      <div className="mx-auto max-w-2xl space-y-3 p-4">
        <JournalDefaultSettings />
        <MarketDataSettings />
        <Card>
          <CardHeader>
            <CardTitle>Journal</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div>
              <Label
                htmlFor="display-timezone"
                className="mb-1 block text-xs text-muted-foreground"
              >
                Zona horaria del journal (IANA)
              </Label>
              <TimeZonePicker
                id="display-timezone"
                label="Zona horaria del journal"
                value={timeZone}
                onValueChange={setTimeZone}
                disabled={!data}
              />
              <p className="mt-1 text-xs text-muted-foreground">
                Las horas de los trades, el calendario, los días del diario y los análisis usan esta
                zona horaria.
              </p>
              <button
                className="mt-1 text-xs text-muted-foreground underline"
                onClick={() => setTimeZone(Intl.DateTimeFormat().resolvedOptions().timeZone)}
              >
                Usar la zona horaria de este dispositivo (
                {Intl.DateTimeFormat().resolvedOptions().timeZone})
              </button>
            </div>
            <div>
              <Label htmlFor="import-timezone" className="mb-1 block text-xs text-muted-foreground">
                Zona horaria de importación por defecto (IANA)
              </Label>
              <TimeZonePicker
                id="import-timezone"
                label="Zona horaria de importación por defecto"
                value={importTimeZone}
                onValueChange={setImportTimeZone}
                disabled={!data}
              />
              <p className="mt-1 text-xs text-muted-foreground">
                Se usa para las horas sin desfase en las importaciones de archivos y en la
                sincronización con IBKR. Puedes cambiarla en cada archivo. Los trades existentes no
                cambian; para corregir la zona horaria de una cuenta IBKR hace falta otra cuenta.
              </p>
            </div>
            <div>
              <Label className="mb-1 block text-xs text-muted-foreground">
                Multiplicadores de contrato (futuros/opciones): uno por línea, SÍMBOLO=multiplicador
              </Label>
              <textarea
                value={multipliers}
                onChange={(event) => setMultipliers(event.target.value)}
                placeholder={"(vacío: escribe aquí tus multiplicadores)\nEjemplo:\nMNQ=2\nNQ=20"}
                className="flex min-h-24 w-full rounded-md border border-input bg-transparent px-3 py-2 font-mono text-sm shadow-sm"
              />
            </div>
            <p className="text-xs text-muted-foreground">
              Al guardar los multiplicadores se recalcula el P&L de los trades existentes a partir
              de las ejecuciones, sin perder tus anotaciones.
            </p>
            {failure && (
              <p role="alert" className="text-xs text-destructive">
                {failure}
              </p>
            )}
            <Button onClick={save} disabled={!data}>
              {saved ? "Guardado ✓" : "Guardar"}
            </Button>
          </CardContent>
        </Card>

        <ColorsCard />

        <AiSettings />

        <BackupCard />

        <Card>
          <CardHeader>
            <CardTitle>Tus datos</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-2">
            <a href="/api/export" download="trade-journal-export.json">
              <Button variant="outline">
                <Download />
                Copia completa (JSON)
              </Button>
            </a>
            <a href="/api/export?format=csv" download>
              <Button variant="outline">
                <Download />
                Trades (CSV)
              </Button>
            </a>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
