"use client";

import { useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { parseTimestamp } from "@luxalgo/journal-importers";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { OptionSelect } from "./ui/option-select";

export interface EditableExecution {
  side: "buy" | "sell";
  quantity: number;
  price: number;
  fee: number;
  executedAt: string;
}

interface Row {
  datetime: string;
  side: "buy" | "sell";
  quantity: string;
  price: string;
  fee: string;
}

/** ISO (UTC) → "AAAA-MM-DDTHH:MM:SS" en la zona del journal, para el campo de fecha. */
export function toWallTime(iso: string, timeZone: string): string {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", {
      timeZone,
      hourCycle: "h23",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    })
      .formatToParts(new Date(iso))
      .map((part) => [part.type, part.value]),
  );
  return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}:${parts.second}`;
}

/** Editor de las ejecuciones de un trade metido a mano. */
export function EditExecutions({
  executions,
  timeZone,
  onSave,
  onCancel,
}: {
  executions: EditableExecution[];
  timeZone: string;
  onSave: (rows: EditableExecution[]) => Promise<void>;
  onCancel: () => void;
}) {
  const [rows, setRows] = useState<Row[]>(() =>
    [...executions]
      .sort((a, b) => a.executedAt.localeCompare(b.executedAt))
      .map((execution) => ({
        datetime: toWallTime(execution.executedAt, timeZone),
        side: execution.side,
        quantity: String(execution.quantity),
        price: String(execution.price),
        fee: String(execution.fee),
      })),
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const set = (index: number, patch: Partial<Row>) =>
    setRows((current) => current.map((row, i) => (i === index ? { ...row, ...patch } : row)));

  const save = async () => {
    setError("");
    const out: EditableExecution[] = [];
    for (const [index, row] of rows.entries()) {
      const executedAt = parseTimestamp(row.datetime, timeZone);
      const quantity = Number(row.quantity);
      const price = Number(row.price.replace(",", "."));
      const fee = row.fee.trim() === "" ? 0 : Number(row.fee.replace(",", "."));
      if (!executedAt || !(quantity > 0) || !Number.isFinite(price) || !Number.isFinite(fee)) {
        setError(`Revisa la ejecución ${index + 1}: fecha, cantidad, precio y comisión.`);
        return;
      }
      out.push({ side: row.side, quantity, price, fee, executedAt });
    }
    setBusy(true);
    try {
      await onSave(out);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "No se ha podido guardar.");
      setBusy(false);
    }
  };

  return (
    <div className="space-y-3">
      <p className="text-xs text-muted-foreground">
        Horas en {timeZone === "America/New_York" ? "hora de Nueva York" : timeZone}. Al guardar se
        recalcula el trade y se conservan tus notas, psicología, imágenes y etiquetas.
      </p>
      {rows.map((row, index) => (
        <fieldset
          key={index}
          className="grid gap-2 rounded-lg border p-3 sm:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)_minmax(0,0.8fr)_minmax(0,1fr)_minmax(0,0.8fr)_auto] sm:items-end"
        >
          <legend className="px-1 text-xs text-muted-foreground">Ejecución {index + 1}</legend>
          <label className="grid gap-1 text-xs text-muted-foreground">
            Fecha y hora
            <Input
              type="datetime-local"
              step={1}
              value={row.datetime}
              onChange={(event) => set(index, { datetime: event.target.value })}
            />
          </label>
          <label className="grid gap-1 text-xs text-muted-foreground">
            Lado
            <OptionSelect
              value={row.side}
              onValueChange={(value) => set(index, { side: value as Row["side"] })}
            >
              <option value="buy">Compra</option>
              <option value="sell">Venta</option>
            </OptionSelect>
          </label>
          <label className="grid gap-1 text-xs text-muted-foreground">
            Cantidad
            <Input
              inputMode="decimal"
              value={row.quantity}
              onChange={(event) => set(index, { quantity: event.target.value })}
            />
          </label>
          <label className="grid gap-1 text-xs text-muted-foreground">
            Precio
            <Input
              inputMode="decimal"
              value={row.price}
              onChange={(event) => set(index, { price: event.target.value })}
            />
          </label>
          <label className="grid gap-1 text-xs text-muted-foreground">
            Comisión
            <Input
              inputMode="decimal"
              value={row.fee}
              onChange={(event) => set(index, { fee: event.target.value })}
            />
          </label>
          <Button
            type="button"
            variant="outline"
            size="icon"
            aria-label={`Quitar ejecución ${index + 1}`}
            disabled={rows.length <= 1}
            onClick={() => setRows((current) => current.filter((_, i) => i !== index))}
          >
            <Trash2 />
          </Button>
        </fieldset>
      ))}
      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          variant="outline"
          onClick={() =>
            setRows((current) => [
              ...current,
              {
                datetime: current.at(-1)?.datetime ?? "",
                side: current.at(-1)?.side === "buy" ? "sell" : "buy",
                quantity: current.at(-1)?.quantity ?? "1",
                price: "",
                fee: "0",
              },
            ])
          }
        >
          <Plus />
          Añadir ejecución
        </Button>
        <Button type="button" disabled={busy} onClick={() => void save()}>
          {busy ? "Guardando…" : "Guardar cambios"}
        </Button>
        <Button type="button" variant="outline" disabled={busy} onClick={onCancel}>
          Cancelar
        </Button>
      </div>
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}
