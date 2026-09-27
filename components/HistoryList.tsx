"use client";

import { ChevronDown, History, Trash2 } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { ACTION_LABELS, TEXT_TYPES } from "@/lib/actions";
import { cn, formatWhen } from "@/lib/utils";
import type { HistoryItem } from "@/types";

interface HistoryListProps {
  items: HistoryItem[];
  onRestore: (item: HistoryItem) => void;
  onClear: () => void;
}

export function HistoryList({ items, onRestore, onClear }: HistoryListProps) {
  const [open, setOpen] = useState(true);

  if (items.length === 0) return null;

  return (
    <section className="print-hidden rounded-2xl border border-line bg-surface shadow-panel">
      <div className="flex items-center gap-2 px-3 py-2.5 sm:px-4">
        <History aria-hidden className="size-3.5 text-muted" />
        <h2 className="eyebrow">
          Recientes
        </h2>
        <span className="rounded-full bg-surface-soft px-1.5 text-[11px] tabular-nums text-muted">
          {items.length}
        </span>
        <div className="ml-auto flex items-center gap-1">
          <Button
            size="sm"
            variant="ghost"
            onClick={onClear}
            title="Eliminar historial"
            icon={<Trash2 aria-hidden className="size-4" />}
          >
            <span className="hidden sm:inline">Eliminar historial</span>
          </Button>
          <button
            type="button"
            onClick={() => setOpen(!open)}
            aria-expanded={open}
            aria-label={open ? "Ocultar recientes" : "Mostrar recientes"}
            className="grid size-8 place-items-center rounded-lg text-muted transition-colors hover:bg-surface-soft hover:text-ink"
          >
            <ChevronDown
              aria-hidden
              className={cn("size-4 transition-transform duration-200", open && "rotate-180")}
            />
          </button>
        </div>
      </div>

      {open ? (
        <ul className="border-t border-line">
          {items.map((item) => (
            <li key={item.id} className="border-b border-line last:border-b-0">
              <button
                type="button"
                onClick={() => onRestore(item)}
                className="flex w-full flex-col gap-1 px-3 py-2.5 text-left transition-colors hover:bg-surface-soft sm:px-4"
              >
                <span className="line-clamp-1 text-sm text-ink">{item.preview}</span>
                <span className="flex flex-wrap items-center gap-x-1.5 text-[11px] text-muted">
                  <span className="font-medium text-accent">{ACTION_LABELS[item.action]}</span>
                  <span aria-hidden>&middot;</span>
                  <span>{item.lang === "es" ? "Español" : "Inglés"}</span>
                  <span aria-hidden>&middot;</span>
                  <span>
                    {TEXT_TYPES.find((type) => type.id === item.textType)?.label ?? "General"}
                  </span>
                  <span aria-hidden>&middot;</span>
                  <time dateTime={new Date(item.createdAt).toISOString()}>
                    {formatWhen(item.createdAt)}
                  </time>
                </span>
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}
