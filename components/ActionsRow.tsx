"use client";

import { Languages, Mail, SpellCheck, Wand2 } from "lucide-react";
import type { ReactNode } from "react";
import { Button } from "@/components/ui/Button";
import type { ActionMeta } from "@/lib/actions";
import type { Action } from "@/types";

const ICONS: Record<string, ReactNode> = {
  correct: <SpellCheck aria-hidden className="size-4" />,
  translate: <Languages aria-hidden className="size-4" />,
  improve: <Wand2 aria-hidden className="size-4" />,
  generate_email: <Mail aria-hidden className="size-4" />,
};

interface ActionsRowProps {
  /** Las acciones de la pestana: no son las mismas en correos y en planillas. */
  actions: ActionMeta[];
  primary: Action;
  running: Action | null;
  disabled: boolean;
  onRun: (action: Action) => void;
  /** Idioma al que traduciria ahora mismo el boton Traducir. */
  translateTarget: string;
}

export function ActionsRow({
  actions,
  primary,
  running,
  disabled,
  onRun,
  translateTarget,
}: ActionsRowProps) {
  return (
    <div className="print-hidden grid grid-cols-2 gap-2 sm:flex sm:flex-wrap">
      {actions.map((action) => (
        <Button
          key={action.id}
          size="lg"
          variant={action.id === primary ? "primary" : "secondary"}
          onClick={() => onRun(action.id)}
          disabled={disabled}
          loading={running === action.id}
          title={action.hint}
          className="w-full justify-start px-3.5 sm:w-auto sm:justify-center sm:px-5"
          icon={ICONS[action.id]}
        >
          {action.id === "translate" ? (
            <span className="truncate">
              {action.label} a <span className="font-semibold">{translateTarget}</span>
            </span>
          ) : (
            action.label
          )}
        </Button>
      ))}
    </div>
  );
}
