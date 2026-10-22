import { and, eq } from "drizzle-orm";
import { attachments, db, executions, notes, tradeExcursions, tradeRuleChecks, trades } from "@/db";
import type { AssetClass } from "@luxalgo/journal-core";
import { RequestError } from "./api";
import { executionProblem, insertExecutions, listExecutions } from "./executions";
import { getTradeByKey } from "./trades-query";

export interface EditedExecution {
  side: "buy" | "sell";
  quantity: number;
  price: number;
  fee: number;
  /** ISO 8601 en UTC. */
  executedAt: string;
}

/**
 * Sustituye las ejecuciones de un trade metido a mano y conserva todo lo anotado
 * (notas, psicología, imágenes, etiquetas, playbook…). El trade se identifica por
 * su hora de entrada: si cambia, lo anotado se muda al trade corregido.
 */
export function editManualTrade(key: string, rows: EditedExecution[]): { key: string } {
  const old = getTradeByKey(key);
  if (!old) throw new RequestError("Trade no encontrado.");
  const oldIds = JSON.parse(old.executionIdsJson) as string[];
  const oldFills = listExecutions(old.accountId, oldIds);
  if (!oldFills.length || oldFills.some((fill) => fill.source !== "manual"))
    throw new RequestError(
      "Solo se pueden editar los trades metidos a mano. Los importados se corrigen en el archivo de origen y se vuelven a importar.",
    );
  if (!Array.isArray(rows) || rows.length < 1 || rows.length > 200)
    throw new RequestError("El trade necesita al menos una ejecución.");
  const assetClass = (oldFills.find((fill) => fill.assetClass)?.assetClass ?? undefined) as
    AssetClass | undefined;
  const clean = rows.map((row) => ({
    symbol: old.symbol,
    side: row?.side,
    quantity: Number(row?.quantity),
    price: Number(row?.price),
    fee: Number(row?.fee ?? 0),
    executedAt:
      typeof row?.executedAt === "string" && Number.isFinite(Date.parse(row.executedAt))
        ? new Date(row.executedAt).toISOString()
        : "",
    ...(assetClass ? { assetClass } : {}),
  }));
  for (const row of clean) {
    const problem = executionProblem(row, "manual");
    if (problem) throw new RequestError(problem);
  }

  let newKey = key;
  db.transaction(() => {
    // Lo anotado vive en la fila del trade, que el recálculo borra al cambiar la entrada.
    const annotations = {
      notes: old.notes,
      tagsJson: old.tagsJson,
      mistakesJson: old.mistakesJson,
      playbookId: old.playbookId,
      rating: old.rating,
      stopLoss: old.stopLoss,
      profitTarget: old.profitTarget,
      reviewedAt: old.reviewedAt,
      psychJson: old.psychJson,
      setupJson: old.setupJson,
      // El identificador del trade no cambia aunque cambie la hora de entrada.
      uid: old.uid,
    };
    const before = new Set(
      db
        .select({ id: executions.id })
        .from(executions)
        .where(eq(executions.accountId, old.accountId))
        .all()
        .map((row) => row.id),
    );
    for (const id of oldIds)
      db.delete(executions)
        .where(and(eq(executions.accountId, old.accountId), eq(executions.id, id)))
        .run();
    // Las comisiones se guardan tal cual se ven en el formulario.
    insertExecutions(old.accountId, clean, "manual", undefined, { preserveFees: true });

    const added = db
      .select({ id: executions.id, executedAt: executions.executedAt })
      .from(executions)
      .where(eq(executions.accountId, old.accountId))
      .all()
      .filter((row) => !before.has(row.id))
      .sort((a, b) => a.executedAt.localeCompare(b.executedAt));
    const first = added[0];
    const target = first
      ? db
          .select({ key: trades.key, executionIdsJson: trades.executionIdsJson })
          .from(trades)
          .where(eq(trades.accountId, old.accountId))
          .all()
          .find((row) => (JSON.parse(row.executionIdsJson) as string[]).includes(first.id))
      : undefined;
    if (!target) throw new RequestError("No se ha podido rehacer el trade con esas ejecuciones.");
    newKey = target.key;

    db.update(trades).set(annotations).where(eq(trades.key, newKey)).run();
    if (newKey !== key) {
      db.update(attachments)
        .set({ ownerId: newKey })
        .where(and(eq(attachments.ownerType, "trade"), eq(attachments.ownerId, key)))
        .run();
      db.update(tradeRuleChecks)
        .set({ tradeKey: newKey })
        .where(eq(tradeRuleChecks.tradeKey, key))
        .run();
      db.update(notes).set({ tradeKey: newKey }).where(eq(notes.tradeKey, key)).run();
    }
    // Las velas y el MAE/MFE calculados ya no valen con otras ejecuciones.
    db.delete(tradeExcursions).where(eq(tradeExcursions.tradeKey, key)).run();
    db.delete(tradeExcursions).where(eq(tradeExcursions.tradeKey, newKey)).run();
  });
  return { key: newKey };
}
