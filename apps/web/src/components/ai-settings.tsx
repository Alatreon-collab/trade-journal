"use client";

import { useEffect, useState } from "react";
import {
  AI_DEFAULT_MODELS,
  AI_PROVIDER_NAMES,
  AI_PROVIDERS,
  type AiProvider,
  type AiSettingsPayload,
} from "@/lib/ai-settings";
import { postJson, useApi } from "@/lib/use-api";
import { Button } from "./ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "./ui/card";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import { OptionSelect } from "./ui/option-select";

export function AiSettings() {
  const { data, error, loading, refresh } = useApi<AiSettingsPayload>("/api/settings");
  const [provider, setProvider] = useState<AiProvider>("anthropic");
  const [model, setModel] = useState(AI_DEFAULT_MODELS.anthropic);
  const [apiKey, setApiKey] = useState("");
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState("");
  const [saved, setSaved] = useState("");

  useEffect(() => {
    if (!data) return;
    setProvider(data.aiProvider);
    setModel(data.aiModel);
  }, [data]);

  const connection = data?.aiConnections[provider];
  const environment = connection?.source === "environment";
  const name = AI_PROVIDER_NAMES[provider];
  const disabled = busy || loading || !data;

  const save = async (remove = false) => {
    setBusy(true);
    setFailure("");
    setSaved("");
    try {
      await postJson(
        "/api/settings",
        remove
          ? {
              [`${provider}Key`]: null,
            }
          : {
              aiProvider: provider,
              aiModel: model.trim(),
              ...(apiKey.trim() ? { [`${provider}Key`]: apiKey.trim() } : {}),
            },
        "PATCH",
      );
      setApiKey("");
      setSaved(remove ? `Clave de ${name} eliminada.` : `Ajustes de ${name} guardados.`);
      refresh();
    } catch (cause) {
      setFailure(
        cause instanceof Error ? cause.message : "No se pudieron guardar los ajustes de IA.",
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card id="ai-settings" className="scroll-mt-24">
      <CardHeader>
        <CardTitle>IA (con tu propia clave)</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-sm text-muted-foreground">
          Usa Anthropic u OpenAI para los resúmenes, la crítica de trades y «Pregunta a tu journal».
          Tu clave se guarda cifrada. Las peticiones van directamente desde tu ordenador al
          proveedor que elijas.
        </p>
        {data && (
          <p className="text-xs text-muted-foreground">
            Proveedor activo: {AI_PROVIDER_NAMES[data.aiProvider]} ·{" "}
            {data.aiConfigured ? "Clave configurada" : "Sin configurar"}
          </p>
        )}
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1">
            <Label htmlFor="ai-provider">Proveedor</Label>
            <OptionSelect
              id="ai-provider"
              value={provider}
              disabled={disabled}
              onValueChange={(value) => {
                const next = value as AiProvider;
                setProvider(next);
                setModel(data?.aiConnections[next].model ?? AI_DEFAULT_MODELS[next]);
                setApiKey("");
                setSaved("");
                setFailure("");
              }}
            >
              {AI_PROVIDERS.map((id) => (
                <option key={id} value={id}>
                  {AI_PROVIDER_NAMES[id]}
                </option>
              ))}
            </OptionSelect>
          </div>
          <div className="space-y-1">
            <Label htmlFor="ai-model">ID del modelo</Label>
            <Input
              id="ai-model"
              value={model}
              disabled={disabled}
              placeholder={AI_DEFAULT_MODELS[provider]}
              onChange={(event) => {
                setModel(event.target.value);
                setSaved("");
              }}
            />
          </div>
        </div>
        <p className="text-xs text-muted-foreground">
          Usa un modelo de texto disponible en tu cuenta del proveedor. Cada proveedor guarda su
          propio modelo y su clave.
        </p>
        <div className="space-y-1">
          <Label htmlFor="ai-api-key">{name} API key</Label>
          <Input
            id="ai-api-key"
            type="password"
            value={apiKey}
            disabled={disabled || environment}
            onChange={(event) => {
              setApiKey(event.target.value);
              setSaved("");
            }}
            placeholder={
              connection?.configured
                ? "Clave configurada"
                : provider === "anthropic"
                  ? "sk-ant-…"
                  : "sk-…"
            }
            autoComplete="off"
            spellCheck={false}
          />
          <p className="text-xs text-muted-foreground">
            {environment
              ? `Usando ${provider === "openai" ? "OPENAI_API_KEY" : "ANTHROPIC_API_KEY"} del entorno del servidor. Cambia o elimina esa variable en el servidor para actualizar la clave.`
              : connection?.configured
                ? "Déjalo vacío para mantener la clave guardada, o escribe una nueva."
                : "Añade tu API key y guarda para usar este proveedor."}
          </p>
        </div>
        {(error || failure) && (
          <p role="alert" className="text-xs text-destructive">
            {failure || error}
          </p>
        )}
        {saved && (
          <p role="status" className="text-xs text-profit">
            {saved}
          </p>
        )}
        <div className="flex flex-wrap gap-2">
          <Button
            disabled={disabled || !model.trim() || (!apiKey.trim() && !connection?.configured)}
            onClick={() => save()}
          >
            {busy ? "Guardando…" : "Guardar ajustes de IA"}
          </Button>
          {connection?.source === "saved" && (
            <Button variant="outline" disabled={disabled} onClick={() => save(true)}>
              Eliminar clave de {name}
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
