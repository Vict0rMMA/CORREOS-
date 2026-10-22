"use client";

import {
  Cloud,
  FilePlus2,
  FolderOpen,
  Languages,
  Moon,
  PenLine,
  PlaneTakeoff,
  Search,
  Smartphone,
  Table2,
  Trash2,
  Warehouse,
  X,
} from "lucide-react";
import { useMemo, useState } from "react";
import { Button } from "@/components/ui/Button";
import type { PlanillaResumen } from "@/lib/nube";
import { PLANTILLAS, filasEscritas } from "@/lib/plantillas";
import type { PlanillaArchivada } from "@/lib/storage";
import { cn } from "@/lib/utils";
import type { SheetTemplateId } from "@/types";

/**
 * La pestana Guardadas: todas las planillas hechas, para volver a abrir una y
 * modificarla.
 *
 * Cada una dice de que plantilla es (terminal, hangar, noches...), de que dia
 * y turno, quien es el crew chief, cuando se empezo y cuando se toco por
 * ultima vez, y si esta en la nube o solo en este equipo. Las de este equipo
 * y las de la nube se juntan en una sola lista.
 */

export interface FichaPlanilla {
  id: string;
  plantilla: SheetTemplateId;
  fecha: string;
  turno: string;
  crewChief: string;
  /** null si solo se conoce el resumen de la nube y no trae la hora. */
  creadaEn: number | null;
  actualizadaEn: number;
  traducida: boolean;
  /** Filas escritas; null si la planilla entera no esta en este equipo. */
  filas: number | null;
  /** Lo primero que se escribio, para reconocerla de un vistazo. */
  vistaPrevia: string;
  /** Todo lo escrito, para el buscador. */
  texto: string;
  donde: "equipo" | "nube" | "ambos";
}

/** Junta lo de este navegador con lo de la nube, sin repetir ninguna. */
export function armarFichas(
  archivo: PlanillaArchivada[],
  nube: PlanillaResumen[] | null,
): FichaPlanilla[] {
  const fichas = new Map<string, FichaPlanilla>();

  for (const guardada of archivo) {
    const escritas = filasEscritas(guardada.entrada);
    fichas.set(guardada.id, {
      id: guardada.id,
      plantilla: guardada.entrada.template,
      fecha: guardada.entrada.meta.date,
      turno: guardada.entrada.meta.shift,
      crewChief: guardada.entrada.meta.supervisor,
      creadaEn: guardada.creadaEn,
      actualizadaEn: guardada.actualizadaEn,
      traducida: guardada.salida !== null,
      filas: escritas.length,
      vistaPrevia: escritas
        .slice(0, 3)
        .map((fila) =>
          fila
            .map((celda) => celda.trim())
            .filter(Boolean)
            .slice(0, 2)
            .join(" "),
        )
        .join(" · "),
      texto: escritas.map((fila) => fila.join(" ")).join(" "),
      donde: "equipo",
    });
  }

  for (const resumen of nube ?? []) {
    const actualizadaEn = new Date(resumen.actualizadaEn).getTime();
    const creadaEn = resumen.creadaEn ? new Date(resumen.creadaEn).getTime() : null;
    const local = fichas.get(resumen.id);
    if (local) {
      fichas.set(resumen.id, {
        ...local,
        donde: "ambos",
        creadaEn: Math.min(local.creadaEn ?? Infinity, creadaEn ?? Infinity),
        actualizadaEn: Math.max(local.actualizadaEn, actualizadaEn),
        traducida: local.traducida || resumen.traducida,
      });
      continue;
    }
    fichas.set(resumen.id, {
      id: resumen.id,
      plantilla: resumen.plantilla,
      fecha: resumen.fecha,
      turno: resumen.turno,
      crewChief: resumen.crewChief ?? "",
      creadaEn,
      actualizadaEn,
      traducida: resumen.traducida,
      filas: null,
      vistaPrevia: "",
      texto: "",
      donde: "nube",
    });
  }

  return [...fichas.values()].sort((a, b) => b.actualizadaEn - a.actualizadaEn);
}

const ICONOS: Record<SheetTemplateId, typeof Table2> = {
  terminal: PlaneTakeoff,
  hangar: Warehouse,
  nights: Moon,
  custom: Table2,
};

function nombrePlantilla(id: SheetTemplateId): string {
  return PLANTILLAS.find((plantilla) => plantilla.id === id)?.label ?? "Planilla";
}

/** Texto sin tildes ni mayusculas, para buscar sin preocuparse de escribirlas. */
function simple(valor: string): string {
  return valor
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();
}

function mismoDia(a: Date, b: Date): boolean {
  return a.toDateString() === b.toDateString();
}

/** "Hoy", "Ayer" o "martes 19 de octubre": el titulo de cada grupo. */
function nombreDelDia(ms: number): string {
  const dia = new Date(ms);
  const hoy = new Date();
  const ayer = new Date();
  ayer.setDate(hoy.getDate() - 1);
  if (mismoDia(dia, hoy)) return "Hoy";
  if (mismoDia(dia, ayer)) return "Ayer";
  const texto = dia.toLocaleDateString("es-CO", {
    weekday: "long",
    day: "numeric",
    month: "long",
    ...(dia.getFullYear() !== hoy.getFullYear() ? { year: "numeric" } : {}),
  });
  return texto.charAt(0).toUpperCase() + texto.slice(1);
}

/** "hoy, 9:32 a. m.", "ayer, 7:05 p. m." o "19 oct, 9:32 a. m.". */
function cuando(ms: number): string {
  const momento = new Date(ms);
  const hora = momento.toLocaleTimeString("es-CO", { hour: "numeric", minute: "2-digit" });
  const hoy = new Date();
  const ayer = new Date();
  ayer.setDate(hoy.getDate() - 1);
  if (mismoDia(momento, hoy)) return `hoy, ${hora}`;
  if (mismoDia(momento, ayer)) return `ayer, ${hora}`;
  const dia = momento.toLocaleDateString("es-CO", {
    day: "numeric",
    month: "short",
    ...(momento.getFullYear() !== hoy.getFullYear() ? { year: "numeric" } : {}),
  });
  return `${dia}, ${hora}`;
}

/** Cuantas se ensenan antes de pulsar "Ver mas". */
const PAGINA = 12;

interface PlanillasGuardadasProps {
  fichas: FichaPlanilla[];
  /** La que esta abierta ahora en la pestana Planillas. */
  actual: string;
  /** La que se esta abriendo, para el boton que gira. */
  abriendo: string | null;
  hayNube: boolean;
  onAbrir: (id: string) => void;
  onBorrar: (id: string) => void;
  onNueva: () => void;
}

export function PlanillasGuardadas({
  fichas,
  actual,
  abriendo,
  hayNube,
  onAbrir,
  onBorrar,
  onNueva,
}: PlanillasGuardadasProps) {
  const [busqueda, setBusqueda] = useState("");
  const [filtro, setFiltro] = useState<SheetTemplateId | "todas">("todas");
  const [visibles, setVisibles] = useState(PAGINA);

  /** Solo se ofrecen los filtros de las plantillas que hay guardadas. */
  const plantillas = useMemo(
    () => PLANTILLAS.filter((plantilla) => fichas.some((ficha) => ficha.plantilla === plantilla.id)),
    [fichas],
  );

  const filtradas = useMemo(() => {
    const aguja = simple(busqueda.trim());
    return fichas.filter((ficha) => {
      if (filtro !== "todas" && ficha.plantilla !== filtro) return false;
      if (!aguja) return true;
      return simple(
        [
          nombrePlantilla(ficha.plantilla),
          ficha.fecha,
          ficha.turno,
          ficha.crewChief,
          ficha.texto,
          nombreDelDia(ficha.actualizadaEn),
        ].join(" "),
      ).includes(aguja);
    });
  }, [busqueda, fichas, filtro]);

  /** Agrupadas por el dia en que se tocaron por ultima vez. */
  const grupos = useMemo(() => {
    const lista: { dia: string; fichas: FichaPlanilla[] }[] = [];
    for (const ficha of filtradas.slice(0, visibles)) {
      const dia = nombreDelDia(ficha.actualizadaEn);
      const ultimo = lista[lista.length - 1];
      if (ultimo?.dia === dia) ultimo.fichas.push(ficha);
      else lista.push({ dia, fichas: [ficha] });
    }
    return lista;
  }, [filtradas, visibles]);

  return (
    <section aria-labelledby="titulo-guardadas" className="flex flex-col gap-3 sm:gap-4">
      <div className="glass flex flex-col gap-3 rounded-2xl border border-line p-3 shadow-panel sm:p-4">
        <div className="flex flex-wrap items-start gap-3">
          <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-accent text-accent-ink shadow-[0_6px_18px_-8px_var(--accent-glow)]">
            <FolderOpen aria-hidden className="size-5" />
          </span>
          <div className="min-w-0 flex-1">
            <h2
              id="titulo-guardadas"
              className="text-[19px] font-semibold leading-tight text-ink sm:text-[21px]"
            >
              Planillas guardadas
              <span className="ml-2 align-middle rounded-full bg-surface-soft px-2 py-0.5 text-[12px] font-medium tabular-nums text-muted">
                {fichas.length}
              </span>
            </h2>
            <p className="mt-1 text-[13px] leading-snug text-ink-soft">
              Toca una para abrirla y modificarla. Se guardan solas mientras escribes.
            </p>
          </div>
          <Button
            variant="primary"
            onClick={onNueva}
            icon={<FilePlus2 aria-hidden className="size-4" />}
            className="w-full sm:w-auto"
          >
            Nueva planilla
          </Button>
        </div>

        {fichas.length > 0 ? (
          <>
            <div className="relative">
              <Search
                aria-hidden
                className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted"
              />
              <input
                type="search"
                value={busqueda}
                onChange={(evento) => {
                  setBusqueda(evento.target.value);
                  setVisibles(PAGINA);
                }}
                placeholder="Buscar por fecha, turno, nombre o avión…"
                aria-label="Buscar en las planillas guardadas"
                className="h-11 w-full rounded-xl border border-line bg-surface pl-9 pr-10 text-base text-ink outline-none transition-colors hover:border-line-strong placeholder:text-muted/70 sm:h-10 sm:text-sm"
              />
              {busqueda ? (
                <button
                  type="button"
                  onClick={() => setBusqueda("")}
                  aria-label="Limpiar la búsqueda"
                  className="absolute right-1 top-1/2 grid size-9 -translate-y-1/2 place-items-center rounded-lg text-muted transition-colors hover:text-ink"
                >
                  <X aria-hidden className="size-4" />
                </button>
              ) : null}
            </div>

            {plantillas.length > 1 ? (
              <div
                role="group"
                aria-label="Filtrar por plantilla"
                className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-0.5 [scrollbar-width:none]"
              >
                {[{ id: "todas" as const, label: "Todas" }, ...plantillas].map((opcion) => {
                  const elegida = filtro === opcion.id;
                  return (
                    <button
                      key={opcion.id}
                      type="button"
                      aria-pressed={elegida}
                      onClick={() => {
                        setFiltro(opcion.id);
                        setVisibles(PAGINA);
                      }}
                      className={cn(
                        "h-9 shrink-0 rounded-full border px-3.5 text-[13px] font-medium transition-colors",
                        elegida
                          ? "border-accent bg-accent text-accent-ink"
                          : "border-line bg-surface text-ink-soft hover:border-line-strong hover:text-ink",
                      )}
                    >
                      {opcion.label}
                    </button>
                  );
                })}
              </div>
            ) : null}

            <p className="flex items-center gap-1.5 text-[12px] text-muted">
              {hayNube ? (
                <>
                  <Cloud aria-hidden className="size-3.5" />
                  Se guardan en la nube: las ves desde cualquier equipo.
                </>
              ) : (
                <>
                  <Smartphone aria-hidden className="size-3.5" />
                  Se guardan en este equipo y en este navegador.
                </>
              )}
            </p>
          </>
        ) : null}
      </div>

      {fichas.length === 0 ? (
        <div className="glass flex flex-col items-center gap-2 rounded-2xl border border-dashed border-line px-4 py-10 text-center shadow-panel">
          <FolderOpen aria-hidden className="size-8 text-muted" />
          <p className="text-[15px] font-medium text-ink">Todavía no hay planillas guardadas</p>
          <p className="max-w-sm text-[13px] text-muted">
            Cuando escribas algo en una planilla aparece aquí sola, con su fecha y su hora.
          </p>
        </div>
      ) : filtradas.length === 0 ? (
        <p className="glass rounded-2xl border border-line px-4 py-6 text-center text-[13px] text-muted shadow-panel">
          Ninguna planilla coincide con esa búsqueda.
        </p>
      ) : (
        grupos.map((grupo) => (
          <div key={grupo.dia} className="flex flex-col gap-2">
            <h3 className="eyebrow px-1">{grupo.dia}</h3>
            <ul className="flex flex-col gap-2">
              {grupo.fichas.map((ficha) => (
                <Tarjeta
                  key={ficha.id}
                  ficha={ficha}
                  esLaActual={ficha.id === actual}
                  abriendo={abriendo === ficha.id}
                  onAbrir={() => onAbrir(ficha.id)}
                  onBorrar={() => onBorrar(ficha.id)}
                />
              ))}
            </ul>
          </div>
        ))
      )}

      {filtradas.length > visibles ? (
        <div className="text-center">
          <Button variant="quiet" onClick={() => setVisibles(visibles + PAGINA)}>
            Ver más ({filtradas.length - visibles})
          </Button>
        </div>
      ) : null}
    </section>
  );
}

function Tarjeta({
  ficha,
  esLaActual,
  abriendo,
  onAbrir,
  onBorrar,
}: {
  ficha: FichaPlanilla;
  esLaActual: boolean;
  abriendo: boolean;
  onAbrir: () => void;
  onBorrar: () => void;
}) {
  const Icono = ICONOS[ficha.plantilla] ?? Table2;
  const linea = [
    ficha.fecha ? `Planilla del ${ficha.fecha}` : "Sin fecha",
    ficha.turno ? `Turno ${ficha.turno}` : "",
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <li
      data-planilla={ficha.id}
      className={cn(
        "glass rounded-2xl border p-3 shadow-panel sm:p-4",
        esLaActual ? "border-accent/50" : "border-line",
      )}
    >
      <div className="flex items-start gap-3">
        <span
          className={cn(
            "grid size-10 shrink-0 place-items-center rounded-xl",
            esLaActual ? "bg-accent text-accent-ink" : "bg-accent-soft text-accent",
          )}
        >
          <Icono aria-hidden className="size-5" />
        </span>

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <h4 className="text-[16px] font-semibold leading-tight text-ink">
              {nombrePlantilla(ficha.plantilla)}
            </h4>
            {esLaActual ? (
              <span className="rounded-full bg-accent-soft px-2 py-0.5 text-[11px] font-semibold text-accent">
                Abierta ahora
              </span>
            ) : null}
          </div>
          <p className="mt-0.5 text-[14px] text-ink-soft">{linea}</p>
          {ficha.crewChief ? (
            <p className="text-[13px] text-muted">
              Crew chief: <span className="text-ink-soft">{ficha.crewChief}</span>
            </p>
          ) : null}
          {ficha.vistaPrevia ? (
            <p className="mt-1 line-clamp-1 break-all text-[13px] text-muted">
              {ficha.vistaPrevia}
            </p>
          ) : null}
        </div>

        <button
          type="button"
          onClick={onBorrar}
          aria-label="Borrar esta planilla"
          title="Borrar esta planilla"
          className="-mr-1 -mt-1 grid size-10 shrink-0 place-items-center rounded-lg text-muted transition-colors hover:bg-danger/10 hover:text-danger"
        >
          <Trash2 aria-hidden className="size-4" />
        </button>
      </div>

      <dl className="mt-3 grid grid-cols-2 gap-x-3 gap-y-1 border-t border-line pt-2.5 text-[12px]">
        <div className="min-w-0">
          <dt className="text-muted">Creada</dt>
          <dd className="truncate text-ink-soft">
            {ficha.creadaEn !== null ? cuando(ficha.creadaEn) : "—"}
          </dd>
        </div>
        <div className="min-w-0">
          <dt className="text-muted">Última modificación</dt>
          <dd className="truncate font-medium text-ink">
            <time dateTime={new Date(ficha.actualizadaEn).toISOString()}>
              {cuando(ficha.actualizadaEn)}
            </time>
          </dd>
        </div>
      </dl>

      <div className="mt-2.5 flex flex-wrap items-center gap-1.5 text-[11px] font-medium">
        {ficha.traducida ? (
          <span className="inline-flex items-center gap-1 rounded-full bg-accent-soft px-2 py-0.5 text-accent">
            <Languages aria-hidden className="size-3" />
            En inglés
          </span>
        ) : (
          <span className="rounded-full bg-surface-soft px-2 py-0.5 text-muted">Sin traducir</span>
        )}
        {ficha.filas !== null ? (
          <span className="rounded-full bg-surface-soft px-2 py-0.5 text-muted">
            {ficha.filas === 1 ? "1 fila escrita" : `${ficha.filas} filas escritas`}
          </span>
        ) : null}
        <span className="inline-flex items-center gap-1 rounded-full bg-surface-soft px-2 py-0.5 text-muted">
          {ficha.donde === "equipo" ? (
            <>
              <Smartphone aria-hidden className="size-3" />
              En este equipo
            </>
          ) : (
            <>
              <Cloud aria-hidden className="size-3" />
              En la nube
            </>
          )}
        </span>
      </div>

      <Button
        variant={esLaActual ? "secondary" : "primary"}
        onClick={onAbrir}
        loading={abriendo}
        icon={<PenLine aria-hidden className="size-4" />}
        className="mt-3 w-full sm:w-auto"
      >
        {esLaActual ? "Seguir editando" : "Abrir y modificar"}
      </Button>
    </li>
  );
}
