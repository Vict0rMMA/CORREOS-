"use client";

import { FolderOpen, Mail, Table2 } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Seccion } from "@/types";

/**
 * Las partes de la aplicacion.
 *
 * Los correos y las planillas no tienen nada que ver entre si, asi que cada
 * uno tiene su pestana: su texto, su resultado y sus guardados. Las planillas
 * hechas tienen la suya, Guardadas, para volver a abrirlas. Cambiar de
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
  {
    id: "guardadas",
    label: "Guardadas",
    hint: "Abrir y modificar planillas",
    icono: FolderOpen,
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
      className="glass print-hidden flex gap-1 rounded-2xl border border-line p-1 shadow-panel sm:gap-1.5 sm:p-1.5"
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
              "flex min-w-0 flex-1 items-center justify-center gap-1.5 rounded-xl px-2 py-2.5 transition-colors duration-200 sm:gap-2 sm:px-3",
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
