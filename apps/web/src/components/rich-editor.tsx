"use client";
import { useImperativeHandle, useRef, useState, type Ref } from "react";
import Link from "next/link";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Button } from "@/components/ui/button";
import { ChevronDown, FileText } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from "@/components/ui/dropdown-menu";
import { fieldClass } from "@/components/filter-fields";
import { postJson, useApi } from "@/lib/use-api";
import { formatInlineSelection, remarkRepairSpacedEmphasis } from "@/lib/note-formatting";
import { tradeLinkLabel, tradeMarkdownLink, type LinkableTrade } from "@/lib/trade-links";
export function Markdown({ children }: { children: string }) {
  return (
    <div className="journal-markdown">
      <ReactMarkdown
        remarkPlugins={[remarkGfm, remarkRepairSpacedEmphasis]}
        components={{
          table: ({ children }) => (
            <div className="max-w-full overflow-x-auto">
              <table>{children}</table>
            </div>
          ),
          a: ({ href, children }) =>
            href?.startsWith("/trades/") ? (
              <Link href={href}>{children}</Link>
            ) : (
              <a href={href}>{children}</a>
            ),
        }}
      >
        {children}
      </ReactMarkdown>
    </div>
  );
}
const BUILT_INS = [
  {
    id: "pre",
    name: "Plan premercado",
    content:
      "## Contexto de mercado\n\n## Setups a vigilar\n\n## Límites de riesgo\n- [ ] Confirmar el límite de riesgo diario\n- [ ] Revisar las noticias programadas\n\n## Mi intención\n",
  },
  {
    id: "review",
    name: "Revisión de trade",
    content: "## Setup y tesis\n\n## Ejecución\n\n## Qué funcionó\n\n## Qué voy a cambiar\n",
  },
  {
    id: "weekly",
    name: "Revisión semanal",
    content:
      "## Aciertos de la semana\n\n## Errores repetidos\n\n## Reglas que cumplí\n\n## Una mejora para la próxima semana\n",
  },
];
export interface RichEditorHandle {
  focus(): void;
}
export function RichEditor({
  value,
  onChange,
  placeholder = "Escribe tu revisión…",
  defaultMode,
  mode,
  onModeChange,
  showModeToggle = true,
  editorRef,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  defaultMode?: "preview" | "edit";
  mode?: "preview" | "edit";
  onModeChange?: (mode: "preview" | "edit") => void;
  showModeToggle?: boolean;
  editorRef?: Ref<RichEditorHandle>;
}) {
  const ref = useRef<HTMLTextAreaElement>(null),
    [localPreview, setLocalPreview] = useState(() =>
      defaultMode ? defaultMode === "preview" : Boolean(value.trim()),
    ),
    [error, setError] = useState("");
  const preview = mode ? mode === "preview" : localPreview;
  const setPreview = (next: boolean) => {
    setLocalPreview(next);
    onModeChange?.(next ? "preview" : "edit");
  };
  useImperativeHandle(editorRef, () => ({
    focus() {
      setPreview(false);
      requestAnimationFrame(() => {
        ref.current?.focus();
        ref.current?.setSelectionRange(value.length, value.length);
      });
    },
  }));
  const { data, refresh } = useApi<{ templates: { id: string; name: string; content: string }[] }>(
    "/api/workspace/templates",
  );
  const [linkOpen, setLinkOpen] = useState(false),
    [search, setSearch] = useState("");
  const {
    data: trades,
    error: tradeError,
    loading: tradesLoading,
  } = useApi<{
    trades: LinkableTrade[];
    hasMore: boolean;
  }>(linkOpen ? `/api/trades/lookup?q=${encodeURIComponent(search)}` : null);
  function insert(before: string, after = "") {
    const el = ref.current;
    const start = el?.selectionStart ?? value.length,
      end = el?.selectionEnd ?? value.length;
    onChange(value.slice(0, start) + before + value.slice(start, end) + after + value.slice(end));
    setPreview(false);
    requestAnimationFrame(() => {
      ref.current?.focus();
      ref.current?.setSelectionRange(start + before.length, end + before.length);
    });
  }
  function formatInline(marker: "*" | "**") {
    const next = formatInlineSelection(
      value,
      ref.current?.selectionStart ?? value.length,
      ref.current?.selectionEnd ?? value.length,
      marker,
    );
    onChange(next.value);
    requestAnimationFrame(() => {
      ref.current?.focus();
      ref.current?.setSelectionRange(next.selectionStart, next.selectionEnd);
    });
  }
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-1">
        {showModeToggle && (
          <Button type="button" variant="outline" size="sm" onClick={() => setPreview(!preview)}>
            {preview ? "Editar" : "Vista previa"}
          </Button>
        )}
        {!preview && (
          <>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => formatInline("**")}
              aria-label="Negrita"
            >
              B
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => formatInline("*")}
              aria-label="Cursiva"
            >
              <i>I</i>
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => insert("\n## ")}
              aria-label="Título"
            >
              H2
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => insert("\n- ")}
              aria-label="Lista"
            >
              Lista
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => insert("\n- [ ] ")}
              aria-label="Lista de tareas"
            >
              Tareas
            </Button>
            <Button type="button" size="sm" variant="ghost" onClick={() => setLinkOpen(!linkOpen)}>
              Enlazar trade
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  aria-label="Insertar plantilla"
                  className="gap-2 rounded-lg"
                >
                  Insertar plantilla…
                  <ChevronDown className="size-3.5 text-muted-foreground" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" aria-label="Plantillas de notas">
                {[...BUILT_INS, ...(data?.templates ?? [])].map((template) => (
                  <DropdownMenuItem
                    key={template.id}
                    onSelect={() => onChange(value + (value ? "\n\n" : "") + template.content)}
                  >
                    <FileText
                      aria-hidden="true"
                      className="size-3.5 shrink-0 text-muted-foreground"
                    />
                    {template.name}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              disabled={!value}
              onClick={async () => {
                const name = prompt("Ponle nombre a esta plantilla");
                if (!name) return;
                try {
                  await postJson("/api/workspace/templates", { name, content: value });
                  refresh();
                } catch (e) {
                  setError(String(e));
                }
              }}
            >
              Guardar plantilla
            </Button>
          </>
        )}
      </div>
      {linkOpen && !preview && (
        <div className="space-y-2 rounded-md border p-2">
          <input
            aria-label="Buscar trade por símbolo, fecha o cuenta"
            placeholder="Buscar símbolo, fecha o cuenta"
            className={fieldClass}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <div className="max-h-40 overflow-y-auto">
            {tradesLoading && (
              <p role="status" className="text-xs text-muted-foreground">
                Cargando trades…
              </p>
            )}
            {tradeError && (
              <p role="alert" className="text-xs text-destructive">
                {tradeError}
              </p>
            )}
            {!tradesLoading &&
              !tradeError &&
              trades?.trades.map((t) => (
                <button
                  key={t.key}
                  type="button"
                  className="block w-full rounded p-1 text-left text-xs hover:bg-accent"
                  onClick={() => {
                    onChange(value + `\n${tradeMarkdownLink(t)}\n`);
                    setLinkOpen(false);
                    setPreview(true);
                  }}
                >
                  {tradeLinkLabel(t)}
                </button>
              ))}
            {!tradesLoading && !tradeError && trades?.trades.length === 0 && (
              <p className="text-xs text-muted-foreground">Ningún trade coincide.</p>
            )}
            {!tradesLoading && !tradeError && trades?.hasMore && (
              <p className="text-xs text-muted-foreground">
                Mostrando los 50 más recientes. Busca por fecha o cuenta para encontrar trades
                anteriores.
              </p>
            )}
          </div>
        </div>
      )}
      {preview ? (
        <div className="min-h-40 rounded-md border p-3">
          <Markdown>{value || "Aún no hay nada escrito."}</Markdown>
        </div>
      ) : (
        <textarea
          ref={ref}
          aria-label="Notas de revisión"
          className={`${fieldClass} min-h-48 resize-y font-mono text-[13px]`}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
        />
      )}
      {error && (
        <p role="alert" className="text-xs text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}
