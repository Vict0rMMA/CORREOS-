"use client";

import { ArrowLeftRight, Plane } from "lucide-react";
import { Segmented } from "@/components/ui/Segmented";
import type { Lang } from "@/types";

const LANGS = [
  { id: "es" as Lang, label: "Español" },
  { id: "en" as Lang, label: "English" },
];

/** Nombre del idioma como etiqueta (cada uno en su propia lengua). */
const NAMES: Record<Lang, string> = { es: "Español", en: "English" };

/** Nombre dentro de una frase en espanol: en minuscula, como manda la RAE. */
const EN_FRASE: Record<Lang, string> = { es: "español", en: "inglés" };

interface LanguageRouteProps {
  /** Idioma en el que esta escrito el texto. */
  source: Lang;
  onSourceChange: (lang: Lang) => void;
  /** Idioma al que traduce el boton Traducir. */
  target: Lang;
  onTargetChange: (lang: Lang) => void;
  onSwap: () => void;
}

/**
 * La ruta del texto: de que idioma sale y a cual llega.
 *
 * En movil las etiquetas van en linea con sus selectores (tres filas cortas en
 * vez de seis) y el boton de intercambio sube a la cabecera de la tarjeta.
 */
export function LanguageRoute({
  source,
  onSourceChange,
  target,
  onTargetChange,
  onSwap,
}: LanguageRouteProps) {
  const swapButton = (
    <button
      type="button"
      onClick={onSwap}
      aria-label="Intercambiar los idiomas"
      title="Intercambiar"
      className="grid size-9 shrink-0 place-items-center rounded-xl border border-line bg-surface-soft text-muted transition-colors hover:border-accent hover:text-accent active:scale-95"
    >
      <ArrowLeftRight aria-hidden className="size-4" />
    </button>
  );

  return (
    <div className="glass print-hidden rounded-2xl border border-line p-3 shadow-panel sm:p-4">
      {/* Cabecera solo en movil: titulo corto + intercambiar */}
      <div className="mb-2.5 flex items-center justify-between sm:hidden">
        <span className="eyebrow inline-flex items-center gap-1.5">
          <Plane aria-hidden className="size-3 rotate-45 text-accent" />
          Idiomas
        </span>
        {swapButton}
      </div>

      <div className="flex flex-col gap-2.5 sm:flex-row sm:items-end sm:gap-3">
        <div className="flex items-center justify-between gap-3 sm:flex-col sm:items-start sm:gap-1.5">
          <span className="eyebrow">Mi texto está en</span>
          <Segmented
            ariaLabel="Idioma en el que escribo"
            value={source}
            options={LANGS}
            onChange={onSourceChange}
          />
        </div>

        <span className="hidden sm:mb-0.5 sm:block">{swapButton}</span>

        <div className="flex items-center justify-between gap-3 sm:flex-col sm:items-start sm:gap-1.5">
          <span className="eyebrow">Traducir a</span>
          <Segmented
            ariaLabel="Idioma al que quiero traducir"
            value={target}
            options={LANGS}
            onChange={onTargetChange}
          />
        </div>

        <p className="hidden items-center gap-1.5 text-sm font-medium text-ink-soft sm:ml-auto sm:flex">
          {NAMES[source]}
          <Plane aria-hidden className="size-3.5 rotate-45 text-accent" />
          {NAMES[target]}
        </p>
      </div>

      <p className="mt-2.5 border-t border-line pt-2.5 text-[11px] leading-relaxed text-muted sm:mt-3 sm:text-xs">
        <strong className="font-medium text-ink-soft">Traducir</strong> pasa tu texto de{" "}
        {EN_FRASE[source]} a {EN_FRASE[target]}.{" "}
        <span className="sm:hidden">Las demás acciones responden en {EN_FRASE[source]}.</span>
        <span className="hidden sm:inline">
          Corregir, Mejorar y Generar correo no cambian el idioma: responden en{" "}
          {EN_FRASE[source]}.
        </span>
      </p>
    </div>
  );
}
