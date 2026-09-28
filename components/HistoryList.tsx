"use client";

import { ChevronDown, History, Search, Trash2, X } from "lucide-react";
import { useMemo, useState } from "react";
import { Button } from "@/components/ui/Button";
import { ACTION_LABELS, TEXT_TYPES } from "@/lib/actions";
import { cn, formatWhen } from "@/lib/utils";
import type { HistoryItem } from "@/types";

/** Cuantos se muestran antes de pulsar "Ver mas". */
const PAGE = 8;

interface HistoryListProps {
  items: HistoryItem[];
  onRestore: (item: HistoryItem) => void;
  onRemove: (id: string) => void;
  onClear: () => void;
}

/** Texto sin tildes ni mayusculas, para buscar sin preocuparse de escribirlas. */
function simple(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();
}

export function HistoryList({ items, onRestore, onRemove, onClear }: HistoryListProps) {
  const [open, setOpen] = useState(true);
  const [query, setQuery] = useState("");
  const [visible, setVisible] = useState(PAGE);

  const filtered = useMemo(() => {
    const needle = simple(query.trim());
    if (!needle) return items;
    // Se busca en lo que se escribio, en el resultado y en el asunto.
    return items.filter((item) =>
      simple(`${item.input} ${item.output} ${item.subject ?? ""}`).includes(needle),
    );
  }, [items, query]);

  if (items.length === 0) return null;

  const shown = filtered.slice(0, visible);

  return (
    <section className="glass print-hidden rounded-2xl border border-line shadow-panel">
      <div className="flex flex-wrap items-center gap-2 px-3 py-2.5 sm:px-4">
        <History aria-hidden className="size-3.5 text-muted" />
        <h2 className="eyebrow">Guardados</h2>
        <span className="rounded-full bg-surface-soft px-1.5 text-[11px] tabular-nums text-muted">
          {items.length}
        </span>

        <div className="ml-auto flex items-center gap-1">
          <Button
            size="sm"
            variant="ghost"
            onClick={onClear}
            title="Borrar todo lo guardado"
            icon={<Trash2 aria-hidden className="size-4" />}
          >
            <span className="hidden sm:inline">Borrar todo</span>
          </Button>
          <button
            type="button"
            onClick={() => setOpen(!open)}
            aria-expanded={open}
            aria-label={open ? "Ocultar guardados" : "Mostrar guardados"}
            className="grid size-9 place-items-center rounded-lg text-muted transition-colors hover:bg-surface-soft hover:text-ink"
          >
            <ChevronDown
              aria-hidden
              className={cn("size-4 transition-transform duration-200", open && "rotate-180")}
            />
          </button>
        </div>
      </div>

      {open ? (
        <>
          <div className="border-t border-line px-3 py-2.5 sm:px-4">
            <div className="relative">
              <Search
                aria-hidden
                className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted"
              />
              <input
                type="search"
                value={query}
                onChange={(event) => {
                  setQuery(event.target.value);
                  setVisible(PAGE);
                }}
                placeholder="Buscar en lo guardado..."
                aria-label="Buscar en los textos guardados"
                className="h-11 w-full rounded-xl border border-line bg-surface pl-9 pr-9 text-sm text-ink outline-none transition-colors hover:border-line-strong placeholder:text-muted/70 sm:h-10"
              />
              {query ? (
                <button
                  type="button"
                  onClick={() => setQuery("")}
                  aria-label="Limpiar la búsqueda"
                  className="absolute right-2 top-1/2 grid size-7 -translate-y-1/2 place-items-center rounded-lg text-muted transition-colors hover:text-ink"
                >
                  <X aria-hidden className="size-4" />
                </button>
              ) : null}
            </div>
            {query ? (
              <p className="mt-1.5 text-[11px] text-muted">
                {filtered.length === 0
                  ? "Nada coincide con esa búsqueda."
                  : `${filtered.length} ${filtered.length === 1 ? "resultado" : "resultados"}`}
              </p>
            ) : null}
          </div>

          {shown.length > 0 ? (
            <ul className="border-t border-line">
              {shown.map((item) => (
                <li
                  key={item.id}
                  className="flex items-center gap-1 border-b border-line last:border-b-0"
                >
                  <button
                    type="button"
                    onClick={() => onRestore(item)}
                    className="flex min-w-0 flex-1 flex-col gap-1 px-3 py-2.5 text-left transition-colors hover:bg-surface-soft sm:px-4"
                  >
                    <span className="line-clamp-1 text-sm text-ink">{item.preview}</span>
                    <span className="flex flex-wrap items-center gap-x-1.5 text-[11px] text-muted">
                      <span className="font-medium text-accent">{ACTION_LABELS[item.action]}</span>
                      <span aria-hidden>&middot;</span>
                      <span>{item.lang === "es" ? "Español" : "Inglés"}</span>
                      <span aria-hidden>&middot;</span>
                      <span>
                        {TEXT_TYPES.find((type) => type.id === item.textType)?.label ?? "Texto"}
                      </span>
                      <span aria-hidden>&middot;</span>
                      <time dateTime={new Date(item.createdAt).toISOString()}>
                        {formatWhen(item.createdAt)}
                      </time>
                    </span>
                  </button>
                  <button
                    type="button"
                    onClick={() => onRemove(item.id)}
                    aria-label="Borrar este texto"
                    title="Borrar este texto"
                    className="mr-2 grid size-9 shrink-0 place-items-center rounded-lg text-muted transition-colors hover:bg-danger/10 hover:text-danger"
                  >
                    <X aria-hidden className="size-4" />
                  </button>
                </li>
              ))}
            </ul>
          ) : null}

          {filtered.length > visible ? (
            <div className="border-t border-line px-3 py-2.5 text-center sm:px-4">
              <Button size="sm" variant="quiet" onClick={() => setVisible(visible + PAGE * 2)}>
                Ver más ({filtered.length - visible})
              </Button>
            </div>
          ) : null}
        </>
      ) : null}
    </section>
  );
}
