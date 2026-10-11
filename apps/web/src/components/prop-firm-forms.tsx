"use client";
import { useState, type ReactNode } from "react";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { OptionSelect } from "./ui/option-select";
import { DatePicker } from "./ui/date-picker";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "./ui/dialog";
import { Field, fieldClass } from "./filter-fields";
import { Attachments } from "./attachments";
import { useApi, postJson } from "@/lib/use-api";
import { decodeImportFile } from "@/lib/decode-import";
import {
  fromMinor,
  label,
  PROP_PROGRAMS,
  PROP_STATES,
  PAYOUT_STATES,
  EXPENSE_CATEGORIES,
  type PropAccount,
  type PropEntry,
  type PropData,
  type PropAudit,
} from "@/lib/prop-firms";
export type PropModal =
  | { kind: "account"; account?: PropAccount; parent?: PropAccount }
  | {
      kind: "entry";
      entry?: PropEntry;
      type: PropEntry["kind"];
      accountId?: string;
      category?: string;
      expense?: PropEntry;
    }
  | { kind: "receipt"; payout: PropEntry }
  | { kind: "detail"; type: "account" | "entry"; id: string }
  | {
      kind: "change";
      action: string;
      id: string;
      revision: number;
      payoutId?: string;
      value: boolean;
      name: string;
    }
  | { kind: "import" };
type Props = { modal: PropModal; data: PropData; close: () => void; refresh: () => void };
export function PropFirmModal(props: Props) {
  const { modal, close } = props;
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) close();
      }}
    >
      <DialogContent className="max-w-2xl">
        {modal.kind === "account" ? (
          <AccountForm {...props} modal={modal} />
        ) : modal.kind === "entry" ? (
          <EntryForm {...props} modal={modal} />
        ) : modal.kind === "receipt" ? (
          <ReceiptForm {...props} modal={modal} />
        ) : modal.kind === "change" ? (
          <ChangeForm {...props} modal={modal} />
        ) : modal.kind === "import" ? (
          <ImportForm {...props} />
        ) : (
          <Detail {...props} modal={modal} />
        )}
      </DialogContent>
    </Dialog>
  );
}
function useSave(close: () => void, refresh: () => void) {
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const save = async (body: unknown) => {
    setBusy(true);
    setError("");
    try {
      await postJson("/api/prop-firms", body);
      refresh();
      close();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return { busy, error, save };
}
function Form({
  title,
  description,
  busy,
  error,
  children,
  submit,
}: {
  title: string;
  description: string;
  busy: boolean;
  error: string;
  children: ReactNode;
  submit: () => void;
}) {
  return (
    <>
      <DialogHeader>
        <DialogTitle>{title}</DialogTitle>
        <DialogDescription>{description}</DialogDescription>
      </DialogHeader>
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          if (!busy) submit();
        }}
      >
        <fieldset disabled={busy} className="space-y-4">
          {children}
        </fieldset>
        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}
        <Button type="submit" disabled={busy}>
          {busy ? "Guardando…" : "Guardar registro"}
        </Button>
      </form>
    </>
  );
}
const blankAccount = (today: string, parent?: PropAccount) => ({
  firm: parent?.firm ?? "",
  name: "",
  program: "evaluation",
  status: "active",
  currency: parent?.currency ?? "",
  size: parent?.sizeMinor == null ? "" : fromMinor(parent.sizeMinor, parent.currency),
  parentId: parent?.id ?? "",
  journalAccountId: "",
  openedOn: today,
  closedOn: "",
  renewalOn: "",
  renewalAmount: "",
  notes: "",
  reason: "",
});
function AccountForm({
  modal,
  data,
  close,
  refresh,
}: Props & { modal: Extract<PropModal, { kind: "account" }> }) {
  const old = modal.account;
  const [id] = useState(() => old?.id ?? crypto.randomUUID());
  const [values, set] = useState(() =>
    old
      ? {
          firm: old.firm,
          name: old.name,
          program: old.program,
          status: old.status,
          currency: old.currency,
          size: old.sizeMinor == null ? "" : fromMinor(old.sizeMinor, old.currency),
          parentId: old.parentId ?? "",
          journalAccountId: old.journalAccountId ?? "",
          openedOn: old.openedOn,
          closedOn: old.closedOn ?? "",
          renewalOn: old.renewalOn ?? "",
          renewalAmount: old.renewalMinor == null ? "" : fromMinor(old.renewalMinor, old.currency),
          notes: old.notes,
          reason: "",
        }
      : blankAccount(data.today, modal.parent),
  );
  const { data: journal } = useApi<{ accounts: { id: string; name: string }[] }>(
    "/api/accounts?summary=1",
  );
  const { busy, error, save } = useSave(close, refresh);
  const input = (key: keyof typeof values, title: string, required = false) => (
    <Field label={title}>
      <Input
        value={values[key]}
        required={required}
        onChange={(e) =>
          set({
            ...values,
            [key]: key === "currency" ? e.target.value.toUpperCase() : e.target.value,
          })
        }
      />
    </Field>
  );
  return (
    <Form
      title={
        old
          ? "Editar cuenta prop"
          : modal.parent
            ? "Seguir el siguiente intento o fase"
            : "Seguir una cuenta prop"
      }
      description="Guarda cada evaluación, cada intento tras un reset y cada fase de fondeo como un registro aparte. El tamaño de la cuenta es capital nominal, no dinero que hayas gastado."
      busy={busy}
      error={error}
      submit={() =>
        void save({ action: "account.save", id, revision: old?.revision ?? 0, ...values })
      }
    >
      <div className="grid gap-3 sm:grid-cols-2">
        {input("firm", "Nombre de la firma", true)}
        {input("name", "Nombre de la cuenta / intento", true)}
        <Field label="Programa">
          <OptionSelect
            value={values.program}
            onValueChange={(program) => set({ ...values, program })}
          >
            {PROP_PROGRAMS.map((v) => (
              <option key={v} value={v}>
                {label(v)}
              </option>
            ))}
          </OptionSelect>
        </Field>
        <Field label="Estado">
          <OptionSelect
            value={values.status}
            onValueChange={(status) =>
              set({
                ...values,
                status,
                closedOn: status === "active" ? "" : values.closedOn || data.today,
                renewalOn: status === "active" ? values.renewalOn : "",
              })
            }
          >
            {PROP_STATES.map((v) => (
              <option key={v} value={v}>
                {label(v)}
              </option>
            ))}
          </OptionSelect>
        </Field>
        {input("currency", "Código de divisa", true)}
        {input("size", "Tamaño nominal de la cuenta (opcional)")}
        <Field label="Abierta el">
          <DatePicker
            label="Fecha de apertura de la cuenta prop"
            value={values.openedOn}
            max={data.today}
            onValueChange={(openedOn) => set({ ...values, openedOn })}
          />
        </Field>
        {values.status !== "active" && (
          <Field label="Resuelta el">
            <DatePicker
              label="Fecha de cierre de la cuenta prop"
              value={values.closedOn}
              max={data.today}
              onValueChange={(closedOn) => set({ ...values, closedOn })}
            />
          </Field>
        )}
        <Field label="Intento / fase anterior">
          <OptionSelect
            value={values.parentId}
            onValueChange={(parentId) => set({ ...values, parentId })}
          >
            <option value="">Ninguno</option>
            {data.accounts
              .filter(
                (a) =>
                  a.id !== id &&
                  a.firm.toLowerCase() === values.firm.trim().toLowerCase() &&
                  a.currency === values.currency,
              )
              .map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
          </OptionSelect>
        </Field>
        <Field label="Vincular cuenta del journal (opcional)">
          <OptionSelect
            value={values.journalAccountId}
            onValueChange={(journalAccountId) => set({ ...values, journalAccountId })}
          >
            <option value="">Sin vincular</option>
            {journal?.accounts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </OptionSelect>
        </Field>
      </div>
      <details>
        <summary className="cursor-pointer text-sm">Recordatorio de renovación</summary>
        <p className="my-2 text-xs text-muted-foreground">
          Es solo un recordatorio. Registra el gasto cuando te lo cobren; no se cobra ni se añade
          nada automáticamente.
        </p>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Próxima renovación">
            <DatePicker
              label="Fecha de la próxima renovación"
              value={values.renewalOn}
              onValueChange={(renewalOn) => set({ ...values, renewalOn })}
            />
          </Field>
          {input("renewalAmount", "Importe previsto de la renovación")}
        </div>
        <Button
          type="button"
          variant="ghost"
          onClick={() => set({ ...values, renewalOn: "", renewalAmount: "" })}
        >
          Quitar recordatorio
        </Button>
      </details>
      <Field label="Notas / reglas / motivo de la quema">
        <textarea
          className={`${fieldClass} h-24 py-2`}
          value={values.notes}
          onChange={(e) => set({ ...values, notes: e.target.value })}
        />
      </Field>
      {old && input("reason", "Motivo del cambio", true)}
    </Form>
  );
}
function EntryForm({
  modal,
  data,
  close,
  refresh,
}: Props & { modal: Extract<PropModal, { kind: "entry" }> }) {
  const old = modal.entry,
    expense = modal.expense;
  const [id] = useState(() => old?.id ?? crypto.randomUUID());
  const initialAccount = data.accounts.find(
    (a) => a.id === (old?.accountId ?? expense?.accountId ?? modal.accountId),
  );
  const [values, set] = useState({
    accountId: old?.accountId ?? expense?.accountId ?? initialAccount?.id ?? "",
    firm: old?.firm ?? expense?.firm ?? initialAccount?.firm ?? "",
    currency: old?.currency ?? expense?.currency ?? initialAccount?.currency ?? "",
    category: old?.category ?? modal.category ?? "evaluation",
    amount: old ? fromMinor(old.amountMinor, old.currency) : "",
    splitPercent: old ? (old.splitBps / 100).toFixed(2) : "",
    fee: old ? fromMinor(old.feeMinor, old.currency) : "0",
    occurredOn: old?.occurredOn ?? data.today,
    dueOn: old?.dueOn ?? "",
    status: old?.status ?? "requested",
    parentId: old?.parentId ?? expense?.id ?? "",
    reference: old?.reference ?? "",
    notes: old?.notes ?? "",
    reason: "",
  });
  const kind = old?.kind ?? modal.type,
    payout = kind === "payout",
    refund = kind === "refund";
  const { busy, error, save } = useSave(close, refresh);
  const input = (key: keyof typeof values, title: string, required = false, disabled = false) => (
    <Field label={title}>
      <Input
        required={required}
        disabled={disabled}
        value={values[key]}
        onChange={(e) =>
          set({
            ...values,
            [key]: key === "currency" ? e.target.value.toUpperCase() : e.target.value,
          })
        }
      />
    </Field>
  );
  return (
    <Form
      title={
        old
          ? `Editar ${label(kind).toLowerCase()}`
          : payout
            ? "Registrar una solicitud de payout"
            : refund
              ? "Registrar un reembolso de gasto"
              : "Registrar un gasto de prop firm"
      }
      description={
        payout
          ? "Una solicitud no es un ingreso. Registra aparte lo que llegue de verdad al banco, incluidos los pagos parciales. Esto no pide ningún payout a tu firma."
          : "Registra el dinero que realmente se ha movido. Incluye impuestos y comisiones en el importe pagado. No dupliques comisiones de trading que ya estén en otro sitio."
      }
      busy={busy}
      error={error}
      submit={() =>
        void save({ action: "entry.save", id, revision: old?.revision ?? 0, kind, ...values })
      }
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Cuenta prop">
          <OptionSelect
            disabled={Boolean(old || refund)}
            value={values.accountId}
            onValueChange={(accountId) => {
              const a = data.accounts.find((a) => a.id === accountId);
              set({ ...values, accountId, firm: a?.firm ?? "", currency: a?.currency ?? "" });
            }}
          >
            <option value="">
              {payout ? "Elige una cuenta fondeada" : "Gasto común de la firma"}
            </option>
            {data.accounts
              .filter((a) => !payout || ["funded", "instant_funded", "live"].includes(a.program))
              .map((a) => (
                <option key={a.id} value={a.id}>
                  {a.firm} · {a.name}
                  {a.archived ? " (archivada)" : ""}
                </option>
              ))}
          </OptionSelect>
        </Field>
        {input("firm", "Firma", true, Boolean(values.accountId || old || refund))}
        {input("currency", "Divisa", true, Boolean(values.accountId || old || refund))}
        {!payout && !refund && (
          <Field label="Categoría del gasto">
            <OptionSelect
              value={values.category}
              onValueChange={(category) => set({ ...values, category })}
            >
              {EXPENSE_CATEGORIES.map((v) => (
                <option key={v} value={v}>
                  {label(v)}
                </option>
              ))}
            </OptionSelect>
          </Field>
        )}
        {input(
          "amount",
          payout ? "Importe bruto solicitado (antes del reparto)" : "Importe real",
          true,
        )}
        {payout && (
          <>
            {input("splitPercent", "Tu parte (%)", true)}
            {input("fee", "Comisiones retenidas de tu parte", true)}
            <p className="col-span-full text-xs text-muted-foreground">
              Si tu importe ya es después del reparto con la firma, pon 100% y solo las comisiones
              que falten por descontar. No descuentes nunca el reparto dos veces.
            </p>
          </>
        )}
        <Field label={payout ? "Fecha de solicitud" : "Fecha del pago"}>
          <DatePicker
            label={payout ? "Fecha de solicitud del payout" : "Fecha de la transacción"}
            value={values.occurredOn}
            max={data.today}
            onValueChange={(occurredOn) => set({ ...values, occurredOn })}
          />
        </Field>
        {payout && (
          <>
            <Field label="Fecha de pago prevista (opcional)">
              <DatePicker
                label="Fecha prevista del payout"
                value={values.dueOn}
                onValueChange={(dueOn) => set({ ...values, dueOn })}
              />
            </Field>
            <Field label="Estado del payout">
              <OptionSelect
                value={values.status}
                onValueChange={(status) =>
                  set({ ...values, status: status as PropEntry["status"] })
                }
              >
                {PAYOUT_STATES.filter((s) => old || s !== "completed").map((v) => (
                  <option key={v} value={v}>
                    {label(v)}
                  </option>
                ))}
              </OptionSelect>
            </Field>
          </>
        )}
        {input("reference", "Factura / referencia del pago")}
      </div>
      <Field label="Notas">
        <textarea
          className={`${fieldClass} h-20 py-2`}
          value={values.notes}
          onChange={(e) => set({ ...values, notes: e.target.value })}
        />
      </Field>
      {refund && (
        <p className="text-xs text-muted-foreground">
          Gasto vinculado: {values.parentId}. Los reembolsos reducen el coste y se muestran aparte
          de los ingresos por payout.
        </p>
      )}
      {old && input("reason", "Motivo del cambio", true)}
    </Form>
  );
}
function ReceiptForm({
  modal,
  data,
  close,
  refresh,
}: Props & { modal: Extract<PropModal, { kind: "receipt" }> }) {
  const { payout } = modal;
  const [id] = useState(() => crypto.randomUUID());
  const [values, set] = useState({
    kind: "receipt",
    amount: "",
    occurredOn: data.today,
    reference: "",
    notes: "",
  });
  const { busy, error, save } = useSave(close, refresh);
  return (
    <Form
      title="Registrar movimiento de caja del payout"
      description={`Registra el importe neto real abonado o devuelto en ${payout.currency}. Si tu banco cambió de divisa, usa el importe en la divisa original del extracto; aquí no se inventa ningún tipo de cambio.`}
      busy={busy}
      error={error}
      submit={() =>
        void save({
          action: "receipt.add",
          id,
          payoutId: payout.id,
          revision: payout.revision,
          ...values,
        })
      }
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Movimiento">
          <OptionSelect value={values.kind} onValueChange={(kind) => set({ ...values, kind })}>
            <option value="receipt">Dinero recibido</option>
            <option value="reversal">Dinero devuelto / revertido</option>
          </OptionSelect>
        </Field>
        <Field label={`Importe real (${payout.currency})`}>
          <Input
            required
            value={values.amount}
            onChange={(e) => set({ ...values, amount: e.target.value })}
          />
        </Field>
        <Field label="Fecha de liquidación">
          <DatePicker
            label="Fecha de liquidación"
            value={values.occurredOn}
            max={data.today}
            onValueChange={(occurredOn) => set({ ...values, occurredOn })}
          />
        </Field>
        <Field label="Referencia bancaria">
          <Input
            value={values.reference}
            onChange={(e) => set({ ...values, reference: e.target.value })}
          />
        </Field>
      </div>
      <Field label="Notas">
        <textarea
          className={`${fieldClass} h-20 py-2`}
          value={values.notes}
          onChange={(e) => set({ ...values, notes: e.target.value })}
        />
      </Field>
      <p className="text-xs text-muted-foreground">
        Deja la solicitud abierta si hay pagos parciales. Cuando llegue el último pago, cambia el
        estado del payout a Completado; la diferencia con el importe esperado seguirá visible.
      </p>
    </Form>
  );
}
function ChangeForm({
  modal,
  close,
  refresh,
}: Props & { modal: Extract<PropModal, { kind: "change" }> }) {
  const [reason, setReason] = useState("");
  const { busy, error, save } = useSave(close, refresh);
  return (
    <Form
      title={modal.name}
      description={
        modal.action === "account.archive"
          ? "Al archivarla, la cuenta desaparece de la lista de activas. Su historial de caja sigue contando en el retorno. Puedes restaurarla más adelante."
          : "Los registros anulados siguen en el historial y no cuentan en los totales de caja. Se pueden restaurar. Anular un payout también excluye sus cobros."
      }
      busy={busy}
      error={error}
      submit={() =>
        void save({
          action: modal.action,
          id: modal.id,
          revision: modal.revision,
          payoutId: modal.payoutId,
          [modal.action === "account.archive" ? "archived" : "voided"]: modal.value,
          reason,
        })
      }
    >
      <Field label="Motivo">
        <Input required value={reason} onChange={(e) => setReason(e.target.value)} />
      </Field>
    </Form>
  );
}
function Detail({ modal, data }: Props & { modal: Extract<PropModal, { kind: "detail" }> }) {
  const account = modal.type === "account" ? data.accounts.find((a) => a.id === modal.id) : null;
  const entry = modal.type === "entry" ? data.entries.find((e) => e.id === modal.id) : null;
  const { data: history } = useApi<{ history: PropAudit[] }>(
    `/api/prop-firms?type=${modal.type}&history=${encodeURIComponent(modal.id)}`,
  );
  return (
    <>
      <DialogHeader>
        <DialogTitle>
          {account?.name ?? `Detalles: ${label(entry?.kind ?? "registro")}`}
        </DialogTitle>
        <DialogDescription>
          {account?.firm ?? entry?.firm} · {modal.id}
        </DialogDescription>
      </DialogHeader>
      <p className="whitespace-pre-wrap text-sm">
        {account?.notes || entry?.notes || "Sin notas."}
      </p>
      {account && (
        <>
          <p className="break-all text-xs text-muted-foreground">
            ID de cuenta para importar CSV: {account.id}
          </p>
          {account.parentId && (
            <p className="text-sm">
              Intento / fase anterior:{" "}
              {data.accounts.find((a) => a.id === account.parentId)?.name ?? account.parentId}
            </p>
          )}
          {account.journalAccountId && (
            <a
              className="text-sm underline"
              href={`/trades?accounts=${encodeURIComponent(account.journalAccountId)}`}
            >
              Abrir los trades vinculados del journal
            </a>
          )}
        </>
      )}
      <Attachments type={modal.type === "account" ? "prop-account" : "prop-entry"} id={modal.id} />
      <details>
        <summary className="cursor-pointer text-sm">Historial de cambios · últimos 100</summary>
        <div className="mt-3 space-y-3">
          {history?.history.map((item) => (
            <details key={item.id} className="rounded-md border p-2 text-xs">
              <summary className="cursor-pointer">
                {item.createdAt} ·{" "}
                {item.reason.startsWith("CSV import") ? "Importación CSV" : item.reason}
              </summary>
              <p className="my-2 font-medium">Antes</p>
              <pre className="whitespace-pre-wrap break-all">
                {item.beforeJson
                  ? JSON.stringify(JSON.parse(item.beforeJson), null, 2)
                  : "Registro nuevo"}
              </pre>
              <p className="my-2 font-medium">Después</p>
              <pre className="whitespace-pre-wrap break-all">
                {JSON.stringify(JSON.parse(item.afterJson), null, 2)}
              </pre>
            </details>
          ))}
        </div>
      </details>
    </>
  );
}
function ImportForm({ close, refresh }: Props) {
  const [content, setContent] = useState(""),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [result, setResult] = useState<{
      imported: number;
      skipped: number;
      sample: Record<string, string>[];
    } | null>(null);
  const act = async (action: "preview" | "import") => {
    setBusy(true);
    setError("");
    try {
      const data = await postJson<typeof result>("/api/prop-firms/csv", { action, content });
      if (action === "preview") setResult(data);
      else {
        refresh();
        close();
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <>
      <DialogHeader>
        <DialogTitle>Importar CSV de caja de prop firms</DialogTitle>
        <DialogDescription>
          Importa gastos liquidados, reembolsos y payouts netos. La vista previa valida cada fila;
          la importación es todo o nada y los ID repetidos se omiten.
        </DialogDescription>
      </DialogHeader>
      <a className="text-sm underline" href="/prop-cash-template.csv" download>
        Descargar plantilla CSV con las cabeceras
      </a>
      <p className="text-xs text-muted-foreground">
        Usa en kind: expense, refund o payout; fecha AAAA-MM-DD; importe positivo en unidades de la
        divisa. El importe de un payout es dinero ya recibido tras repartos y comisiones. Los
        payouts necesitan el account_id que aparece en Detalles de la cuenta. El expense_id de un
        reembolso apunta al ID de su fila original. Pon los gastos antes que sus reembolsos. No
        sirve para importar extractos del bróker.
      </p>
      <Input
        type="file"
        aria-label="Archivo CSV de caja de prop firms"
        accept=".csv,text/csv"
        disabled={busy}
        onChange={async (e) => {
          const file = e.target.files?.[0];
          setContent("");
          setResult(null);
          setError("");
          if (!file) return;
          if (file.size > 2 * 1024 * 1024) {
            setError("Usa un CSV de hasta 2 MB / 1.000 filas.");
            return;
          }
          try {
            setContent(decodeImportFile(await file.arrayBuffer()));
          } catch {
            setError("No se pudo leer el CSV.");
          }
        }}
      />
      <Button variant="outline" disabled={!content || busy} onClick={() => void act("preview")}>
        {busy ? "Validando…" : "Validar y previsualizar"}
      </Button>
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      {result && (
        <>
          <p className="text-sm">
            {result.imported} registros nuevos · {result.skipped} ya importados.
          </p>
          <div className="space-y-2">
            {result.sample.map((row) => (
              <p key={row.id} className="rounded border p-2 text-xs">
                {row.date} · {row.firm} · {row.kind} · {row.amount} {row.currency}
              </p>
            ))}
          </div>
          <Button disabled={busy || result.imported === 0} onClick={() => void act("import")}>
            Importar {result.imported} registros
          </Button>
        </>
      )}
    </>
  );
}
