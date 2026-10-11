"use client";
import { useState } from "react";
import * as Popover from "@radix-ui/react-popover";
import { Settings2, X } from "lucide-react";
import { Checkbox } from "./ui/checkbox";
import { HelpHint } from "./ui/tooltip";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import { OptionSelect } from "./ui/option-select";
import {
  AI_DEFAULT_MODELS,
  AI_PROVIDER_NAMES,
  type AiSettingsPayload,
  type AiProvider,
} from "@/lib/ai-settings";
import { AI_IMPORT_HELP, type AiImportOptions as Options } from "@/lib/ai-import";

export function AiImportOptions({
  enabled,
  onEnabledChange,
  value,
  onChange,
  settings,
  disabled,
}: {
  enabled: boolean;
  onEnabledChange: (value: boolean) => void;
  value: Options;
  onChange: (value: Options) => void;
  settings?: AiSettingsPayload;
  disabled: boolean;
}) {
  const [open, setOpen] = useState(false);
  const connection = settings?.aiConnections[value.provider];
  return (
    <Popover.Root open={open && enabled} onOpenChange={setOpen}>
      <div className="flex shrink-0 items-center gap-1.5">
        <Checkbox
          id="ai-import-enabled"
          checked={enabled}
          disabled={disabled}
          onCheckedChange={(checked) => {
            onEnabledChange(checked === true);
            setOpen(checked === true);
          }}
        />
        <Label
          htmlFor="ai-import-enabled"
          className="flex cursor-pointer items-center gap-1.5 text-xs font-normal text-muted-foreground"
        >
          Leer con IA
        </Label>
        <HelpHint heading="Lectura de extractos con IA">{AI_IMPORT_HELP}</HelpHint>
        {enabled && (
          <Popover.Trigger asChild>
            <button
              type="button"
              disabled={disabled}
              aria-label="Ajustes de lectura con IA"
              className="flex size-6 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            >
              <Settings2 className="size-3.5" />
            </button>
          </Popover.Trigger>
        )}
      </div>
      <Popover.Portal>
        <Popover.Content
          align="end"
          sideOffset={8}
          collisionPadding={12}
          aria-label="Ajustes de lectura con IA"
          className="z-50 w-[360px] max-w-[calc(100vw-24px)] max-h-[var(--radix-popover-content-available-height)] overflow-y-auto rounded-xl border bg-popover p-4 text-popover-foreground shadow-xl"
        >
          <div className="mb-3 flex items-center justify-between">
            <span className="text-sm font-medium">Ajustes de lectura con IA</span>
            <Popover.Close
              aria-label="Cerrar ajustes de lectura con IA"
              className="rounded-md p-1 text-muted-foreground hover:bg-accent"
            >
              <X className="size-4" />
            </Popover.Close>
          </div>
          <div className="space-y-3">
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1">
                <Label htmlFor="import-ai-provider">Proveedor de IA</Label>
                <OptionSelect
                  id="import-ai-provider"
                  value={value.provider}
                  disabled={disabled}
                  onValueChange={(provider) => {
                    const next = provider as AiProvider;
                    onChange({
                      provider: next,
                      model: settings?.aiConnections[next].model ?? AI_DEFAULT_MODELS[next],
                      apiKey: "",
                    });
                  }}
                >
                  <option value="openai">OpenAI</option>
                  <option value="anthropic">Anthropic</option>
                </OptionSelect>
              </div>
              <div className="space-y-1">
                <Label htmlFor="import-ai-model">ID del modelo</Label>
                <Input
                  id="import-ai-model"
                  value={value.model}
                  disabled={disabled}
                  onChange={(e) => onChange({ ...value, model: e.target.value })}
                  placeholder={AI_DEFAULT_MODELS[value.provider]}
                />
              </div>
            </div>
            <div className="space-y-1">
              <Label htmlFor="import-ai-key">{AI_PROVIDER_NAMES[value.provider]} API key</Label>
              <Input
                id="import-ai-key"
                type="password"
                autoComplete="off"
                spellCheck={false}
                value={value.apiKey ?? ""}
                disabled={disabled}
                onChange={(e) => onChange({ ...value, apiKey: e.target.value })}
                placeholder={
                  connection?.configured
                    ? "Déjalo vacío para usar la clave configurada"
                    : "Introduce tu API key"
                }
              />
              <p className="text-xs text-muted-foreground">
                Las claves que pongas aquí solo se usan en esta subida. Gestiona las claves
                guardadas en{" "}
                <a href="/settings#ai-settings" className="underline">
                  Ajustes
                </a>
                .
              </p>
            </div>
            <p className="text-xs text-muted-foreground">
              El archivo se enviará a {AI_PROVIDER_NAMES[value.provider]} cuando pulses{" "}
              <strong>Vista previa con IA</strong>. El proveedor cobra el uso. Revisa los trades
              extraídos antes de importar.
            </p>
            <p className="text-xs text-muted-foreground">
              CSV, TSV, HTML, XML, TXT y PDF · Hasta 200 ejecuciones por vista previa. PDF de hasta
              8 MB; exportaciones de texto de hasta 150.000 caracteres. Las hojas de cálculo,
              exportadas antes a CSV. El soporte de PDF depende del modelo elegido.
            </p>
          </div>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
