"use client";

import { Suspense, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { AdherenceReport } from "@/components/adherence-report";
import { FilterBar } from "@/components/filter-bar";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { postJson, useApi } from "@/lib/use-api";

interface Playbook {
  id: string;
  name: string;
  description: string;
  rules: string[];
  tradeCount: number;
}

export default function PlaybooksPage() {
  return (
    <Suspense>
      <Playbooks />
    </Suspense>
  );
}

function Playbooks() {
  const { data, refresh } = useApi<{ playbooks: Playbook[] }>("/api/playbooks");
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [rules, setRules] = useState("");

  const create = async () => {
    await postJson("/api/playbooks", {
      name,
      description,
      rules: rules
        .split("\n")
        .map((rule) => rule.trim())
        .filter(Boolean),
    });
    setOpen(false);
    setName("");
    setDescription("");
    setRules("");
    refresh();
  };

  return (
    <div>
      <FilterBar
        title="Playbooks"
        actions={
          <Button size="sm" onClick={() => setOpen(true)}>
            <Plus />
            Nuevo playbook
          </Button>
        }
      />
      <div className="grid gap-3 p-4 md:grid-cols-2 xl:grid-cols-3">
        {data?.playbooks.length === 0 && (
          <p className="col-span-full py-16 text-center text-sm text-muted-foreground">
            Un playbook es un setup que operas a propósito: ponle nombre, escribe sus reglas,
            asígnalo a tus trades y deja que Informes te diga si de verdad es rentable.
          </p>
        )}
        {data?.playbooks.map((playbook) => (
          <Card key={playbook.id}>
            <CardHeader className="flex-row flex-wrap items-center justify-between gap-2">
              <CardTitle className="text-foreground text-base font-semibold">
                {playbook.name}
              </CardTitle>
              <div className="ml-auto flex shrink-0 items-center gap-2">
                <span className="text-xs text-muted-foreground">{playbook.tradeCount} trades</span>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 text-muted-foreground hover:text-destructive"
                  onClick={async () => {
                    if (
                      confirm(
                        `¿Borrar "${playbook.name}"? Los trades conservan sus datos; solo pierden el vínculo.`,
                      )
                    ) {
                      await postJson(`/api/playbooks/${playbook.id}`, undefined, "DELETE");
                      refresh();
                    }
                  }}
                >
                  <Trash2 />
                </Button>
              </div>
            </CardHeader>
            <CardContent className="space-y-2">
              {playbook.description && (
                <p className="text-sm text-muted-foreground">{playbook.description}</p>
              )}
              {playbook.rules.length > 0 && (
                <ul className="space-y-1 text-sm">
                  {playbook.rules.map((rule, index) => (
                    <li key={index} className="flex min-w-0 gap-2 break-words">
                      <span className="text-muted-foreground">{index + 1}.</span>
                      {rule}
                    </li>
                  ))}
                </ul>
              )}
              <AdherenceReport bookId={playbook.id} />
            </CardContent>
          </Card>
        ))}
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Nuevo playbook</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <Input
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="Nombre (p. ej. Sweep + CISD en NY AM)"
            />
            <Input
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              placeholder="Descripción en una línea"
            />
            <Textarea
              value={rules}
              onChange={(event) => setRules(event.target.value)}
              placeholder={
                "Una regla por línea:\nSolo setups A+\nRiesgo máximo 1R\nSin entradas después de las 11:30"
              }
              className="min-h-32"
            />
            <Button onClick={create} disabled={!name}>
              Crear
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
