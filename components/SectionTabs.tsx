"use client";

import { Mail, Table2 } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Seccion } from "@/types";

/**
 * Las dos mitades de la aplicacion.
 *
 * Los correos y las planillas no tienen nada que ver entre si, asi que cada
 * uno tiene su pestana: su texto, su resultado y sus guardados. Cambiar de
 * pestana no pierde lo que habia en la otra.
 */

const PESTANAS: { id: Seccion; label: string; hint: string; icono: typeof Mail }[] = [
  {
    id: "correos",
    label: "Correos",
    hint: "Escribir, corregir y traducir",
    icono: Mail,
  },
  {
    id: "planillas",
    label: "Planillas",
    hint: "Tablas del turno y Excel",
    icono: Table2,
  },
];

export function SectionTabs({
  value,
  onChange,
}: {
  value: Seccion;
  onChange: (seccion: Seccion) => void;
}) {
  return (
    <div
      role="tablist"
      aria-label="Secciones"
      className="glass print-hidden flex gap-1.5 rounded-2xl border border-line p-1.5 shadow-panel"
    >
      {PESTANAS.map((pestana) => {
        const activa = pestana.id === value;
        const Icono = pestana.icono;
        return (
          <button
            key={pestana.id}
            type="button"
            role="tab"
            aria-selected={activa}
            onClick={() => onChange(pestana.id)}
            className={cn(
              "flex flex-1 items-center justify-center gap-2 rounded-xl px-3 py-2.5 transition-colors duration-200",
              activa
                ? "bg-accent text-accent-ink"
                : "text-muted hover:bg-surface-soft hover:text-ink",
            )}
          >
            <Icono aria-hidden className="size-4 shrink-0" />
            <span className="text-left">
              <span className="block text-[14px] font-semibold leading-tight">
                {pestana.label}
              </span>
              <span
                className={cn(
                  "hidden text-[11px] leading-tight sm:block",
                  activa ? "text-accent-ink/70" : "text-muted",
                )}
              >
                {pestana.hint}
              </span>
            </span>
          </button>
        );
      })}
    </div>
  );
}
