"use client";

import { Languages, Mail, SpellCheck, Wand2 } from "lucide-react";
import type { ReactNode } from "react";
import { Button } from "@/components/ui/Button";
import { MAIN_ACTIONS } from "@/lib/actions";
import type { Action } from "@/types";

const ICONS: Record<string, ReactNode> = {
  correct: <SpellCheck aria-hidden className="size-4" />,
  translate: <Languages aria-hidden className="size-4" />,
  improve: <Wand2 aria-hidden className="size-4" />,
  generate_email: <Mail aria-hidden className="size-4" />,
};

interface ActionsRowProps {
  primary: Action;
  running: Action | null;
  disabled: boolean;
  onRun: (action: Action) => void;
  /** Idioma al que traduciria ahora mismo el boton Traducir. */
  translateTarget: string;
}

export function ActionsRow({
  primary,
  running,
  disabled,
  onRun,
  translateTarget,
}: ActionsRowProps) {
  return (
    <div className="print-hidden flex flex-wrap gap-2">
      {MAIN_ACTIONS.map((action) => (
        <Button
          key={action.id}
          size="lg"
          variant={action.id === primary ? "primary" : "secondary"}
          onClick={() => onRun(action.id)}
          disabled={disabled}
          loading={running === action.id}
          title={action.hint}
          className="flex-1 sm:flex-none"
          icon={ICONS[action.id]}
        >
          {action.id === "translate" ? (
            <>
              {action.label}
              <span className="ml-0.5 font-semibold opacity-80">a {translateTarget}</span>
            </>
          ) : (
            action.label
          )}
        </Button>
      ))}
    </div>
  );
}
