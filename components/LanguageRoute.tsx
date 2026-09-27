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

/** Nombre dentro de una frase en español: en minuscula, como manda la RAE. */
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
 * Separar origen y destino evita la duda de "hacia donde traduce".
 */
export function LanguageRoute({
  source,
  onSourceChange,
  target,
  onTargetChange,
  onSwap,
}: LanguageRouteProps) {
  return (
    <div className="glass print-hidden rounded-2xl border border-line p-3 shadow-panel sm:p-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
        <div className="flex min-w-0 flex-col gap-1.5">
          <span className="eyebrow">
            Mi texto está en
          </span>
          <Segmented
            ariaLabel="Idioma en el que escribo"
            value={source}
            options={LANGS}
            onChange={onSourceChange}
          />
        </div>

        <button
          type="button"
          onClick={onSwap}
          aria-label="Intercambiar los idiomas"
          title="Intercambiar"
          className="mx-auto grid size-9 shrink-0 place-items-center rounded-xl border border-line bg-surface-soft text-muted transition-colors hover:border-accent hover:text-accent sm:mx-0 sm:mb-0.5"
        >
          <ArrowLeftRight aria-hidden className="size-4" />
        </button>

        <div className="flex min-w-0 flex-col gap-1.5">
          <span className="eyebrow">
            Traducir a
          </span>
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

      <p className="mt-3 border-t border-line pt-2.5 text-xs leading-relaxed text-muted">
        El botón <strong className="font-medium text-ink-soft">Traducir</strong> pasa tu texto
        de {EN_FRASE[source]} a {EN_FRASE[target]}. Corregir, Mejorar y Generar correo no
        cambian el idioma: responden en {EN_FRASE[source]}.
      </p>
    </div>
  );
}
