"use client";

import { useEffect, useRef, useState } from "react";
import {
  RESOLUTIONS,
  type Resolution,
  type MarketConnection,
  type TradeMarketResult,
} from "@/lib/market-data";
import type { TradePoint } from "@/lib/trade-explorer";
import { providerInfo } from "@/lib/market-providers";
import { useApi } from "@/lib/use-api";
import { Button } from "./ui/button";
import { OptionSelect } from "./ui/option-select";

export function ReportMarketEstimates({
  points,
  currencies,
  onComplete,
}: {
  points: TradePoint[];
  currencies: string[];
  onComplete: () => void;
}) {
  const { data } = useApi<{ connections: MarketConnection[] }>("/api/market-data/connections");
  const available = data?.connections.filter((item) => item.configured) ?? [];
  const [provider, setProvider] = useState("");
  const [dataset, setDataset] = useState("");
  const [resolution, setResolution] = useState<Resolution>("1m");
  const info = providerInfo(provider);
  const [confirmed, setConfirmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");
  const [issues, setIssues] = useState<string[]>([]);
  const controller = useRef<AbortController | null>(null);
  useEffect(() => () => controller.current?.abort(), []);
  const missing = points.filter((point) => point.mae === null || point.mfe === null);
  const calculate = async () => {
    if (!available.some((item) => item.id === provider) || (info?.datasets && !dataset)) return;
    const request = new AbortController();
    controller.current = request;
    setBusy(true);
    setIssues([]);
    let saved = 0,
      failed = 0,
      completed = 0,
      consecutiveFailures = 0;
    const problems = new Set<string>();
    try {
      for (const point of missing) {
        if (request.signal.aborted) break;
        setStatus(`Calculando ${completed + 1} de ${missing.length} · ${point.symbol}`);
        try {
          const response = await fetch(`/api/trades/${encodeURIComponent(point.key)}/market-data`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              provider,
              symbol: point.symbol,
              resolution,
              dataset,
              basisConfirmed: true,
              estimateOnly: true,
            }),
            signal: request.signal,
          });
          const body = (await response.json()) as TradeMarketResult & { error?: string };
          if (!response.ok) throw new Error(body.error ?? "Falló la petición de histórico.");
          if (body.estimate.mae === null || body.estimate.mfe === null)
            throw new Error(body.estimate.warnings[0] ?? "Estimación no disponible.");
          saved++;
          consecutiveFailures = 0;
        } catch (cause) {
          if (request.signal.aborted) break;
          failed++;
          consecutiveFailures++;
          problems.add(
            `${point.symbol}: ${cause instanceof Error ? cause.message : "Falló la petición de histórico."}`,
          );
          setIssues([...problems].slice(0, 3));
        }
        completed++;
        // Stop a systemic provider failure instead of repeating it across an entire account.
        if (consecutiveFailures >= 3) break;
      }
    } finally {
      setBusy(false);
      setStatus(
        `${request.signal.aborted ? "Detenido. " : ""}${saved} estimaciones guardadas · ${failed} no disponibles · ${missing.length - completed} sin procesar.`,
      );
      onComplete();
    }
  };
  return (
    <div className="space-y-3 rounded-xl border bg-card p-4">
      <div>
        <h3 className="text-sm font-medium">Estimaciones de MAE y MFE</h3>
        <p className="mt-1 text-xs text-muted-foreground">
          {points.length - missing.length} de {points.length} trades cerrados tienen estimaciones
          guardadas. Las excursiones brutas estimadas no incluyen comisiones; el MAE se muestra como
          un importe adverso positivo. Los valores que faltan no se dibujan; nunca cuentan como
          cero.
        </p>
      </div>
      {missing.length > 0 && (
        <details>
          <summary className="cursor-pointer text-sm">Calcular las estimaciones que faltan</summary>
          <div className="mt-3 space-y-3">
            <p className="text-xs text-muted-foreground">
              Carga velas de {resolution} para esta selección usando el símbolo guardado en cada
              trade. Consume el cupo de tu proveedor y puede tardar varios minutos. Para símbolos
              personalizados o un CSV concreto, carga y guarda las estimaciones desde cada trade.
            </p>
            {available.length ? (
              <>
                <OptionSelect
                  aria-label="Proveedor de datos para la estimación"
                  value={provider}
                  disabled={busy}
                  onValueChange={(value) => {
                    setProvider(value);
                    setDataset("");
                    setConfirmed(false);
                  }}
                >
                  <option value="" disabled>
                    Elige una fuente de datos
                  </option>
                  {available.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.name}
                    </option>
                  ))}
                </OptionSelect>
                <OptionSelect
                  aria-label="Temporalidad de las velas"
                  disabled={busy}
                  value={resolution}
                  onValueChange={(value) => setResolution(value as Resolution)}
                >
                  {Object.keys(RESOLUTIONS).map((value) => (
                    <option key={value} value={value}>
                      {value}
                    </option>
                  ))}
                </OptionSelect>
                {info?.datasets && (
                  <OptionSelect
                    aria-label="Conjunto de datos"
                    value={dataset}
                    disabled={busy}
                    onValueChange={(value) => {
                      setDataset(value);
                      setConfirmed(false);
                    }}
                  >
                    {info.datasets.map((item) => (
                      <option key={item.value} value={item.value}>
                        {item.label}
                      </option>
                    ))}
                  </OptionSelect>
                )}
                <p className="text-xs text-muted-foreground">{info?.symbolHint}</p>
                <label className="flex items-start gap-2 text-xs text-muted-foreground">
                  <input
                    type="checkbox"
                    checked={confirmed}
                    disabled={busy || currencies.length !== 1}
                    onChange={(event) => setConfirmed(event.target.checked)}
                  />
                  Confirmo que estos símbolos, ajustes de precio y divisas coinciden con las
                  ejecuciones y la divisa de la cuenta ({currencies.join(", ") || "ninguna"}).
                </label>
                {currencies.length > 1 && (
                  <p className="text-xs text-muted-foreground">
                    Selecciona cuentas con una sola divisa para calcular las estimaciones juntas.
                  </p>
                )}
                <Button
                  disabled={
                    busy ||
                    !confirmed ||
                    currencies.length !== 1 ||
                    !available.some((item) => item.id === provider) ||
                    Boolean(info?.datasets && !dataset)
                  }
                  onClick={() => void calculate()}
                >
                  Calcular {missing.length} estimaciones pendientes
                </Button>
              </>
            ) : (
              <a className="text-sm underline" href="/settings#market-data">
                Conecta un proveedor de datos de mercado en Ajustes
              </a>
            )}
          </div>
        </details>
      )}
      {busy && (
        <Button variant="outline" onClick={() => controller.current?.abort()}>
          Detener cálculo
        </Button>
      )}
      {status && (
        <p role="status" className="text-xs text-muted-foreground">
          {status}
        </p>
      )}
      {issues.length > 0 && (
        <ul className="space-y-1 text-xs text-destructive">
          {issues.map((issue) => (
            <li key={issue}>{issue}</li>
          ))}
        </ul>
      )}
    </div>
  );
}
