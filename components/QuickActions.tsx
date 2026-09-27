"use client";

import { Loader2, PlaneTakeoff } from "lucide-react";
import { QUICK_ACTIONS } from "@/lib/actions";
import { cn } from "@/lib/utils";
import type { Action } from "@/types";

interface QuickActionsProps {
  running: Action | null;
  disabled: boolean;
  onRun: (action: Action) => void;
}

export function QuickActions({ running, disabled, onRun }: QuickActionsProps) {
  return (
    <div className="glass print-hidden rounded-2xl border border-line p-3 shadow-panel sm:p-4">
      <div className="mb-2.5 flex items-center gap-1.5">
        <PlaneTakeoff aria-hidden className="size-3.5 text-accent" />
        <h2 className="eyebrow">
          Acciones rápidas
        </h2>
      </div>
      <div className="flex flex-wrap gap-2">
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
