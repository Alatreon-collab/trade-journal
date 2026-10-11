"use client";
import { useState } from "react";
import { MAX_CSV_BYTES, type MarketCsvDataset } from "@/lib/market-csv";
import { RESOLUTIONS, type MarketBar, type Resolution } from "@/lib/market-data";
import { postJson, useApi } from "@/lib/use-api";
import { decodeImportFile } from "@/lib/decode-import";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import { OptionSelect } from "./ui/option-select";
import { MonetaryValue } from "./privacy";
interface Preview {
  count: number;
  from: string;
  to: string;
  sample: MarketBar[];
}
export function MarketCsvSettings({ onChange }: { onChange: () => void }) {
  const {
    data,
    refresh,
    error: listError,
  } = useApi<{ datasets: MarketCsvDataset[] }>("/api/market-data/csv");
  const [file, setFile] = useState<{ name: string; content: string } | null>(null);
  const [symbol, setSymbol] = useState("");
  const [resolution, setResolution] = useState<Resolution | "">("");
  const [currency, setCurrency] = useState("");
  const [priceBasis, setPriceBasis] = useState("");
  const [preview, setPreview] = useState<Preview | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const change = () => {
    setPreview(null);
    setMessage("");
    setError("");
  };
  const act = async (action: "preview" | "import" | "remove", id?: string) => {
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const body = await postJson<Preview>("/api/market-data/csv", {
        action,
        id,
        ...file,
        symbol,
        resolution,
        currency,
        priceBasis,
      });
      if (action === "preview") setPreview(body);
      else {
        setPreview(null);
        setMessage(
          action === "import"
            ? "Velas importadas. Elige «CSV de datos de mercado» en un trade o en Informes."
            : "Conjunto de datos y sus estimaciones eliminados.",
        );
        refresh();
        onChange();
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Falló la petición del CSV.");
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="space-y-3 rounded-lg border p-3" id="market-csv">
      <h3 className="text-sm font-medium">CSV de datos de mercado</h3>
      <p className="text-xs text-muted-foreground">
        Sube un instrumento y una temporalidad por archivo, hasta 5 MB / 50.000 filas. Columnas
        obligatorias: time, open, high, low, close. El volumen es opcional. La hora es la apertura
        de la vela: ISO-8601 con zona horaria, o Unix en segundos o milisegundos. Las velas diarias
        deben empezar a las 00:00 UTC. Son velas de mercado, independientes de la importación de tus
        ejecuciones.
      </p>
      <a className="text-xs underline" href="/market-data-template.csv" download>
        Descargar plantilla CSV con las cabeceras
      </a>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1">
          <Label htmlFor="candle-file">CSV de velas</Label>
          <Input
            id="candle-file"
            type="file"
            accept=".csv,.tsv,text/csv,text/tab-separated-values"
            disabled={busy}
            onChange={async (event) => {
              const selected = event.target.files?.[0];
              change();
              setFile(null);
              if (!selected) return;
              if (selected.size > MAX_CSV_BYTES) {
                setError("Usa un CSV de menos de 5 MB.");
                return;
              }
              setBusy(true);
              try {
                setFile({
                  name: selected.name,
                  content: decodeImportFile(await selected.arrayBuffer()),
                });
              } catch {
                setError("No se pudo leer este archivo.");
              } finally {
                setBusy(false);
              }
            }}
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor="candle-symbol">Símbolo del instrumento</Label>
          <Input
            id="candle-symbol"
            value={symbol}
            disabled={busy}
            placeholder="Símbolo exacto que usa tu archivo"
            onChange={(event) => {
              change();
              setSymbol(event.target.value.trim());
            }}
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor="candle-resolution">Temporalidad de las velas</Label>
          <OptionSelect
            id="candle-resolution"
            value={resolution}
            disabled={busy}
            onValueChange={(value) => {
              change();
              setResolution(value as Resolution);
            }}
          >
            <option value="" disabled>
              Elige la temporalidad del archivo
            </option>
            {Object.keys(RESOLUTIONS).map((value) => (
              <option key={value} value={value}>
                {value}
              </option>
            ))}
          </OptionSelect>
        </div>
        <div className="space-y-1">
          <Label htmlFor="candle-currency">Divisa de cotización</Label>
          <Input
            id="candle-currency"
            value={currency}
            disabled={busy}
            maxLength={12}
            onChange={(event) => {
              change();
              setCurrency(event.target.value.toUpperCase());
            }}
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor="candle-basis">Tipo de precio</Label>
          <OptionSelect
            id="candle-basis"
            value={priceBasis}
            disabled={busy}
            onValueChange={(value) => {
              change();
              setPriceBasis(value);
            }}
          >
            <option value="" disabled>
              Elige el tipo de precio del archivo
            </option>
            <option value="raw">Sin ajustar</option>
            <option value="split">Ajustado por splits</option>
            <option value="adjusted">Otro ajuste</option>
            <option value="midpoint">Precio medio</option>
            <option value="bid">Bid</option>
            <option value="ask">Ask</option>
          </OptionSelect>
        </div>
      </div>
      <Button
        variant="outline"
        disabled={busy || !file || !symbol || !currency || !resolution || !priceBasis}
        onClick={() => void act("preview")}
      >
        Validar y previsualizar velas
      </Button>
      {preview && (
        <div className="space-y-2 rounded-lg border p-3">
          <p className="text-xs">
            {preview.count.toLocaleString("es-ES")} velas · {preview.from} a {preview.to}
          </p>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <caption className="text-left">Primeras velas (UTC)</caption>
              <thead>
                <tr>
                  {["Hora", "Apertura", "Máximo", "Mínimo", "Cierre"].map((label) => (
                    <th key={label} className="p-2">
                      {label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {preview.sample.map((bar) => (
                  <tr key={bar.time}>
                    <td className="p-2">{new Date(bar.time).toISOString()}</td>
                    {[bar.open, bar.high, bar.low, bar.close].map((value, index) => (
                      <td key={index} className="p-2">
                        <MonetaryValue>{value}</MonetaryValue>
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Button disabled={busy} onClick={() => void act("import")}>
            Importar velas
          </Button>
        </div>
      )}
      {(error || listError) && (
        <p role="alert" className="text-xs text-destructive">
          {error || listError}
        </p>
      )}
      {message && (
        <p role="status" className="text-xs text-muted-foreground">
          {message}
        </p>
      )}
      {data?.datasets.map((dataset) => (
        <div
          key={dataset.id}
          className="flex flex-wrap items-center justify-between gap-2 rounded-lg border p-3"
        >
          <div className="min-w-0 text-xs">
            <p className="break-all font-medium">
              {dataset.name} · {dataset.symbol} · {dataset.resolution}
            </p>
            <p className="text-muted-foreground">
              {dataset.count.toLocaleString("es-ES")} velas · {dataset.currency} ·{" "}
              {dataset.priceBasis} · {dataset.from.slice(0, 10)} – {dataset.to.slice(0, 10)}
            </p>
          </div>
          <Button
            size="sm"
            variant="outline"
            disabled={busy}
            onClick={() => void act("remove", dataset.id)}
          >
            Eliminar conjunto de datos
          </Button>
        </div>
      ))}
    </div>
  );
}
