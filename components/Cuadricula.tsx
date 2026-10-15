"use client";

import {
  type ClipboardEvent,
  type KeyboardEvent,
  type MouseEvent,
  type PointerEvent,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";
import { ClipboardPaste, Copy, PencilLine, Table2 } from "lucide-react";
import { readClipboard, writeClipboardTable } from "@/lib/clipboard";
import {
  bloqueAHtml,
  borrarColumnas,
  borrarFilas,
  escribirCelda,
  escribirEncabezado,
  insertarColumna,
  insertarFila,
  interpretarPegado,
  limpiarRango,
  ordenar,
  pegarEn,
  rangoATexto,
  seccionParaCopiar,
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
  /**
   * Celda a la que saltar desde fuera (al tocar un aviso).
   * `sello` cambia en cada peticion, para poder volver a la misma celda.
   */
  foco?: { fila: number; columna: number; sello: number } | null;
  /**
   * Pegar aunque no se haya tocado ninguna casilla: lo pegado entra en esta
   * cuadricula. Solo una por pantalla puede tenerlo.
   */
  pegadoGlobal?: boolean;
  /** Para avisar de lo que paso al copiar o pegar. */
  onMensaje?: (texto: string, tipo?: "success" | "info" | "error") => void;
  ariaLabel: string;
}

const ANCHO_POR_DEFECTO = 150;
const ANCHO_MINIMO = 56;
/** Ancho de la columna de numeros de fila; la primera columna se pega detras. */
const COLUMNA_NUMEROS = 42;

/**
 * El fondo de una celda, elegido una sola vez.
 *
 * Si se apilan varias clases de color, cual gana depende del orden en que
 * Tailwind las escriba, no del orden en que se pongan aqui. Eligiendo una se
 * acaba la duda, y ademas la primera columna necesita un fondo opaco porque
 * queda fija mientras el resto se desplaza por debajo.
 */
function fondoDeCelda(opciones: {
  marcada: boolean;
  conAviso: boolean;
  alterna: boolean;
  fija: boolean;
}): string {
  if (opciones.conAviso) return "bg-danger/15";
  if (opciones.marcada) return "bg-accent-soft";
  if (opciones.alterna) return opciones.fija ? "bg-surface-soft" : "bg-surface-soft/60";
  return opciones.fija ? "bg-surface" : "";
}

export function Cuadricula({
  seccion,
  onChange,
  anchos,
  onAnchosChange,
  avisos,
  readOnly = false,
  foco = null,
  pegadoGlobal = false,
  onMensaje,
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

  // Salto desde un aviso: se selecciona la celda y se trae a la vista.
  useEffect(() => {
    if (!foco) return;
    const destino = { fila: foco.fila, columna: foco.columna };
    setActiva(destino);
    setExtremo(destino);
    const nodo = contenedor.current?.querySelector<HTMLElement>(
      `[data-celda="${destino.fila}:${destino.columna}"]`,
    );
    nodo?.scrollIntoView({ block: "center", inline: "center", behavior: "smooth" });
    nodo?.focus({ preventScroll: true });
  }, [foco]);

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
      void copiarSeleccion();
      return;
    }

    // Ctrl + A marca toda la tabla, para copiarla de una vez.
    if (mod && evento.key.toLowerCase() === "a") {
      evento.preventDefault();
      setActiva({ fila: 0, columna: 0 });
      setExtremo({ fila: alto - 1, columna: ancho - 1 });
      return;
    }

    // Escribir una letra entra en modo edicion y la sustituye, como en Excel.
    if (!mod && !evento.altKey && evento.key.length === 1) {
      evento.preventDefault();
      empezarAEditar(activa, evento.key);
    }
  };

  /**
   * Pega un texto desde la celda activa; la cuadricula crece si hace falta.
   * Lo usan Ctrl + V, el boton Pegar y el pegado sin casilla elegida.
   */
  const pegarTexto = useCallback(
    (texto: string) => {
      if (readOnly || !texto) return;
      const bloque = interpretarPegado(texto, seccion.columns);
      if (bloque.length === 0) return;

      if (activa.fila === FILA_ENCABEZADO) {
        // Pegado sobre los encabezados: la primera linea renombra columnas y
        // el resto baja a las filas.
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
          siguiente = pegarEn(siguiente, 0, activa.columna, bloque.slice(1)).seccion;
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
      onMensaje?.(
        bloque.length === 1
          ? "Pegado"
          : `Pegadas ${bloque.length} filas`,
        "success",
      );
    },
    [activa, onChange, onMensaje, readOnly, seccion],
  );

  const alPegar = (evento: ClipboardEvent<HTMLDivElement>) => {
    if (readOnly) return;
    const texto = evento.clipboardData.getData("text/plain");
    if (!texto) return;

    if (editando) {
      // Una palabra suelta se pega dentro de la casilla que se esta
      // escribiendo. Pero un bloque copiado de Excel (con tabuladores o con
      // varias lineas) se reparte por la tabla: si no, la tabla entera caia
      // dentro de una sola casilla.
      const esBloque = /[\t\n]/.test(texto.replace(/\r?\n+$/, ""));
      if (!esBloque) return;
      evento.preventDefault();
      setEditando(null);
      pegarTexto(texto);
      enfocar(activa);
      return;
    }

    evento.preventDefault();
    pegarTexto(texto);
  };

  // Pegar sin haber tocado ninguna casilla: entra donde esta la seleccion
  // (al principio, la primera casilla). Si el foco esta en un campo de texto
  // o en otra cuadricula, el pegado es suyo y aqui no se toca.
  useEffect(() => {
    if (!pegadoGlobal || readOnly) return;
    const alPegarFuera = (evento: globalThis.ClipboardEvent) => {
      const destino = evento.target as HTMLElement | null;
      if (destino?.closest?.("input, textarea, select, [contenteditable='true'], [role='grid']")) {
        return;
      }
      const texto = evento.clipboardData?.getData("text/plain");
      if (!texto) return;
      evento.preventDefault();
      pegarTexto(texto);
    };
    document.addEventListener("paste", alPegarFuera);
    return () => document.removeEventListener("paste", alPegarFuera);
  }, [pegadoGlobal, pegarTexto, readOnly]);

  /** Boton Pegar: lee el portapapeles, si el navegador lo deja. */
  const pegarDesdeBoton = async () => {
    const texto = await readClipboard();
    if (texto === null) {
      onMensaje?.("Tu navegador no deja pegar con el botón: usa Ctrl + V", "info");
      return;
    }
    if (!texto.trim()) {
      onMensaje?.("No hay nada copiado", "info");
      return;
    }
    pegarTexto(texto);
  };

  /** Copia lo marcado: se pega en Excel como celdas y en un correo como tabla. */
  const copiarSeleccion = async () => {
    const texto =
      seleccion.fila1 === FILA_ENCABEZADO
        ? seccion.columns.slice(seleccion.col1, seleccion.col2 + 1).join("\t")
        : rangoATexto(seccion, seleccion);
    const filas = texto.split("\n").map((linea) => linea.split("\t"));
    const ok = await writeClipboardTable(texto, bloqueAHtml(null, filas));
    const celdas = (seleccion.fila2 - Math.max(0, seleccion.fila1) + 1) *
      (seleccion.col2 - seleccion.col1 + 1);
    onMensaje?.(
      ok ? (celdas === 1 ? "Copiado" : `Copiadas ${celdas} casillas`) : "No se pudo copiar",
      ok ? "success" : "error",
    );
  };

  /** Copia la tabla entera con sus encabezados. */
  const copiarTabla = async () => {
    const { texto, html } = seccionParaCopiar(seccion);
    const ok = await writeClipboardTable(texto, html);
    onMensaje?.(
      ok ? "Tabla copiada: pégala en Excel o en el correo" : "No se pudo copiar",
      ok ? "success" : "error",
    );
  };

  // --- raton y dedo ---
  /** Si la casilla tocada ya era la activa, y con que se toco. */
  const toque = useRef<{ yaActiva: boolean; tipo: string }>({ yaActiva: false, tipo: "mouse" });

  const alBajarPuntero = (celda: Celda) => (evento: PointerEvent<HTMLElement>) => {
    if (evento.button !== 0) return;
    toque.current = {
      yaActiva: activa.fila === celda.fila && activa.columna === celda.columna,
      tipo: evento.pointerType,
    };
    confirmar();
    arrastrando.current = true;
    setActiva(celda);
    if (!evento.shiftKey) setExtremo(celda);
  };

  /**
   * Un toque basta para escribir: con el dedo siempre, y con el raton al
   * volver a pulsar la casilla que ya estaba elegida. El doble clic sigue
   * valiendo, pero quien no lo conoce no se queda atascado.
   */
  const alPulsar = (celda: Celda) => (evento: MouseEvent<HTMLElement>) => {
    if (readOnly || evento.shiftKey || editando) return;
    if (toque.current.tipo === "touch" || toque.current.yaActiva) empezarAEditar(celda);
  };

  // --- clic derecho: Copiar, Cortar y Pegar del menu del navegador ---
  // El menu del navegador solo ofrece Pegar si debajo del raton hay algo
  // donde se pueda escribir, y Copiar si hay texto seleccionado. Una casilla
  // no es ninguna de las dos cosas, asi que "Pegar" salia en gris. Al hacer
  // clic derecho se pone debajo del raton un campo invisible con lo marcado
  // ya seleccionado dentro: el menu ve un campo y habilita las tres opciones,
  // y aqui se recoge lo que la persona elija. (Es lo que hacen los editores de
  // codigo del navegador.)
  const captura = useRef<HTMLTextAreaElement>(null);
  /**
   * El campo va directamente en <body>: el panel de la planilla tiene efecto
   * de cristal (backdrop-filter), y dentro de el un elemento "fixed" se
   * coloca respecto al panel y no a la pantalla, lejos del raton.
   */
  const [montado, setMontado] = useState(false);
  useEffect(() => setMontado(true), []);

  /** Lo marcado ahora, como texto y como tabla para el correo. */
  const textoDeSeleccion = () =>
    seleccion.fila1 === FILA_ENCABEZADO
      ? seccion.columns.slice(seleccion.col1, seleccion.col2 + 1).join("\t")
      : rangoATexto(seccion, seleccion);

  const esconderCaptura = () => {
    const campo = captura.current;
    if (!campo) return;
    campo.style.left = "-9999px";
    campo.style.top = "-9999px";
  };

  const alMenuContextual = (celda: Celda) => (evento: MouseEvent<HTMLElement>) => {
    if (editando) return;
    // Como en Excel: el clic derecho fuera de lo marcado marca esa casilla.
    let texto: string;
    if (dentroDeSeleccion(celda.fila, celda.columna)) {
      texto = textoDeSeleccion();
    } else {
      setActiva(celda);
      setExtremo(celda);
      texto = valorDe(celda);
    }

    const campo = captura.current;
    if (!campo) return;
    campo.value = texto;
    campo.style.left = `${evento.clientX - 12}px`;
    campo.style.top = `${evento.clientY - 12}px`;
    campo.focus({ preventScroll: true });
    campo.select();
    // Sin preventDefault: el menu del navegador se abre sobre el campo.
  };

  const alCopiarCaptura = (evento: ClipboardEvent<HTMLTextAreaElement>) => {
    evento.preventDefault();
    const texto = textoDeSeleccion();
    evento.clipboardData.setData("text/plain", texto);
    evento.clipboardData.setData(
      "text/html",
      bloqueAHtml(null, texto.split("\n").map((linea) => linea.split("\t"))),
    );
    esconderCaptura();
    enfocar(activa);
  };

  const alCortarCaptura = (evento: ClipboardEvent<HTMLTextAreaElement>) => {
    alCopiarCaptura(evento);
    if (readOnly || seleccion.fila1 === FILA_ENCABEZADO) return;
    onChange(limpiarRango(seccion, seleccion));
  };

  const alPegarCaptura = (evento: ClipboardEvent<HTMLTextAreaElement>) => {
    evento.preventDefault();
    esconderCaptura();
    pegarTexto(evento.clipboardData.getData("text/plain"));
    enfocar(activa);
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

  // --- barra de escritura, encima de la tabla ---
  // Como la barra de formulas de Excel: muestra lo que hay en la casilla
  // elegida y deja escribirlo con espacio de sobra. En el celular es la forma
  // segura de que salga el teclado, y una nota larga se edita entera.
  const [barra, setBarra] = useState<{ celda: Celda; valor: string } | null>(null);
  const campoBarra = useRef<HTMLInputElement>(null);

  const guardarBarra = () => {
    if (!barra) return;
    const { celda, valor } = barra;
    setBarra(null);
    if (valor === valorDe(celda)) return;
    onChange(
      celda.fila === FILA_ENCABEZADO
        ? escribirEncabezado(seccion, celda.columna, valor)
        : escribirCelda(seccion, celda.fila, celda.columna, valor),
    );
  };

  const nombreColumna = seccion.columns[activa.columna] || `columna ${activa.columna + 1}`;
  const etiquetaBarra =
    activa.fila === FILA_ENCABEZADO
      ? `Título de la ${activa.columna + 1}.ª columna`
      : `Fila ${activa.fila + 1} · ${nombreColumna}`;
  const valorBarra =
    barra && barra.celda.fila === activa.fila && barra.celda.columna === activa.columna
      ? barra.valor
      : valorDe(activa);

  return (
    <div className="flex flex-col gap-2">
      {readOnly ? null : (
        <>
          <div className="flex flex-wrap items-center gap-1.5">
            <BotonBarra onClick={() => void copiarSeleccion()} titulo="Copiar lo marcado (Ctrl + C)">
              <Copy aria-hidden className="size-3.5" />
              Copiar
            </BotonBarra>
            <BotonBarra onClick={() => void pegarDesdeBoton()} titulo="Pegar en la casilla elegida (Ctrl + V)">
              <ClipboardPaste aria-hidden className="size-3.5" />
              Pegar
            </BotonBarra>
            <BotonBarra onClick={() => void copiarTabla()} titulo="Copiar toda la tabla, con sus títulos">
              <Table2 aria-hidden className="size-3.5" />
              Copiar tabla
            </BotonBarra>
            <span aria-hidden className="mx-1 h-4 w-px bg-line" />
            <BotonBarra onClick={acciones.anadirFila}>+ Fila</BotonBarra>
            <BotonBarra onClick={acciones.borrarFila}>
              − Fila{filasMarcadas > 1 ? `s (${filasMarcadas})` : ""}
            </BotonBarra>
            <BotonBarra onClick={acciones.anadirColumna}>+ Columna</BotonBarra>
            <BotonBarra onClick={acciones.borrarColumna}>
              − Columna{columnasMarcadas > 1 ? `s (${columnasMarcadas})` : ""}
            </BotonBarra>
          </div>

          <label className="flex min-w-0 items-center gap-2 rounded-xl border border-line bg-surface px-2 py-1.5 focus-within:border-accent">
            <PencilLine aria-hidden className="ml-1 size-4 shrink-0 text-muted" />
            <span className="shrink-0 rounded-md bg-surface-soft px-2 py-1 text-[11px] font-semibold text-ink-soft">
              {etiquetaBarra}
            </span>
            <input
              ref={campoBarra}
              aria-label={`Escribir en ${etiquetaBarra}`}
              value={valorBarra}
              placeholder="Toca una casilla y escribe aquí"
              onFocus={() => setBarra({ celda: activa, valor: valorDe(activa) })}
              onChange={(evento) =>
                setBarra({ celda: barra?.celda ?? activa, valor: evento.target.value })
              }
              onBlur={guardarBarra}
              onKeyDown={(evento) => {
                if (evento.key === "Enter") {
                  evento.preventDefault();
                  const celda = barra?.celda ?? activa;
                  guardarBarra();
                  mover({ fila: celda.fila + 1, columna: celda.columna });
                } else if (evento.key === "Escape") {
                  evento.preventDefault();
                  setBarra(null);
                  enfocar(activa);
                }
              }}
              className="h-9 min-w-0 flex-1 bg-transparent text-[14px] text-ink outline-none placeholder:text-muted/70"
            />
          </label>
        </>
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
        {/* El campo invisible del clic derecho (ver alMenuContextual). */}
        {montado ? createPortal(
        <textarea
          ref={captura}
          aria-hidden
          tabIndex={-1}
          readOnly={false}
          onCopy={alCopiarCaptura}
          onCut={alCortarCaptura}
          onPaste={(evento) => {
            evento.stopPropagation();
            alPegarCaptura(evento);
          }}
          onBlur={esconderCaptura}
          onKeyDown={(evento) => {
            // Con el menu cerrado, las teclas vuelven a la tabla.
            if (evento.ctrlKey || evento.metaKey) return;
            evento.preventDefault();
            esconderCaptura();
            enfocar(activa);
          }}
          className="fixed z-[60] size-6 resize-none overflow-hidden border-0 bg-transparent p-0 text-transparent opacity-0 outline-none"
          style={{ left: -9999, top: -9999 }}
        />,
        document.body,
        ) : null}
        <table
          className="border-collapse text-[13px]"
          style={{ tableLayout: "fixed", width: "max-content", minWidth: "100%" }}
        >
          <colgroup>
            <col style={{ width: COLUMNA_NUMEROS }} />
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
                    onClick={alPulsar(celda)}
                    onContextMenu={alMenuContextual(celda)}
                    onDoubleClick={() => empezarAEditar(celda)}
                    style={columna === 0 ? { left: COLUMNA_NUMEROS } : undefined}
                    className={cn(
                      "sticky top-0 border border-[#2b4572] p-0 text-left align-middle outline-none",
                      columna === 0 ? "z-30" : "z-20",
                      marcada ? "bg-[#2a4a84]" : "bg-[#1f3864]",
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
                      onClick={alPulsar(celda)}
                    onContextMenu={alMenuContextual(celda)}
                    onDoubleClick={() => empezarAEditar(celda)}
                      style={columna === 0 ? { left: COLUMNA_NUMEROS } : undefined}
                      className={cn(
                        "border border-line p-0 align-middle outline-none",
                        // Con quince o veinte columnas hay que desplazarse de
                        // lado: el empleado se queda a la vista.
                        columna === 0 && "sticky z-10 border-r-line-strong",
                        fondoDeCelda({
                          marcada,
                          conAviso: Boolean(conAviso),
                          alterna: indiceFila % 2 === 1,
                          fija: columna === 0,
                        }),
                        conAviso && "ring-1 ring-inset ring-danger/60",
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
  titulo,
}: {
  children: React.ReactNode;
  onClick: () => void;
  titulo?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={titulo}
      // Sin esto, pulsar el boton le quita el foco a la casilla y Copiar o
      // Pegar ya no sabrian donde estaba la seleccion en el celular.
      onPointerDown={(evento) => evento.preventDefault()}
      className="inline-flex min-h-9 items-center gap-1.5 rounded-lg border border-line bg-surface-soft px-2.5 py-1.5 text-[12px] font-medium text-ink-soft transition-colors hover:border-accent/40 hover:text-accent"
    >
      {children}
    </button>
  );
}
