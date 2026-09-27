"use client";

import { ChevronDown, Loader2, PlaneTakeoff } from "lucide-react";
import { useState } from "react";
import { QUICK_ACTIONS } from "@/lib/actions";
import { cn } from "@/lib/utils";
import type { Action } from "@/types";

interface QuickActionsProps {
  running: Action | null;
  disabled: boolean;
  onRun: (action: Action) => void;
}

export function QuickActions({ running, disabled, onRun }: QuickActionsProps) {
  // En movil ocupaban media pantalla de fichas: van plegadas y se abren al tocar.
  const [open, setOpen] = useState(false);

  return (
    <div className="glass print-hidden rounded-2xl border border-line p-3 shadow-panel sm:p-4">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        aria-expanded={open}
        className="-my-1 mb-1.5 flex min-h-9 w-full items-center gap-1.5 py-1 sm:my-0 sm:mb-2.5 sm:min-h-0 sm:py-0 sm:pointer-events-none"
      >
        <PlaneTakeoff aria-hidden className="size-3.5 text-accent" />
        <h2 className="eyebrow">Acciones rápidas</h2>
        <ChevronDown
          aria-hidden
          className={cn(
            "ml-auto size-4 text-muted transition-transform duration-200 sm:hidden",
            open && "rotate-180",
          )}
        />
      </button>
      <div className={cn("flex-wrap gap-2 sm:flex", open ? "flex" : "hidden")}>
        {QUICK_ACTIONS.map((action) => {
          const isRunning = running === action.id;
          return (
            <button
              key={`quick-${action.id}`}
              type="button"
              onClick={() => onRun(action.id)}
              disabled={disabled}
              title={action.hint}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-full border px-3.5 py-2 text-[13px] font-medium",
                "transition-[background-color,border-color,color,transform] duration-150 active:scale-[0.97]",
                "disabled:pointer-events-none disabled:opacity-45",
                isRunning
                  ? "border-accent bg-accent-soft text-accent"
                  : "border-line bg-surface-soft text-ink-soft hover:border-accent/40 hover:bg-accent-soft hover:text-accent",
              )}
            >
              {isRunning ? <Loader2 aria-hidden className="size-3.5 animate-spin" /> : null}
              {action.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
