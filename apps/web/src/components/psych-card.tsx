"use client";

import { useId, useState, type ReactNode } from "react";
import { Brain } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "./ui/card";
import { cn } from "@/lib/utils";
import { useAutosave } from "@/lib/use-autosave";
import type { ChipGroup, PsychValues } from "@/lib/psychology";
import type { TextField } from "@/lib/setup";
import { Input } from "./ui/input";

/**
 * Tarjeta de psicología con chips: un clic marca, otro clic desmarca.
 * Se guarda sola; la nota se guarda al dejar de escribir.
 */
export function PsychCard({
  title,
  description,
  groups,
  initial,
  url,
  method,
  onSaved,
  notePlaceholder,
  field = "psych",
  textFields = [],
  icon,
}: {
  title: string;
  description?: string;
  groups: ChipGroup[];
  initial: PsychValues;
  url: string;
  method: "PATCH" | "PUT";
  onSaved?: () => void;
  /** null = sin nota. */
  notePlaceholder: string | null;
  /** Clave con la que se guarda (psych, setup…). */
  field?: string;
  /** Campos de texto cortos además de los chips. */
  textFields?: TextField[];
  icon?: ReactNode;
}) {
  const [values, setValues] = useState<PsychValues>(initial);
  const { save, status } = useAutosave(url, method, onSaved);
  const noteId = useId();

  const update = (next: PsychValues) => {
    setValues(next);
    save({ [field]: next });
  };

  const toggle = (group: ChipGroup, option: string) => {
    const current = values[group.id];
    if (group.multiple) {
      const list = Array.isArray(current) ? current : [];
      const next = list.includes(option)
        ? list.filter((item) => item !== option)
        : [...list, option];
      update({ ...values, [group.id]: next.length ? next : undefined });
    } else {
      update({ ...values, [group.id]: current === option ? undefined : option });
    }
  };

  const isSelected = (group: ChipGroup, option: string) => {
    const current = values[group.id];
    return Array.isArray(current) ? current.includes(option) : current === option;
  };

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between space-y-0">
        <CardTitle className="flex items-center gap-2">
          {icon ?? <Brain className="h-3.5 w-3.5" aria-hidden="true" />}
          {title}
        </CardTitle>
        <span role="status" className="text-xs text-muted-foreground">
          {status}
        </span>
      </CardHeader>
      <CardContent className="space-y-3">
        {description && <p className="text-xs text-muted-foreground">{description}</p>}
        {groups.map((group) => (
          <fieldset key={group.id} className="space-y-1.5">
            <legend className="mb-1.5 text-xs text-muted-foreground">
              {group.title}
              {group.multiple ? " (puedes marcar varias)" : ""}
            </legend>
            <div className="flex flex-wrap gap-1.5">
              {group.options.map((option) => {
                const selected = isSelected(group, option.value);
                return (
                  <button
                    key={option.value}
                    type="button"
                    aria-pressed={selected}
                    onClick={() => toggle(group, option.value)}
                    className={cn(
                      "rounded-full border px-2.5 py-1 text-xs transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                      selected
                        ? "border-primary bg-primary text-primary-foreground"
                        : "text-muted-foreground hover:bg-accent hover:text-foreground",
                    )}
                  >
                    {option.label}
                  </button>
                );
              })}
            </div>
          </fieldset>
        ))}
        {textFields.map((text) => (
          <div key={text.key} className="space-y-1.5">
            <label htmlFor={`${noteId}-${text.key}`} className="text-xs text-muted-foreground">
              {text.label}
            </label>
            <Input
              id={`${noteId}-${text.key}`}
              value={typeof values[text.key] === "string" ? (values[text.key] as string) : ""}
              maxLength={text.maxLength}
              placeholder={text.placeholder}
              onChange={(event) => update({ ...values, [text.key]: event.target.value })}
            />
          </div>
        ))}
        {notePlaceholder !== null && (
          <div className="space-y-1.5">
            <label htmlFor={noteId} className="text-xs text-muted-foreground">
              Nota (opcional)
            </label>
            <textarea
              id={noteId}
              value={typeof values.note === "string" ? values.note : ""}
              maxLength={2000}
              rows={2}
              placeholder={notePlaceholder ?? undefined}
              onChange={(event) => update({ ...values, note: event.target.value })}
              className="flex w-full min-w-0 rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            />
          </div>
        )}
      </CardContent>
    </Card>
  );
}
