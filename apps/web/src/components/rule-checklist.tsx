"use client";
import { OptionSelect } from "@/components/ui/option-select";

import { useState } from "react";
import { useApi, postJson } from "@/lib/use-api";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { fieldClass } from "@/components/filter-fields";
export function RuleChecklist({
  tradeKey,
  playbookId,
}: {
  tradeKey: string;
  playbookId: string | null;
}) {
  const url = `/api/trades/${encodeURIComponent(tradeKey)}/rules`;
  const { data, error, refresh } = useApi<{
      name: string | null;
      rules: { rule: string; followed: boolean | null }[];
    }>(`${url}?playbook=${playbookId ?? ""}`),
    [failure, setFailure] = useState("");
  const evaluated = data?.rules.filter((r) => r.followed !== null) ?? [],
    followed = evaluated.filter((r) => r.followed).length;
  return (
    <Card>
      <CardHeader>
        <CardTitle>Revisión de reglas de la estrategia</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {data?.name ? (
          <>
            <p className="text-sm font-medium">{data.name}</p>
            <p className="text-xs text-muted-foreground">
              {evaluated.length
                ? `${Math.round((followed / evaluated.length) * 100)}% cumplidas · `
                : ""}
              {evaluated.length}/{data.rules.length} reglas evaluadas
            </p>
            {data.rules.length === 0 && (
              <p className="text-xs text-muted-foreground">
                Añade reglas a este playbook para revisar si las cumples.
              </p>
            )}
            {data.rules.map((r) => (
              <label
                key={r.rule}
                className="flex items-center justify-between gap-3 border-t pt-2 text-sm"
              >
                <span>{r.rule}</span>
                <OptionSelect
                  aria-label={r.rule}
                  className={`${fieldClass} !w-32 shrink-0`}
                  value={r.followed === null ? "unreviewed" : String(r.followed)}
                  onValueChange={async (next) => {
                    try {
                      await postJson(url, {
                        rule: r.rule,
                        followed: next === "unreviewed" ? null : next === "true",
                      });
                      refresh();
                      setFailure("");
                    } catch (e) {
                      setFailure(String(e));
                    }
                  }}
                >
                  <option value="unreviewed">Sin evaluar</option>
                  <option value="true">Cumplida</option>
                  <option value="false">Rota</option>
                </OptionSelect>
              </label>
            ))}
          </>
        ) : (
          <p className="text-xs text-muted-foreground">
            Asigna un playbook para revisar sus reglas en este trade.
          </p>
        )}
        {(error || failure) && (
          <p role="alert" className="text-xs text-destructive">
            {error || failure}
          </p>
        )}
      </CardContent>
    </Card>
  );
}
