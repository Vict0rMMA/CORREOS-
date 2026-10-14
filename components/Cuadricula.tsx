"use client";

import {
  type ClipboardEvent,
  type KeyboardEvent,
  type PointerEvent,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import {
  borrarColumnas,
  borrarFilas,
  escribirCelda,
  escribirEncabezado,
  insertarColumna,
  insertarFila,
  limpiarRango,
  ordenar,
  pegarEn,
  rangoATexto,
  texto2D,
} from "@/lib/planilla";
import { cn } from "@/lib/utils";
import type { SheetSection } from "@/types";

/**
 * Cuadricula editable, como una hoja de calculo.
 *
 * Se escribe directamente en las celdas, se mueve uno con las flechas y el
 * tabulador, se copia y se pega un bloque entero desde Excel, y se anaden o
 * quitan filas y columnas. No hay ninguna libreria detras: es una tabla con
 * un tabindex movil (el patron "roving tabindex"), que es lo que esperan
 * tanto el teclado como un lector de pantalla.
 */

export interface Celda {
  fila: number;
  columna: number;
}

/** -1 en la fila significa la fila de encabezados. */
export const FILA_ENCABEZADO = -1;

export interface CuadriculaProps {
  seccion: SheetSection;
  onChange: (seccion: SheetSection) => void;
  /** Ancho de cada columna en pixeles. */
  anchos: number[];
  onAnchosChange: (anchos: number[]) => void;
  /** Celdas marcadas por la revision, como "0:3" (fila:columna). */
  avisos?: Set<string>;
  /** Solo lectura: se usa para ensenar el original mientras se traduce. */
  readOnly?: boolean;
  ariaLabel: string;
}

const ANCHO_POR_DEFECTO = 150;
const ANCHO_MINIMO = 56;

export function Cuadricula({
  seccion,
  onChange,
  anchos,
  onAnchosChange,
  avisos,
  readOnly = false,
  ariaLabel,
}: CuadriculaProps) {
  /** Celda con el foco. */
  const [activa, setActiva] = useState<Celda>({ fila: 0, columna: 0 });
  /** Esquina opuesta de la seleccion; igual a `activa` si es una sola celda. */
  const [extremo, setExtremo] = useState<Celda>({ fila: 0, columna: 0 });
  /** Celda que se esta escribiendo, con su texto a medias. */
  const [editando, setEditando] = useState<{ celda: Celda; valor: string } | null>(null);

  const contenedor = useRef<HTMLDivElement>(null);
  const entrada = useRef<HTMLInputElement>(null);
  const arrastrando = useRef(false);

  const alto = seccion.rows.length;
  const ancho = seccion.columns.length;

  const anchoDe = useCallback(
    (columna: number) => anchos[columna] ?? ANCHO_POR_DEFECTO,
    [anchos],
  );

  /** Lleva el foco del navegador a la celda activa. */
  const enfocar = useCallback((celda: Celda) => {
    const nodo = contenedor.current?.querySelector<HTMLElement>(
      `[data-celda="${celda.fila}:${celda.columna}"]`,
    );
    nodo?.focus({ preventScroll: false });
  }, []);

  const mover = useCallback(
    (celda: Celda, extender = false) => {
      const destino = {
        fila: Math.max(FILA_ENCABEZADO, Math.min(celda.fila, alto - 1)),
        columna: Math.max(0, Math.min(celda.columna, ancho - 1)),
      };
      setActiva(destino);
      if (!extender) setExtremo(destino);
      enfocar(destino);
    },
    [alto, ancho, enfocar],
  );

  // Si la planilla encoge (se borraron filas), la seleccion se recoloca.
  useEffect(() => {
    if (activa.fila >= alto || activa.columna >= ancho) {
      const destino = {
        fila: Math.min(activa.fila, alto - 1),
        columna: Math.min(activa.columna, ancho - 1),
      };
      setActiva(destino);
      setExtremo(destino);
    }
  }, [activa.columna, activa.fila, alto, ancho]);

  const valorDe = useCallback(
    (celda: Celda): string =>
      celda.fila === FILA_ENCABEZADO
        ? (seccion.columns[celda.columna] ?? "")
        : (seccion.rows[celda.fila]?.[celda.columna] ?? ""),
    [seccion],
  );

  /** Guarda lo que se estaba escribiendo. */
  const confirmar = useCallback(() => {
    if (!editando) return;
    const { celda, valor } = editando;
    setEditando(null);
    if (valor === valorDe(celda)) return;
    onChange(
      celda.fila === FILA_ENCABEZADO
        ? escribirEncabezado(seccion, celda.columna, valor)
        : escribirCelda(seccion, celda.fila, celda.columna, valor),
    );
  }, [editando, onChange, seccion, valorDe]);

  const empezarAEditar = useCallback(
    (celda: Celda, inicial?: string) => {
      if (readOnly) return;
      setEditando({ celda, valor: inicial ?? valorDe(celda) });
    },
    [readOnly, valorDe],
  );

  // El cursor se coloca al final al abrir el editor.
  useEffect(() => {
    if (!editando) return;
    const campo = entrada.current;
    if (!campo) return;
    campo.focus();
    campo.setSelectionRange(campo.value.length, campo.value.length);
  }, [editando]);

  const seleccion = ordenar({
    fila1: activa.fila,
    col1: activa.columna,
    fila2: extremo.fila,
    col2: extremo.columna,
  });

  const dentroDeSeleccion = (fila: number, columna: number) =>
    fila >= seleccion.fila1 &&
    fila <= seleccion.fila2 &&
    columna >= seleccion.col1 &&
    columna <= seleccion.col2;

  // --- teclado ---
  const alPulsarTecla = (evento: KeyboardEvent<HTMLDivElement>) => {
    if (editando) return;
    const mod = evento.ctrlKey || evento.metaKey;
    const { fila, columna } = activa;

    const saltar = (df: number, dc: number) => {
      evento.preventDefault();
      mover({ fila: fila + df, columna: columna + dc }, evento.shiftKey);
    };

    switch (evento.key) {
      case "ArrowUp":
        return saltar(-1, 0);
      case "ArrowDown":
        return saltar(1, 0);
      case "ArrowLeft":
        return saltar(0, -1);
      case "ArrowRight":
        return saltar(0, 1);
      case "Home":
        evento.preventDefault();
        return mover({ fila, columna: 0 }, evento.shiftKey);
      case "End":
        evento.preventDefault();
        return mover({ fila, columna: ancho - 1 }, evento.shiftKey);
      case "Tab": {
        evento.preventDefault();
        const siguiente = evento.shiftKey ? columna - 1 : columna + 1;
        if (siguiente < 0) return mover({ fila: fila - 1, columna: ancho - 1 });
        if (siguiente >= ancho) return mover({ fila: fila + 1, columna: 0 });
        return mover({ fila, columna: siguiente });
      }
      case "Enter":
        evento.preventDefault();
        return empezarAEditar(activa);
      case "F2":
        evento.preventDefault();
        return empezarAEditar(activa);
      case "Backspace":
      case "Delete": {
        if (readOnly) return;
        evento.preventDefault();
        if (fila === FILA_ENCABEZADO) {
          return onChange(escribirEncabezado(seccion, columna, ""));
        }
        return onChange(
          limpiarRango(seccion, {
            fila1: Math.max(0, seleccion.fila1),
            col1: seleccion.col1,
            fila2: seleccion.fila2,
            col2: seleccion.col2,
          }),
        );
      }
      default:
        break;
    }

    if (mod && evento.key.toLowerCase() === "c") {
      evento.preventDefault();
      const texto =
        seleccion.fila1 === FILA_ENCABEZADO
          ? seccion.columns.slice(seleccion.col1, seleccion.col2 + 1).join("\t")
          : rangoATexto(seccion, seleccion);
      void navigator.clipboard?.writeText(texto).catch(() => undefined);
      return;
    }

    // Escribir una letra entra en modo edicion y la sustituye, como en Excel.
    if (!mod && !evento.altKey && evento.key.length === 1) {
      evento.preventDefault();
      empezarAEditar(activa, evento.key);
    }
  };

  /** Pegar: el bloque entra desde la celda activa y la cuadricula crece. */
  const alPegar = (evento: ClipboardEvent<HTMLDivElement>) => {
    if (readOnly) return;
    const texto = evento.clipboardData.getData("text/plain");
    if (!texto) return;
    evento.preventDefault();

    const bloque = texto2D(texto);
    if (bloque.length === 0) return;

    if (activa.fila === FILA_ENCABEZADO) {
      // Pegado sobre los encabezados: la primera linea renombra columnas y el
      // resto baja a las filas.
      let siguiente = seccion;
      bloque[0].forEach((nombre, desplazamiento) => {
        const columna = activa.columna + desplazamiento;
        if (columna < siguiente.columns.length) {
          siguiente = escribirEncabezado(siguiente, columna, nombre);
        } else {
          siguiente = insertarColumna(siguiente, siguiente.columns.length, nombre);
        }
      });
      if (bloque.length > 1) {
        const resto = pegarEn(siguiente, 0, activa.columna, bloque.slice(1));
        siguiente = resto.seccion;
      }
      onChange(siguiente);
      return;
    }

    const { seccion: actualizada, hasta } = pegarEn(
      seccion,
      activa.fila,
      activa.columna,
      bloque,
    );
    onChange(actualizada);
    setExtremo({ fila: hasta.fila, columna: hasta.columna });
  };

  // --- raton ---
  const alBajarPuntero = (celda: Celda) => (evento: PointerEvent<HTMLElement>) => {
    if (evento.button !== 0) return;
    confirmar();
    arrastrando.current = true;
    setActiva(celda);
    if (!evento.shiftKey) setExtremo(celda);
  };

  const alEntrarPuntero = (celda: Celda) => () => {
    if (!arrastrando.current) return;
    // Encabezados y datos no se seleccionan a la vez.
    if (celda.fila === FILA_ENCABEZADO && activa.fila !== FILA_ENCABEZADO) return;
    if (celda.fila !== FILA_ENCABEZADO && activa.fila === FILA_ENCABEZADO) return;
    setExtremo(celda);
  };

  useEffect(() => {
    const soltar = () => {
      arrastrando.current = false;
    };
    window.addEventListener("pointerup", soltar);
    return () => window.removeEventListener("pointerup", soltar);
  }, []);

  // --- cambiar el ancho de una columna ---
  const tirandoDe = useRef<{ columna: number; inicioX: number; inicioAncho: number } | null>(
    null,
  );

  useEffect(() => {
    const mover_ = (evento: globalThis.PointerEvent) => {
      const tirando = tirandoDe.current;
      if (!tirando) return;
      const nuevos = [...anchos];
      nuevos[tirando.columna] = Math.max(
        ANCHO_MINIMO,
        tirando.inicioAncho + (evento.clientX - tirando.inicioX),
      );
      onAnchosChange(nuevos);
    };
    const soltar = () => {
      tirandoDe.current = null;
    };
    window.addEventListener("pointermove", mover_);
    window.addEventListener("pointerup", soltar);
    return () => {
      window.removeEventListener("pointermove", mover_);
      window.removeEventListener("pointerup", soltar);
    };
  }, [anchos, onAnchosChange]);

  // --- acciones de la barra ---
  const filaActual = Math.max(0, seleccion.fila1);

  const acciones = {
    anadirFila: () => onChange(insertarFila(seccion, seleccion.fila2 + 1)),
    borrarFila: () => onChange(borrarFilas(seccion, filaActual, seleccion.fila2)),
    anadirColumna: () => onChange(insertarColumna(seccion, seleccion.col2 + 1)),
    borrarColumna: () => onChange(borrarColumnas(seccion, seleccion.col1, seleccion.col2)),
  };

  const filasMarcadas = seleccion.fila2 - filaActual + 1;
  const columnasMarcadas = seleccion.col2 - seleccion.col1 + 1;

  return (
    <div className="flex flex-col gap-2">
      {readOnly ? null : (
        <div className="flex flex-wrap items-center gap-1.5">
          <BotonBarra onClick={acciones.anadirFila}>+ Fila</BotonBarra>
          <BotonBarra onClick={acciones.borrarFila}>
            − Fila{filasMarcadas > 1 ? `s (${filasMarcadas})` : ""}
          </BotonBarra>
          <span aria-hidden className="mx-1 h-4 w-px bg-line" />
          <BotonBarra onClick={acciones.anadirColumna}>+ Columna</BotonBarra>
          <BotonBarra onClick={acciones.borrarColumna}>
            − Columna{columnasMarcadas > 1 ? `s (${columnasMarcadas})` : ""}
          </BotonBarra>
          <p className="ml-auto hidden text-[11px] text-muted sm:block">
            Doble clic o Enter para escribir · Ctrl + V pega desde Excel
          </p>
        </div>
      )}

      <div
        ref={contenedor}
        role="grid"
        aria-label={ariaLabel}
        aria-rowcount={alto + 1}
        aria-colcount={ancho}
        onKeyDown={alPulsarTecla}
        onPaste={alPegar}
        className="scroll-slim max-h-[58vh] overflow-auto rounded-xl border border-line bg-surface"
      >
        <table
          className="border-collapse text-[13px]"
          style={{ tableLayout: "fixed", width: "max-content", minWidth: "100%" }}
        >
          <colgroup>
            <col style={{ width: 42 }} />
            {seccion.columns.map((_, columna) => (
              <col key={columna} style={{ width: anchoDe(columna) }} />
            ))}
          </colgroup>

          <thead>
            <tr role="row">
              <th
                scope="col"
                className="sticky left-0 top-0 z-30 border border-line bg-surface-soft p-0"
              >
                <span className="sr-only">Fila</span>
              </th>
              {seccion.columns.map((nombre, columna) => {
                const celda = { fila: FILA_ENCABEZADO, columna };
                const marcada = dentroDeSeleccion(FILA_ENCABEZADO, columna);
                const enFoco = activa.fila === FILA_ENCABEZADO && activa.columna === columna;
                const editandoEsta =
                  editando?.celda.fila === FILA_ENCABEZADO &&
                  editando.celda.columna === columna;

                return (
                  <th
                    key={columna}
                    scope="col"
                    role="columnheader"
                    aria-selected={marcada}
                    tabIndex={enFoco ? 0 : -1}
                    data-celda={`${FILA_ENCABEZADO}:${columna}`}
                    onPointerDown={alBajarPuntero(celda)}
                    onPointerEnter={alEntrarPuntero(celda)}
                    onDoubleClick={() => empezarAEditar(celda)}
                    className={cn(
                      "sticky top-0 z-20 border border-[#2b4572] bg-[#1f3864] p-0 text-left align-middle outline-none",
                      marcada && "bg-[#2a4a84]",
                      enFoco && "ring-2 ring-inset ring-white/70",
                    )}
                  >
                    {editandoEsta ? (
                      <Editor
                        valor={editando.valor}
                        onValor={(valor) => setEditando({ celda, valor })}
                        onFin={confirmar}
                        onCancelar={() => setEditando(null)}
                        onMover={(df, dc) => {
                          confirmar();
                          mover({ fila: FILA_ENCABEZADO + df, columna: columna + dc });
                        }}
                        campoRef={entrada}
                        claro
                      />
                    ) : (
                      <span className="block truncate px-2 py-2 text-[11px] font-semibold uppercase tracking-[0.06em] text-white">
                        {nombre || " "}
                      </span>
                    )}

                    {readOnly ? null : (
                      <span
                        role="separator"
                        aria-label={`Ancho de ${nombre || `columna ${columna + 1}`}`}
                        onPointerDown={(evento) => {
                          evento.stopPropagation();
                          tirandoDe.current = {
                            columna,
                            inicioX: evento.clientX,
                            inicioAncho: anchoDe(columna),
                          };
                        }}
                        className="absolute right-0 top-0 h-full w-1.5 cursor-col-resize touch-none bg-transparent hover:bg-white/40"
                      />
                    )}
                  </th>
                );
              })}
            </tr>
          </thead>

          <tbody>
            {seccion.rows.map((fila, indiceFila) => (
              <tr key={indiceFila} role="row">
                <th
                  scope="row"
                  className="sticky left-0 z-10 border border-line bg-surface-soft px-1 text-center text-[11px] font-normal tabular-nums text-muted"
                >
                  {indiceFila + 1}
                </th>
                {seccion.columns.map((_, columna) => {
                  const celda = { fila: indiceFila, columna };
                  const marcada = dentroDeSeleccion(indiceFila, columna);
                  const enFoco = activa.fila === indiceFila && activa.columna === columna;
                  const editandoEsta =
                    editando?.celda.fila === indiceFila &&
                    editando.celda.columna === columna;
                  const conAviso = avisos?.has(`${indiceFila}:${columna}`);

                  return (
                    <td
                      key={columna}
                      role="gridcell"
                      aria-selected={marcada}
                      tabIndex={enFoco ? 0 : -1}
                      data-celda={`${indiceFila}:${columna}`}
                      onPointerDown={alBajarPuntero(celda)}
                      onPointerEnter={alEntrarPuntero(celda)}
                      onDoubleClick={() => empezarAEditar(celda)}
                      className={cn(
                        "border border-line p-0 align-middle outline-none",
                        indiceFila % 2 === 1 && "bg-surface-soft/60",
                        marcada && "bg-accent-soft",
                        conAviso && "bg-danger/15 ring-1 ring-inset ring-danger/60",
                        enFoco && "ring-2 ring-inset ring-accent",
                      )}
                    >
                      {editandoEsta ? (
                        <Editor
                          valor={editando.valor}
                          onValor={(valor) => setEditando({ celda, valor })}
                          onFin={confirmar}
                          onCancelar={() => setEditando(null)}
                          onMover={(df, dc) => {
                            confirmar();
                            mover({ fila: indiceFila + df, columna: columna + dc });
                          }}
                          campoRef={entrada}
                        />
                      ) : (
                        <span className="block truncate px-2 py-1.5 text-ink">
                          {fila[columna] || " "}
                        </span>
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/** El campo que aparece dentro de la celda mientras se escribe. */
function Editor({
  valor,
  onValor,
  onFin,
  onCancelar,
  onMover,
  campoRef,
  claro = false,
}: {
  valor: string;
  onValor: (valor: string) => void;
  onFin: () => void;
  onCancelar: () => void;
  onMover: (df: number, dc: number) => void;
  campoRef: React.RefObject<HTMLInputElement | null>;
  claro?: boolean;
}) {
  return (
    <input
      ref={campoRef}
      value={valor}
      onChange={(evento) => onValor(evento.target.value)}
      onBlur={onFin}
      onKeyDown={(evento) => {
        evento.stopPropagation();
        if (evento.key === "Escape") {
          evento.preventDefault();
          onCancelar();
          return;
        }
        if (evento.key === "Enter") {
          evento.preventDefault();
          onMover(1, 0);
          return;
        }
        if (evento.key === "Tab") {
          evento.preventDefault();
          onMover(0, evento.shiftKey ? -1 : 1);
        }
      }}
      className={cn(
        "w-full bg-transparent px-2 py-1.5 text-[13px] outline-none",
        claro
          ? "font-semibold uppercase tracking-[0.06em] text-white placeholder:text-white/50"
          : "text-ink",
      )}
    />
  );
}

function BotonBarra({
  children,
  onClick,
}: {
  children: React.ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="rounded-lg border border-line bg-surface-soft px-2.5 py-1.5 text-[12px] font-medium text-ink-soft transition-colors hover:border-accent/40 hover:text-accent"
    >
      {children}
    </button>
  );
}
