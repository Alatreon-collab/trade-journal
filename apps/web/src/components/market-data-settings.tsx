"use client";

import { useState } from "react";
import { useApi, postJson } from "@/lib/use-api";
import type { MarketConnection } from "@/lib/market-data";
import { Card, CardContent, CardHeader, CardTitle } from "./ui/card";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import { OptionSelect } from "./ui/option-select";
import { providerInfo } from "@/lib/market-providers";
import { MarketCsvSettings } from "./market-csv-settings";

export function MarketDataSettings() {
  const { data, error, refresh } = useApi<{ connections: MarketConnection[] }>(
    "/api/market-data/connections",
  );
  return (
    <Card id="market-data" className="scroll-mt-24">
      <CardHeader>
        <CardTitle>Datos de mercado</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-muted-foreground">
          Conecta precios históricos para estimar el MAE/MFE y repetir las velas de los trades
          cerrados. Los gráficos los dibuja Vela. No hay ninguna fuente activada por defecto: elige
          una conexión o sube tus propias velas. Estas conexiones son independientes de la
          sincronización con el bróker y de la IA.
        </p>
        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}
        {!data && !error && <p className="text-sm text-muted-foreground">Cargando conexiones…</p>}
        {data?.connections
          .filter((connection) => connection.id !== "market-csv")
          .map((connection) => (
            <Connection key={connection.id} connection={connection} refresh={refresh} />
          ))}
        <MarketCsvSettings onChange={refresh} />
      </CardContent>
    </Card>
  );
}

function Connection({
  connection,
  refresh,
}: {
  connection: MarketConnection;
  refresh: () => void;
}) {
  const info = providerInfo(connection.id)!;
  const defaults = () =>
    Object.fromEntries(info.fields.map((field) => [field.key, field.defaultValue ?? ""]));
  const [fields, setFields] = useState<Record<string, string>>(defaults);
  const publicSource = info.mode === "public";
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const managed = connection.source === "environment";
  const act = async (action: "save" | "remove" | "test" | "enable") => {
    setBusy(true);
    setError("");
    setMessage("");
    try {
      await postJson("/api/market-data/connections", {
        provider: connection.id,
        action,
        ...(action === "save" ? { credentials: fields } : {}),
      });
      setFields(defaults());
      setMessage(
        action === "test"
          ? publicSource
            ? "Fuente pública accesible. No hace falta API key ni plan de pago. La disponibilidad de velas depende del par, del rango de fechas y de los límites de la API pública."
            : "Conexión verificada. Los instrumentos disponibles dependen de tu acceso con el proveedor."
          : action === "save"
            ? connection.id === "local-folder"
              ? "Carpeta guardada. Pulsa «Probar conexión» para comprobar que encuentra tus archivos."
              : "Credenciales guardadas. Prueba la conexión para verificar el acceso."
            : action === "enable"
              ? "Datos de mercado públicos activados."
              : "Conexión eliminada.",
      );
      refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "No se pudo actualizar la conexión.");
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="space-y-3 rounded-lg border p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-medium">{connection.name}</h3>
        <span className="text-xs text-muted-foreground">
          {managed
            ? "Gestionado por el entorno del servidor"
            : connection.configured
              ? publicSource
                ? "Activado · no necesita clave"
                : connection.id === "local-folder"
                  ? "Carpeta guardada"
                  : "Credenciales guardadas"
              : "Sin conectar"}
        </span>
      </div>
      <p className="text-xs text-muted-foreground">{info.description}</p>
      {!publicSource && (
        <p className="text-xs text-muted-foreground">
          Las credenciales se cifran en local y solo las usa el servidor para los datos de mercado.
          Nunca se devuelven al navegador ni se incluyen en las exportaciones del journal.
        </p>
      )}
      {managed && !connection.configured && (
        <p className="text-xs text-destructive">
          Completa todos los campos obligatorios en el entorno del servidor.
        </p>
      )}
      {!managed &&
        !publicSource &&
        info.fields.map((field) => (
          <div key={field.key} className="space-y-1">
            <Label htmlFor={`key-${connection.id}-${field.key}`}>{field.label}</Label>
            {field.options ? (
              <OptionSelect
                id={`key-${connection.id}-${field.key}`}
                value={fields[field.key] ?? ""}
                disabled={busy}
                onValueChange={(value) =>
                  setFields((current) => ({ ...current, [field.key]: value }))
                }
              >
                {field.options.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </OptionSelect>
            ) : (
              <Input
                id={`key-${connection.id}-${field.key}`}
                type={field.plain ? "text" : "password"}
                value={fields[field.key] ?? ""}
                onChange={(event) =>
                  setFields((current) => ({ ...current, [field.key]: event.target.value }))
                }
                placeholder={
                  connection.configured
                    ? `Nuevo valor: ${field.label.toLowerCase()}`
                    : `Introduce: ${field.label.toLowerCase()}`
                }
                autoComplete="off"
                spellCheck={false}
                disabled={busy}
              />
            )}
          </div>
        ))}
      <div className="flex flex-wrap gap-2">
        {!managed && !publicSource && (
          <Button
            disabled={busy || info.fields.some((field) => !fields[field.key]?.trim())}
            onClick={() => void act("save")}
          >
            Guardar credenciales
          </Button>
        )}
        {publicSource && !connection.configured && (
          <Button disabled={busy} onClick={() => void act("enable")}>
            Activar fuente
          </Button>
        )}
        {connection.configured && (
          <Button variant="outline" disabled={busy} onClick={() => void act("test")}>
            Probar conexión
          </Button>
        )}
        {connection.configured && !managed && (
          <Button variant="outline" disabled={busy} onClick={() => void act("remove")}>
            {publicSource ? "Desactivar fuente" : "Eliminar credenciales"}
          </Button>
        )}
      </div>
      {message && (
        <p role="status" className="text-xs text-muted-foreground">
          {message}
        </p>
      )}
      {error && (
        <p role="alert" className="text-xs text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}
