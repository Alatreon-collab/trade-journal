"use client";

import type { ImportReview, ImportReviewOptions } from "@/lib/import-review";
import { Button } from "@/components/ui/button";
import { fmtMoney } from "@/lib/utils";

export function ImportReconciliation({
  review,
  options,
  onChange,
  onReview,
  busy,
}: {
  review?: ImportReview;
  options: ImportReviewOptions;
  onChange: (next: ImportReviewOptions) => void;
  onReview: () => void;
  busy: boolean;
}) {
  return (
    <div className="space-y-3 border-t pt-3">
      <p className="text-sm font-medium">Revisar importación de NinjaTrader</p>
      <p className="text-xs text-muted-foreground">
        Mantén separada cada cuenta de origen dentro de la cuenta del journal que has elegido.
        Revisa el resultado antes de guardar.
      </p>
      {review && (
        <>
          {review.sources.map((source) => (
            <label key={source.key} className="block space-y-1 text-sm">
              <span>{source.label}</span>
              <select
                aria-label={`Cuenta de origen para ${source.label}`}
                disabled={busy || source.saved}
                className="block w-full rounded-md border bg-background p-2 text-sm"
                value={options.sourceMappings?.[source.key] ?? source.selected ?? ""}
                onChange={(event) =>
                  onChange({
                    ...options,
                    sourceMappings: { ...options.sourceMappings, [source.key]: event.target.value },
                  })
                }
              >
                <option value="">Elige la cuenta de origen de este archivo</option>
                {review.savedSources.map((saved) => (
                  <option key={saved.id} value={saved.id}>
                    {saved.name}
                  </option>
                ))}
                <option value="new">Crear una cuenta de origen aparte</option>
              </select>
            </label>
          ))}
          <p className="text-xs text-muted-foreground">
            Si una cuenta o conexión ha cambiado de nombre, elige su origen existente. Elige uno
            nuevo solo si de verdad es otra cuenta.
          </p>
          <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm" role="status">
            <span>{review.inserted} ejecuciones nuevas</span>
            <span>{review.duplicates} ejecuciones duplicadas</span>
            <span>{review.corrections.length} comisiones corregidas</span>
          </div>
          {review.multipliers.map((item) => (
            <p key={item.symbol} className="text-xs">
              Multiplicador de {item.symbol}: {item.value ?? "falta, configúralo en Ajustes"}
            </p>
          ))}
          {review.multipliers.some((item) => item.value === null) && (
            <a className="text-sm underline" href="/settings" target="_blank" rel="noreferrer">
              Abre Ajustes y vuelve a revisar
            </a>
          )}
          {review.totals && (
            <div className="rounded-md bg-muted/40 p-3 text-sm">
              <p className="font-medium">Cuenta de destino tras importar ({review.currency})</p>
              <p>
                {review.totals.closedTrades} trades cerrados · {review.totals.openTrades} abiertos
              </p>
              <p>
                P&amp;L neto de trades cerrados: {fmtMoney(review.totals.netPnl, review.currency)} ·
                Comisiones: {fmtMoney(review.totals.fees, review.currency)}
              </p>
            </div>
          )}
          {review.needsCompleteHistory && (
            <label className="flex items-start gap-2 text-sm">
              <input
                type="checkbox"
                checked={!!options.completeHistory}
                disabled={busy}
                onChange={(event) =>
                  onChange({ ...options, completeHistory: event.target.checked })
                }
              />
              <span>
                Esta exportación incluye todas las ejecuciones de cada contrato listado entre su
                primera y su última hora. No es una selección parcial de ejecuciones repetidas.
              </span>
            </label>
          )}
          {!!review.corrections.length && (
            <div className="space-y-2">
              {review.corrections.slice(0, 10).map((correction, index) => (
                <p key={index} className="text-xs">
                  {correction.symbol} · {correction.executedAt}: comisión{" "}
                  {fmtMoney(correction.oldFee, review.currency)} →{" "}
                  {fmtMoney(correction.newFee, review.currency)}
                </p>
              ))}
              {review.corrections.length > 10 && (
                <p className="text-xs">
                  Y {review.corrections.length - 10} correcciones de comisión más.
                </p>
              )}
              <label className="flex items-start gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={!!options.approveFeeCorrections}
                  disabled={busy}
                  onChange={(event) =>
                    onChange({ ...options, approveFeeCorrections: event.target.checked })
                  }
                />
                <span>
                  Aplicar estas correcciones de comisión a las ejecuciones existentes y recalcular
                  el P&amp;L.
                </span>
              </label>
            </div>
          )}
          {review.warnings.map((message) => (
            <p key={message} className="text-xs text-muted-foreground">
              {message}
            </p>
          ))}
          {review.conflicts.map((message) => (
            <p key={message} role="alert" className="text-xs text-loss">
              {message}
            </p>
          ))}
        </>
      )}
      <Button variant="outline" disabled={busy} onClick={onReview}>
        {busy ? "Revisando…" : "Revisar importación"}
      </Button>
      {review?.token && (
        <p className="text-xs text-muted-foreground">
          Revisión completada. Al importar se guardará este resultado; si cambian el archivo, los
          ajustes o el journal, habrá que revisar otra vez.
        </p>
      )}
    </div>
  );
}
