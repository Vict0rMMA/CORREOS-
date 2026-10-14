"use client";

import { ChevronDown, FolderOpen, Languages, Trash2 } from "lucide-react";
import { useState } from "react";
import type { PlanillaResumen } from "@/lib/nube";
import { PLANTILLAS } from "@/lib/plantillas";
import { cn, formatWhen } from "@/lib/utils";

/**
 * Las planillas guardadas en la nube, para volver a abrirlas.
 *
 * Se guardan solas mientras se trabaja; aqui solo se eligen. Borrar pide
 * confirmacion y, aun asi, no borra de verdad: se puede recuperar desde
 * Supabase.
 */

interface MisPlanillasProps {
  planillas: PlanillaResumen[];
  /** La que esta abierta ahora, para marcarla. */
  actual: string;
  onAbrir: (id: string) => void;
  onBorrar: (id: string) => void;
}

/** Cuantas se ensenan antes de pulsar "Ver mas". */
const PAGINA = 6;

export function MisPlanillas({ planillas, actual, onAbrir, onBorrar }: MisPlanillasProps) {
  const [abierta, setAbierta] = useState(true);
  const [visibles, setVisibles] = useState(PAGINA);

  if (planillas.length === 0) return null;

  const nombrePlantilla = (id: string) =>
    PLANTILLAS.find((plantilla) => plantilla.id === id)?.label ?? "Planilla";

  return (
    <section className="glass print-hidden rounded-2xl border border-line shadow-panel">
      <div className="flex items-center gap-2 px-3 py-2.5 sm:px-4">
        <FolderOpen aria-hidden className="size-4 text-muted" />
        <h2 className="eyebrow">Mis planillas</h2>
        <span className="rounded-full bg-surface-soft px-1.5 text-[11px] tabular-nums text-muted">
          {planillas.length}
        </span>
        <button
          type="button"
          onClick={() => setAbierta(!abierta)}
          aria-expanded={abierta}
          aria-label={abierta ? "Ocultar mis planillas" : "Mostrar mis planillas"}
          className="ml-auto grid size-9 place-items-center rounded-lg text-muted transition-colors hover:bg-surface-soft hover:text-ink"
        >
          <ChevronDown
            aria-hidden
            className={cn("size-4 transition-transform duration-200", abierta && "rotate-180")}
          />
        </button>
      </div>

      {abierta ? (
        <>
          <ul className="border-t border-line">
            {planillas.slice(0, visibles).map((planilla) => {
              const esLaActual = planilla.id === actual;
              const detalle = [planilla.fecha, planilla.turno].filter(Boolean).join(" · ");
              return (
                <li
                  key={planilla.id}
                  className="flex items-center gap-1 border-b border-line last:border-b-0"
                >
                  <button
                    type="button"
                    onClick={() => onAbrir(planilla.id)}
                    disabled={esLaActual}
                    className={cn(
                      "flex min-w-0 flex-1 flex-col gap-1 px-3 py-2.5 text-left transition-colors sm:px-4",
                      esLaActual ? "cursor-default bg-accent-soft/40" : "hover:bg-surface-soft",
                    )}
                  >
                    <span className="flex items-center gap-2">
                      <span className="truncate text-sm text-ink">
                        {nombrePlantilla(planilla.plantilla)}
                        {detalle ? ` — ${detalle}` : ""}
                      </span>
                      {esLaActual ? (
                        <span className="shrink-0 rounded-full bg-accent-soft px-2 py-0.5 text-[10px] font-semibold text-accent">
                          Abierta
                        </span>
                      ) : null}
                    </span>
                    <span className="flex flex-wrap items-center gap-x-1.5 text-[11px] text-muted">
                      {planilla.traducida ? (
                        <span className="inline-flex items-center gap-1 font-medium text-accent">
                          <Languages aria-hidden className="size-3" />
                          En inglés
                        </span>
                      ) : (
                        <span>Sin traducir</span>
                      )}
                      <span aria-hidden>&middot;</span>
                      <time dateTime={planilla.actualizadaEn}>
                        {formatWhen(new Date(planilla.actualizadaEn).getTime())}
                      </time>
                    </span>
                  </button>
                  <button
                    type="button"
                    onClick={() => onBorrar(planilla.id)}
                    aria-label="Borrar esta planilla"
                    title="Borrar esta planilla"
                    className="mr-2 grid size-9 shrink-0 place-items-center rounded-lg text-muted transition-colors hover:bg-danger/10 hover:text-danger"
                  >
                    <Trash2 aria-hidden className="size-4" />
                  </button>
                </li>
              );
            })}
          </ul>
          {planillas.length > visibles ? (
            <div className="border-t border-line px-3 py-2.5 text-center sm:px-4">
              <button
                type="button"
                onClick={() => setVisibles(visibles + PAGINA * 2)}
                className="rounded-lg px-3 py-1.5 text-[13px] font-medium text-ink-soft transition-colors hover:bg-surface-soft hover:text-ink"
              >
                Ver más ({planillas.length - visibles})
              </button>
            </div>
          ) : null}
        </>
      ) : null}
    </section>
  );
}
