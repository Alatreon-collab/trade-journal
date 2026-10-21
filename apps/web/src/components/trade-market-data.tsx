"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { Vela } from "@luxalgo/vela";
import { ChevronLeft, ChevronRight, Pause, Play, RotateCcw, SkipForward } from "lucide-react";
import {
  RESOLUTIONS,
  type MarketConnection,
  type ExcursionEstimate,
  type Resolution,
  type TradeMarketResult,
} from "@/lib/market-data";
import { providerInfo } from "@/lib/market-providers";
import type { MarketCsvDataset } from "@/lib/market-csv";
import { replayFrame } from "@/lib/trade-replay";
import { useApi } from "@/lib/use-api";
import { fmtMoney } from "@/lib/utils";
import { TradeChart, type ChartExecution, type ChartTrade } from "./trade-chart";
import { usePrivacy } from "./privacy";
import { Button } from "./ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "./ui/card";
import { applyChartTimeZone, useJournalTimeZone } from "@/lib/journal-timezone";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import { OptionSelect } from "./ui/option-select";

export function TradeMarketData({
  trade,
  executions,
}: {
  trade: ChartTrade & { currency: string };
  executions: ChartExecution[];
}) {
  const privacy = usePrivacy();
  const { data: saved, refresh: refreshSaved } = useApi<{
    saved: { estimate: ExcursionEstimate } | null;
  }>(`/api/trades/${encodeURIComponent(trade.key)}/market-data`);
  const { data: connections, error: connectionError } = useApi<{ connections: MarketConnection[] }>(
    "/api/market-data/connections",
  );
  const available = connections?.connections.filter((connection) => connection.configured) ?? [];
  const [provider, setProvider] = useState("");
  const [symbol, setSymbol] = useState(trade.symbol);
  const [dataset, setDataset] = useState("");
  const [resolution, setResolution] = useState<Resolution>("1m");
  const info = providerInfo(provider);
  const { data: csv } = useApi<{ datasets: MarketCsvDataset[] }>(
    info?.mode === "csv" ? "/api/market-data/csv" : null,
  );
  const [confirmed, setConfirmed] = useState(false);
  const [result, setResult] = useState<TradeMarketResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const controller = useRef<AbortController | null>(null);
  useEffect(() => () => controller.current?.abort(), []);
  const invalidate = () => {
    controller.current?.abort();
    setBusy(false);
    setResult(null);
    setError("");
  };
  const load = async () => {
    if (!available.some((item) => item.id === provider) || (info?.datasets && !dataset)) return;
    controller.current?.abort();
    const request = new AbortController();
    controller.current = request;
    setBusy(true);
    setError("");
    setResult(null);
    try {
      const response = await fetch(`/api/trades/${encodeURIComponent(trade.key)}/market-data`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          provider,
          symbol,
          dataset,
          resolution,
          basisConfirmed: confirmed,
        }),
        signal: request.signal,
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "Falló la petición de histórico.");
      if (!request.signal.aborted) {
        setResult(body);
        refreshSaved();
      }
    } catch (cause) {
      if (!request.signal.aborted)
        setError(cause instanceof Error ? cause.message : "Falló la petición de histórico.");
    } finally {
      if (!request.signal.aborted) setBusy(false);
    }
  };
  return (
    <div className="space-y-3">
      <Card>
        <CardHeader>
          <CardTitle>Datos de mercado y replay</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-muted-foreground">
            Carga las velas de este trade para usar el replay. Marca la casilla para calcular
            también y guardar las estimaciones de MAE/MFE en dinero para Informes.
          </p>
          {connectionError && (
            <p role="alert" className="text-sm text-destructive">
              {connectionError}
            </p>
          )}
          {!available.length && (
            <p className="text-sm text-muted-foreground">
              <a className="underline" href="/settings#market-data">
                Conecta un proveedor de datos de mercado en Ajustes
              </a>{" "}
              para usar el replay histórico y las estimaciones.
            </p>
          )}
          {!trade.closedAt ? (
            <p className="text-sm text-muted-foreground">Disponible cuando se cierre este trade.</p>
          ) : (
            available.length > 0 && (
              <>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="space-y-1">
                    <Label htmlFor="market-provider">Proveedor de datos</Label>
                    <OptionSelect
                      id="market-provider"
                      value={provider}
                      onValueChange={(value) => {
                        invalidate();
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
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="market-symbol">Símbolo en el proveedor</Label>
                    <Input
                      id="market-symbol"
                      value={symbol}
                      onChange={(event) => {
                        invalidate();
                        setSymbol(event.target.value);
                        setConfirmed(false);
                      }}
                    />
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="market-resolution">Temporalidad de las velas</Label>
                    <OptionSelect
                      id="market-resolution"
                      value={resolution}
                      onValueChange={(value) => {
                        invalidate();
                        setResolution(value as Resolution);
                      }}
                    >
                      {Object.keys(RESOLUTIONS).map((value) => (
                        <option key={value} value={value}>
                          {value}
                        </option>
                      ))}
                    </OptionSelect>
                  </div>
                  {(info?.datasets ||
                    info?.mode === "csv" ||
                    info?.id === "london-strategic-edge") && (
                    <div className="space-y-1">
                      <Label htmlFor="market-dataset">Feed / conjunto de datos</Label>
                      {info?.datasets || info?.mode === "csv" ? (
                        <OptionSelect
                          id="market-dataset"
                          value={dataset}
                          onValueChange={(value) => {
                            invalidate();
                            setDataset(value);
                            setConfirmed(false);
                          }}
                        >
                          {(
                            info.datasets ?? [
                              { value: "", label: "Archivo que coincida (automático)" },
                              ...(csv?.datasets ?? []).map((item) => ({
                                value: item.id,
                                label: `${item.name} · ${item.symbol} · ${item.resolution}`,
                              })),
                            ]
                          ).map((item) => (
                            <option key={item.value} value={item.value}>
                              {item.label}
                            </option>
                          ))}
                        </OptionSelect>
                      ) : (
                        <Input
                          id="market-dataset"
                          value={dataset}
                          placeholder="Déjalo vacío para elegir automáticamente"
                          onChange={(event) => {
                            invalidate();
                            setDataset(event.target.value);
                            setConfirmed(false);
                          }}
                        />
                      )}
                    </div>
                  )}
                </div>
                <p className="text-xs text-muted-foreground">
                  {info?.description} {info?.symbolHint} Aún no se admite el histórico de contratos
                  de opciones.
                </p>
                <label className="flex items-start gap-2 text-xs text-muted-foreground">
                  <input
                    type="checkbox"
                    checked={confirmed}
                    className="mt-0.5"
                    onChange={(event) => {
                      invalidate();
                      setConfirmed(event.target.checked);
                    }}
                  />
                  <span>
                    Calcular y guardar las estimaciones de MAE/MFE para Informes. Confirmo que este
                    instrumento, los ajustes de precio y la divisa coinciden con mis ejecuciones y
                    mi cuenta ({trade.currency}).
                  </span>
                </label>
                <p className="text-xs text-muted-foreground">
                  Sin marcar: solo carga velas y replay. Marcada: además calcula las estimaciones en
                  dinero y guarda los resultados válidos en Informes. Si faltan datos o no
                  coinciden, no se muestran.
                </p>
                <div className="flex flex-wrap gap-2">
                  <Button
                    disabled={
                      busy ||
                      !symbol.trim() ||
                      !available.some((item) => item.id === provider) ||
                      Boolean(info?.datasets && !dataset)
                    }
                    onClick={() => void load()}
                  >
                    {busy
                      ? "Cargando histórico…"
                      : confirmed
                        ? "Cargar datos y guardar estimaciones"
                        : "Cargar velas y replay"}
                  </Button>
                  {busy && (
                    <Button variant="outline" onClick={invalidate}>
                      Cancelar
                    </Button>
                  )}
                  {result && (
                    <Button variant="outline" onClick={invalidate}>
                      Ver gráfico original
                    </Button>
                  )}
                </div>
              </>
            )
          )}
          {error && (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}
        </CardContent>
      </Card>
      {!result && saved?.saved && (
        <p className="text-xs text-muted-foreground">
          Abajo se muestran las estimaciones de MAE/MFE guardadas antes. Si cargas velas sin marcar
          la casilla, se mantienen; no se calculan nuevas.
        </p>
      )}
      {result && result.bars.length > 0 ? (
        <HistoricalReplay
          history={result}
          trade={trade}
          executions={executions}
          privacy={privacy}
        />
      ) : (
        <>
          <div
            className="grid gap-3 rounded-lg border bg-card p-3 sm:grid-cols-3"
            aria-label="Estado de los datos de mercado"
          >
            <div>
              <p className="text-xs text-muted-foreground">MAE estimado</p>
              <p className="text-sm">
                {busy
                  ? "Cargando velas…"
                  : error
                    ? "Falló la petición de datos"
                    : saved?.saved
                      ? privacy
                        ? "••••"
                        : fmtMoney(saved.saved.estimate.mae!, trade.currency)
                      : "Carga datos de mercado para calcularlo"}
              </p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">MFE estimado</p>
              <p className="text-sm">
                {busy
                  ? "Cargando velas…"
                  : error
                    ? "Falló la petición de datos"
                    : saved?.saved
                      ? privacy
                        ? "••••"
                        : fmtMoney(saved.saved.estimate.mfe!, trade.currency)
                      : "Carga datos de mercado para calcularlo"}
              </p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Replay del trade</p>
              <p className="text-sm">
                {busy ? "Cargando velas…" : "Disponible al cargar las velas"}
              </p>
            </div>
          </div>
          {result && (
            <p role="status" className="text-sm text-muted-foreground">
              No se han devuelto velas para este instrumento y periodo. Revisa el símbolo, el
              conjunto de datos y la cobertura de tu plan.
            </p>
          )}
          <TradeChart trade={trade} executions={executions} />
        </>
      )}
    </div>
  );
}

export function HistoricalReplay({
  history,
  trade,
  executions,
  privacy,
}: {
  history: TradeMarketResult;
  trade: ChartTrade & { currency: string };
  executions: ChartExecution[];
  privacy: boolean;
}) {
  const [count, setCount] = useState(history.bars.length);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState("4");
  useEffect(() => {
    setCount(history.bars.length);
    setPlaying(false);
  }, [history]);
  useEffect(() => {
    if (!playing || privacy) return;
    const timer = window.setInterval(
      () => {
        if (!document.hidden) setCount((current) => Math.min(current + 1, history.bars.length));
      },
      1000 / Number(speed),
    );
    return () => window.clearInterval(timer);
  }, [playing, privacy, speed, history.bars.length]);
  useEffect(() => {
    if (count >= history.bars.length || privacy) setPlaying(false);
  }, [count, privacy, history.bars.length]);
  const complete = count === history.bars.length;
  const frame = useMemo(
    () => replayFrame(history, history.estimate.priceBasisMismatch ? [] : executions, count),
    [history, executions, count],
  );
  return (
    <Card className="journal-replay-enter">
      <CardHeader>
        <CardTitle>Velas históricas</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-xs text-muted-foreground">
          {history.provider} · {history.symbol} · {history.resolution} ·{" "}
          {history.bars.length.toLocaleString("es-ES")} velas · Descargadas el{" "}
          {new Date(history.fetchedAt).toLocaleString("es-ES")}
        </p>
        {privacy ? (
          <p className="text-sm text-muted-foreground">
            Los precios históricos y los importes de excursión se ocultan en modo privado.
          </p>
        ) : (
          <>
            {history.estimate.priceBasisMismatch && (
              <p role="status" className="rounded-md border p-3 text-sm text-muted-foreground">
                Las velas de mercado y los precios de tus ejecuciones no coinciden. El replay
                muestra los precios de mercado; las etiquetas de ejecución y el MAE/MFE no se
                muestran. Mira los límites de los datos abajo.
              </p>
            )}
            <ReplayChart history={history} nextFrame={frame} />
            <div
              className="flex flex-wrap items-center gap-2 rounded-lg border bg-muted/30 p-2"
              role="group"
              aria-label="Controles del replay"
            >
              <Button
                variant="outline"
                size="icon"
                aria-label="Reiniciar replay"
                onClick={() => {
                  setPlaying(false);
                  setCount(1);
                }}
              >
                <RotateCcw />
              </Button>
              <Button
                variant="outline"
                size="icon"
                aria-label="Vela anterior"
                disabled={count <= 1}
                onClick={() => {
                  setPlaying(false);
                  setCount((current) => Math.max(1, current - 1));
                }}
              >
                <ChevronLeft />
              </Button>
              <Button
                className="min-w-24"
                disabled={history.bars.length <= 1}
                onClick={() => {
                  if (complete) setCount(1);
                  setPlaying(!playing);
                }}
              >
                {playing ? <Pause /> : <Play />}
                {playing ? "Pausa" : "Play"}
              </Button>
              <Button
                variant="outline"
                size="icon"
                aria-label="Vela siguiente"
                disabled={complete}
                onClick={() => {
                  setPlaying(false);
                  setCount((current) => Math.min(current + 1, history.bars.length));
                }}
              >
                <ChevronRight />
              </Button>
              <Button
                variant="outline"
                size="icon"
                aria-label="Mostrar todas las velas"
                disabled={complete}
                onClick={() => {
                  setPlaying(false);
                  setCount(history.bars.length);
                }}
              >
                <SkipForward />
              </Button>
              <span className="mx-1 text-xs tabular-nums text-muted-foreground" aria-live="off">
                {count.toLocaleString()} / {history.bars.length.toLocaleString()}
              </span>
              <OptionSelect
                aria-label="Velocidad del replay"
                className="ml-auto w-20"
                value={speed}
                onValueChange={setSpeed}
              >
                <option value="1">1×</option>
                <option value="2">2×</option>
                <option value="4">4×</option>
              </OptionSelect>
            </div>
            <input
              aria-label="Posición del replay"
              type="range"
              min={1}
              max={history.bars.length}
              value={count}
              className="w-full accent-primary"
              onChange={(event) => {
                setPlaying(false);
                setCount(Number(event.target.value));
              }}
            />
            <p className="text-xs text-muted-foreground">
              {count} / {history.bars.length} velas · Hasta {new Date(frame.through).toISOString()}{" "}
              (UTC). Las velas aparecen al cerrar; no es una simulación tick a tick.
            </p>
          </>
        )}
        <div className="grid grid-cols-2 gap-3 rounded-lg border p-3">
          <div>
            <p className="text-xs text-muted-foreground">MAE estimado · en contra</p>
            <p className="font-medium">
              {privacy
                ? "••••"
                : !complete
                  ? "Oculto durante el replay"
                  : history.estimate.mae === null
                    ? "No disponible"
                    : fmtMoney(history.estimate.mae, trade.currency).replace(/^\+/, "")}
            </p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">MFE estimado · a favor</p>
            <p className="font-medium">
              {privacy
                ? "••••"
                : !complete
                  ? "Oculto durante el replay"
                  : history.estimate.mfe === null
                    ? "No disponible"
                    : fmtMoney(history.estimate.mfe, trade.currency).replace(/^\+/, "")}
            </p>
          </div>
        </div>
        <details className="text-xs text-muted-foreground" open>
          <summary className="cursor-pointer">
            Cobertura de datos y límites de la estimación
          </summary>
          <ul className="mt-2 list-disc space-y-1 pl-4">
            {[...history.warnings, ...history.estimate.warnings].map((warning) => (
              <li key={warning}>{warning}</li>
            ))}
          </ul>
        </details>
      </CardContent>
    </Card>
  );
}

function ReplayChart({
  history,
  nextFrame,
}: {
  history: TradeMarketResult;
  nextFrame: ReturnType<typeof replayFrame<ChartExecution>>;
}) {
  const host = useRef<HTMLDivElement>(null);
  const chart = useRef<Vela | null>(null);
  const frame = useRef(nextFrame);
  const latest = useRef(nextFrame);
  latest.current = nextFrame;
  const update = useRef<(() => void) | null>(null);
  const [error, setError] = useState("");
  const [ready, setReady] = useState(false);
  const timeZone = useJournalTimeZone();
  const timeZoneRef = useRef(timeZone);
  timeZoneRef.current = timeZone;
  useEffect(() => applyChartTimeZone(chart.current, timeZone), [timeZone, ready]);
  useEffect(() => {
    let disposed = false;
    let cleanup = () => {};
    setError("");
    setReady(false);
    void (async () => {
      const { Vela, registerNativeIndicator, unregisterNativeIndicator } =
        await import("@luxalgo/vela");
      if (disposed || !host.current) return;
      const type = `replay-fills-${crypto.randomUUID()}`;
      registerNativeIndicator({
        type,
        title: "Ejecuciones registradas",
        paneHint: "price",
        overlay: true,
        inputsSchema: () => [],
        defaultInputs: () => ({}),
        create: () => ({
          start(ctx) {
            ctx.emit({
              labels: frame.current.fills.map((fill, index) => ({
                id: `fill-${index}`,
                paneId: "price",
                xloc: "bar_time" as const,
                x: Date.parse(fill.executedAt),
                y: fill.price,
                yloc: "price" as const,
                text: `${fill.side.toUpperCase()} ${fill.quantity}`,
                style: "label_left" as const,
                color: fill.side === "buy" ? "#087f23" : "#bd2626",
                textColor: "#ffffff",
                size: "small" as const,
                textAlign: "center" as const,
                fontFamily: "default" as const,
                overlay: true,
              })),
            });
            ctx.setStatus("idle");
          },
          onBars() {},
          onViewport() {},
          setInputs() {},
          suspend() {},
          resume() {},
          stop() {},
        }),
      });
      const dark = () => document.documentElement.classList.contains("dark");
      const instance = new Vela(host.current, {
        symbol: history.symbol,
        timeframe: { "1m": "1", "5m": "5", "15m": "15", "1h": "60", "1d": "1D" }[
          history.resolution
        ],
        data: latest.current.bars,
        live: false,
        height: 420,
        theme: dark() ? "dark" : "light",
        priceStyle: "candles",
        volume: true,
        drawings: false,
      });
      chart.current = instance;
      applyChartTimeZone(instance, timeZoneRef.current);
      frame.current = latest.current;
      instance.addNativeIndicator(type);
      let updating = false;
      // Coalesce rapid scrubbing/ticks instead of queuing expensive Vela reloads.
      const flush = async () => {
        if (updating || disposed) return;
        updating = true;
        try {
          do {
            frame.current = latest.current;
            await instance.setMarket({ data: frame.current.bars });
          } while (!disposed && frame.current !== latest.current);
        } catch {
          if (!disposed) setError("No se pudo actualizar el gráfico del replay.");
        } finally {
          updating = false;
        }
      };
      update.current = () => {
        void flush();
      };
      const observer = new MutationObserver(() => instance.setTheme(dark() ? "dark" : "light"));
      observer.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
      cleanup = () => {
        update.current = null;
        observer.disconnect();
        instance.destroy();
        unregisterNativeIndicator(type);
        if (chart.current === instance) chart.current = null;
      };
      await instance.ready();
      if (!disposed) setReady(true);
    })().catch(() => {
      if (!disposed) setError("No se pudo dibujar el gráfico histórico.");
    });
    return () => {
      disposed = true;
      cleanup();
    };
  }, [history]);
  useEffect(() => {
    update.current?.();
  }, [nextFrame, history]);
  return (
    <>
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      <div
        className="relative h-[420px] overflow-hidden rounded-lg border"
        aria-busy={!ready && !error}
      >
        {!ready && !error && (
          <div
            className="absolute inset-0 flex items-center justify-center bg-muted/20 text-sm text-muted-foreground"
            role="status"
          >
            Preparando el replay…
          </div>
        )}
        <div ref={host} className={`h-full ${ready ? "journal-replay-reveal" : "invisible"}`} />
      </div>
    </>
  );
}
