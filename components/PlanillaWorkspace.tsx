"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  Check,
  Cloud,
  CloudOff,
  Clock,
  FileDown,
  FilePlus2,
  FileText,
  Languages,
  MoveRight,
  Plane,
  Printer,
  Redo2,
  Sheet as SheetIcon,
  Truck,
  Undo2,
  Users,
} from "lucide-react";
import { Cuadricula } from "@/components/Cuadricula";
import { MisPlanillas } from "@/components/MisPlanillas";
import { Button } from "@/components/ui/Button";
import { Select } from "@/components/ui/Select";
import { useToast } from "@/components/ui/Toast";
import { downloadDocx } from "@/lib/export/docx";
import { downloadPdf } from "@/lib/export/pdf";
import { downloadXlsx } from "@/lib/export/xlsx";
import {
  type Historial,
  cambiar,
  conSeccion,
  deshacer,
  estaVacia,
  iniciarHistorial,
  paraExportar,
  rehacer,
} from "@/lib/planilla";

import {
  type PlanillaResumen,
  abrirPlanilla,
  borrarPlanilla,
  guardarPlanilla,
  listarPlanillas,
  nuevoId,
} from "@/lib/nube";
import {
  type BloquePlantilla,
  PLANTILLAS,
  buscarPlantilla,
  crearPlanilla,
  esPlantillaIntacta,
  fechaDeHoy,
} from "@/lib/plantillas";
import type { Aviso } from "@/lib/tabla";
import { cn } from "@/lib/utils";
import type { SheetDoc, SheetSection, SheetTemplateId, SignatureDrawing } from "@/types";

/**
 * La pestana de Planillas: una hoja de calculo de verdad.
 *
 * Se trabaja en espanol en la cuadricula, y cuando esta lista se pulsa un
 * boton que la pasa al ingles. El resultado tambien se puede corregir a mano
 * antes de descargar el Excel, y si se vuelve a tocar la entrada el resultado
 * queda marcado como desactualizado.
 *
 * Se guarda sola en la nube (Supabase) unos segundos despues de cada cambio,
 * y si se vuelve el mismo dia se sigue donde se dejo. Sin nube configurada,
 * la planilla vive mientras la pagina este abierta, como antes.
 */

/** Espera desde el ultimo cambio hasta guardar. */
const ESPERA_GUARDADO = 1500;

type EstadoNube = "sin-nube" | "esperando" | "guardando" | "guardada" | "error";

const GENERIC_ERROR = "No pudimos traducir la planilla. Revisa tu conexión o la configuración de IA.";

type Vista = "es" | "en";

interface PlanillaWorkspaceProps {
  /** false cuando se esta viendo la pestana de correos. */
  activa: boolean;
  includeLogo: boolean;
  signature: string;
  signatureImage: SignatureDrawing | null;
  /** Avisa de la planilla traducida, para la hoja de impresion. */
  onPlanillaChange: (doc: SheetDoc | null) => void;
}

export function PlanillaWorkspace({
  activa,
  includeLogo,
  signature,
  signatureImage,
  onPlanillaChange,
}: PlanillaWorkspaceProps) {
  const { toast } = useToast();

  // La supervisora es siempre la misma y la fecha casi siempre es la de hoy:
  // vienen puestas para no tener que escribirlas cada turno.
  const [entrada, setEntrada] = useState<Historial<SheetDoc>>(() =>
    iniciarHistorial(
      crearPlanilla("terminal", {
        date: fechaDeHoy(),
        supervisor: signature.split("\n")[0]?.trim() ?? "",
      }),
    ),
  );
  const [salida, setSalida] = useState<Historial<SheetDoc> | null>(null);
  const [vista, setVista] = useState<Vista>("es");
  /** La entrada cambió después de traducir. */
  const [desactualizado, setDesactualizado] = useState(false);
  const [avisos, setAvisos] = useState<Aviso[]>([]);
  const [traduciendo, setTraduciendo] = useState(false);
  const [bajando, setBajando] = useState<"xlsx" | "docx" | "pdf" | null>(null);
  const [anchos, setAnchos] = useState<Record<string, number[]>>({});

  const abortar = useRef<AbortController | null>(null);

  // ----- la nube -----
  /** Identificador de la planilla abierta: con el se guarda y se reabre. */
  const [idPlanilla, setIdPlanilla] = useState<string>(() => nuevoId());
  /** Lo guardado en la nube; null si la nube no esta disponible. */
  const [misPlanillas, setMisPlanillas] = useState<PlanillaResumen[] | null>(null);
  const [estadoNube, setEstadoNube] = useState<EstadoNube>("sin-nube");
  const [guardadaEn, setGuardadaEn] = useState<string | null>(null);
  /**
   * false justo despues de abrir o crear una planilla: lo que se acaba de
   * cargar no hace falta volver a guardarlo.
   */
  const hayCambios = useRef(false);

  const refrescarLista = useCallback(async () => {
    const lista = await listarPlanillas();
    setMisPlanillas(lista);
    return lista;
  }, []);

  /** Carga una planilla guardada en la pantalla. */
  const cargar = useCallback((id: string, nuevaEntrada: SheetDoc, nuevaSalida: SheetDoc | null) => {
    hayCambios.current = false;
    setIdPlanilla(id);
    setEntrada(iniciarHistorial(nuevaEntrada));
    setSalida(nuevaSalida ? iniciarHistorial(nuevaSalida) : null);
    setVista("es");
    setAvisos([]);
    setDesactualizado(false);
    setAnchos({});
  }, []);

  // Al abrir: si hay una planilla de hoy a medias, se sigue con ella.
  useEffect(() => {
    let cancelado = false;
    void (async () => {
      const lista = await refrescarLista();
      if (cancelado || !lista) return;
      setEstadoNube("guardada");
      const ultima = lista[0];
      if (!ultima) return;
      const deHoy = new Date(ultima.actualizadaEn).toDateString() === new Date().toDateString();
      if (!deHoy) return;
      const guardada = await abrirPlanilla(ultima.id);
      if (cancelado || !guardada) return;
      cargar(guardada.id, guardada.entrada, guardada.salida);
      setGuardadaEn(guardada.actualizadaEn);
    })();
    return () => {
      cancelado = true;
    };
  }, [cargar, refrescarLista]);

  /**
   * Guarda ya lo que haya pendiente. Se llama antes de cambiar de planilla:
   * si no, lo escrito en el ultimo segundo se perdia al saltar a otra.
   */
  const guardarYa = useCallback(async (): Promise<boolean> => {
    if (misPlanillas === null || !hayCambios.current) return true;
    // Una plantilla recien abierta, sin nada escrito, no se guarda.
    if (!salida && esPlantillaIntacta(entrada.presente)) return true;

    setEstadoNube("guardando");
    const hora = await guardarPlanilla(idPlanilla, entrada.presente, salida?.presente ?? null);
    if (!hora) {
      setEstadoNube("error");
      return false;
    }
    hayCambios.current = false;
    setEstadoNube("guardada");
    setGuardadaEn(hora);
    void refrescarLista();
    return true;
  }, [entrada.presente, idPlanilla, misPlanillas, refrescarLista, salida]);

  // Se guarda sola, un momento despues del ultimo cambio.
  useEffect(() => {
    if (misPlanillas === null || !hayCambios.current) return;
    if (!salida && esPlantillaIntacta(entrada.presente)) return;

    setEstadoNube("esperando");
    const temporizador = window.setTimeout(() => void guardarYa(), ESPERA_GUARDADO);
    return () => window.clearTimeout(temporizador);
  }, [entrada.presente, guardarYa, misPlanillas, salida]);

  // Si se pierde la conexion y vuelve, se reintenta lo pendiente.
  useEffect(() => {
    const alVolver = () => {
      if (misPlanillas === null) void refrescarLista();
      void guardarYa();
    };
    window.addEventListener("online", alVolver);
    return () => window.removeEventListener("online", alVolver);
  }, [guardarYa, misPlanillas, refrescarLista]);

  // Si se cierra la pagina con algo sin guardar, se manda igual.
  useEffect(() => {
    const alSalir = () => {
      if (!hayCambios.current || misPlanillas === null) return;
      if (!salida && esPlantillaIntacta(entrada.presente)) return;
      void fetch(`/api/planillas/${idPlanilla}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ entrada: entrada.presente, salida: salida?.presente ?? null }),
        keepalive: true,
      }).catch(() => undefined);
    };
    window.addEventListener("pagehide", alSalir);
    return () => window.removeEventListener("pagehide", alSalir);
  }, [entrada.presente, idPlanilla, misPlanillas, salida]);

  /** Empieza una planilla nueva; la anterior queda guardada antes. */
  const nuevaPlanilla = useCallback(
    async (plantilla: SheetTemplateId = entrada.presente.template) => {
      await guardarYa();
      // La fecha, el turno y el supervisor son del dia: se quedan.
      cargar(nuevoId(), crearPlanilla(plantilla, entrada.presente.meta), null);
    },
    [cargar, entrada.presente, guardarYa],
  );

  const abrirGuardada = useCallback(
    async (id: string) => {
      await guardarYa();
      const guardada = await abrirPlanilla(id);
      if (!guardada) {
        toast("No pudimos abrir esa planilla", "error");
        return;
      }
      cargar(guardada.id, guardada.entrada, guardada.salida);
      setGuardadaEn(guardada.actualizadaEn);
      setEstadoNube("guardada");
      toast("Planilla abierta");
    },
    [cargar, guardarYa, toast],
  );

  const borrarGuardada = useCallback(
    async (id: string) => {
      const seguro = window.confirm("¿Borrar esta planilla de la lista?");
      if (!seguro) return;
      const ok = await borrarPlanilla(id);
      if (!ok) {
        toast("No pudimos borrarla", "error");
        return;
      }
      if (id === idPlanilla) nuevaPlanilla();
      await refrescarLista();
      toast("Planilla borrada");
    },
    [idPlanilla, nuevaPlanilla, refrescarLista, toast],
  );

  const doc = vista === "es" ? entrada.presente : (salida?.presente ?? entrada.presente);
  const historialActual = vista === "es" ? entrada : salida;

  /** Las dos vistas comparten los anchos: es la misma tabla en otro idioma. */
  const anchosDe = useCallback(
    (indice: number, seccion: SheetSection) =>
      anchos[`${indice}`] ?? seccion.columns.map(() => 150),
    [anchos],
  );

  const cambiarAnchos = useCallback((indice: number, nuevos: number[]) => {
    setAnchos((actuales) => ({ ...actuales, [`${indice}`]: nuevos }));
  }, []);

  // ----- editar -----
  const cambiarEntrada = useCallback((siguiente: SheetDoc) => {
    hayCambios.current = true;
    setEntrada((historial) => cambiar(historial, siguiente));
    setSalida((actual) => {
      if (actual) setDesactualizado(true);
      return actual;
    });
  }, []);

  const cambiarSalida = useCallback((siguiente: SheetDoc) => {
    hayCambios.current = true;
    setSalida((historial) => (historial ? cambiar(historial, siguiente) : historial));
    // Si la persona corrige el resultado, esa es la version que vale.
    setAvisos([]);
  }, []);

  const editarSeccion = useCallback(
    (indice: number, seccion: SheetSection) => {
      if (vista === "es") cambiarEntrada(conSeccion(entrada.presente, indice, seccion));
      else if (salida) cambiarSalida(conSeccion(salida.presente, indice, seccion));
    },
    [cambiarEntrada, cambiarSalida, entrada.presente, salida, vista],
  );

  const editarMeta = useCallback(
    (campo: "date" | "shift" | "supervisor", valor: string) => {
      if (vista === "es") {
        cambiarEntrada({ ...entrada.presente, meta: { ...entrada.presente.meta, [campo]: valor } });
      } else if (salida) {
        cambiarSalida({ ...salida.presente, meta: { ...salida.presente.meta, [campo]: valor } });
      }
    },
    [cambiarEntrada, cambiarSalida, entrada.presente, salida, vista],
  );

  const cambiarPlantilla = useCallback(
    (id: SheetTemplateId) => {
      // Con la nube, la planilla que habia queda guardada en "Mis planillas"
      // y no hace falta preguntar. Sin ella se perderia: ahi si se pregunta.
      // (La de noches trae la flota y la numeracion puestas: "vacia" es que
      // siga igual que recien creada, no que no tenga ni una celda escrita.)
      if (misPlanillas === null && !esPlantillaIntacta(entrada.presente)) {
        const seguro = window.confirm(
          "Vas a cambiar de plantilla y la planilla que tienes escrita se pierde. ¿Seguimos?",
        );
        if (!seguro) return;
      }
      void nuevaPlanilla(id);
    },
    [entrada.presente, misPlanillas, nuevaPlanilla],
  );

  // ----- deshacer y rehacer -----
  const puedeDeshacer = (historialActual?.pasado.length ?? 0) > 0;
  const puedeRehacer = (historialActual?.futuro.length ?? 0) > 0;

  const hacerDeshacer = useCallback(() => {
    hayCambios.current = true;
    if (vista === "es") setEntrada((historial) => deshacer(historial));
    else setSalida((historial) => (historial ? deshacer(historial) : historial));
  }, [vista]);

  const hacerRehacer = useCallback(() => {
    hayCambios.current = true;
    if (vista === "es") setEntrada((historial) => rehacer(historial));
    else setSalida((historial) => (historial ? rehacer(historial) : historial));
  }, [vista]);

  useEffect(() => {
    // Los atajos solo valen mientras se esta en esta pestana.
    if (!activa) return;
    const alPulsar = (evento: KeyboardEvent) => {
      const mod = evento.metaKey || evento.ctrlKey;
      if (!mod) return;
      const tecla = evento.key.toLowerCase();
      if (tecla === "z" && !evento.shiftKey) {
        evento.preventDefault();
        hacerDeshacer();
      } else if ((tecla === "z" && evento.shiftKey) || tecla === "y") {
        evento.preventDefault();
        hacerRehacer();
      }
    };
    window.addEventListener("keydown", alPulsar);
    return () => window.removeEventListener("keydown", alPulsar);
  }, [activa, hacerDeshacer, hacerRehacer]);

  // ----- traducir -----
  const traducir = useCallback(async () => {
    if (estaVacia(entrada.presente)) {
      toast("Escribe algo en la planilla primero", "info");
      return;
    }

    abortar.current?.abort();
    const control = new AbortController();
    abortar.current = control;

    setTraduciendo(true);
    setAvisos([]);
    try {
      const respuesta = await fetch("/api/planilla", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: control.signal,
        body: JSON.stringify({ doc: paraExportar(entrada.presente), target: "en" }),
      });

      const datos = (await respuesta.json()) as {
        doc?: SheetDoc;
        error?: string;
        avisos?: Aviso[];
        problems?: string[];
      };

      if (!respuesta.ok) {
        if (datos.avisos?.length) {
          setAvisos(datos.avisos);
          if (datos.doc) {
            hayCambios.current = true;
            setSalida(iniciarHistorial(datos.doc));
            setVista("en");
          }
          toast(`Hay ${datos.avisos.length} celda(s) que no coinciden`, "error");
          return;
        }
        throw new Error(datos.error ?? GENERIC_ERROR);
      }

      if (!datos.doc) throw new Error(GENERIC_ERROR);

      hayCambios.current = true;
            setSalida(iniciarHistorial(datos.doc));
      setDesactualizado(false);
      setVista("en");
      toast("Listo: revisa el resultado y descarga el Excel", "success");
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return;
      console.error("[paula] traduccion de planilla fallida:", error);
      toast(error instanceof Error && error.message ? error.message : GENERIC_ERROR, "error");
    } finally {
      setTraduciendo(false);
      abortar.current = null;
    }
  }, [entrada.presente, toast]);

  // ----- descargar -----
  const paraArchivo = useMemo(
    () => (salida ? paraExportar(salida.presente) : null),
    [salida],
  );

  // La hoja de impresion vive fuera, en el Workspace: necesita la planilla.
  useEffect(() => {
    onPlanillaChange(avisos.length === 0 ? paraArchivo : null);
  }, [avisos.length, onPlanillaChange, paraArchivo]);

  const descargar = useCallback(
    async (tipo: "xlsx" | "docx" | "pdf") => {
      if (!paraArchivo) {
        toast("Primero traduce la planilla", "info");
        return;
      }
      setBajando(tipo);
      try {
        if (tipo === "xlsx") {
          await downloadXlsx({ doc: paraArchivo, lang: "en", includeLogo });
        } else {
          const payload = {
            title: paraArchivo.title,
            body: "",
            lang: "en" as const,
            sheet: paraArchivo,
            signature,
            signatureImage,
            includeLogo,
          };
          if (tipo === "docx") await downloadDocx(payload);
          else await downloadPdf(payload);
        }
        toast(`${tipo === "xlsx" ? "Excel" : tipo === "docx" ? "Word" : "PDF"} descargado`);
      } catch (error) {
        console.error("[paula] descarga de planilla fallida:", error);
        toast(
          error instanceof Error && error.message
            ? `No pudimos generar el archivo: ${error.message}`
            : "No pudimos generar el archivo",
          "error",
        );
      } finally {
        setBajando(null);
      }
    },
    [includeLogo, paraArchivo, signature, signatureImage, toast],
  );

  /** Celda a la que saltar cuando se toca un aviso. */
  const [salto, setSalto] = useState<{
    seccion: number;
    fila: number;
    columna: number;
    sello: number;
  } | null>(null);

  const irAlAviso = useCallback((aviso: Aviso) => {
    setVista("en");
    setSalto({
      seccion: aviso.section,
      fila: Math.max(0, aviso.row),
      columna: aviso.column,
      sello: Date.now(),
    });
  }, []);

  /** Las celdas marcadas, agrupadas por bloque, para pintarlas en rojo. */
  const marcadas = useMemo(() => {
    const mapa = new Map<number, Set<string>>();
    for (const aviso of avisos) {
      if (aviso.row < 0) continue;
      const actual = mapa.get(aviso.section) ?? new Set<string>();
      actual.add(`${aviso.row}:${aviso.column}`);
      mapa.set(aviso.section, actual);
    }
    return mapa;
  }, [avisos]);

  const hayResultado = salida !== null;

  return (
    <div className="flex flex-col gap-3 sm:gap-4">
      {/* ---------- barra de herramientas ---------- */}
      <div className="glass print-hidden flex flex-wrap items-end gap-2.5 rounded-2xl border border-line p-3 shadow-panel sm:gap-3 sm:p-4">
        <div className="w-full sm:w-44">
          <Select
            label="Plantilla"
            value={doc.template}
            options={PLANTILLAS.map((plantilla) => ({
              id: plantilla.id,
              label: plantilla.label,
            }))}
            onChange={cambiarPlantilla}
          />
        </div>

        <CampoMeta
          etiqueta="Fecha"
          valor={doc.meta.date}
          onChange={(valor) => editarMeta("date", valor)}
          placeholder="14/10/2026"
        />
        <CampoMeta
          etiqueta="Turno"
          valor={doc.meta.shift}
          onChange={(valor) => editarMeta("shift", valor)}
          placeholder="Día"
        />
        <CampoMeta
          etiqueta="Supervisor"
          valor={doc.meta.supervisor}
          onChange={(valor) => editarMeta("supervisor", valor)}
          placeholder="Nombre"
          ancho
        />

        <div className="ml-auto flex items-center gap-1">
          <Button
            size="sm"
            variant="quiet"
            onClick={() => void nuevaPlanilla()}
            title="Empezar otra planilla; esta queda guardada"
            icon={<FilePlus2 aria-hidden className="size-4" />}
          >
            <span className="hidden sm:inline">Nueva</span>
          </Button>
          <Button
            size="sm"
            variant="quiet"
            onClick={hacerDeshacer}
            disabled={!puedeDeshacer}
            aria-label="Deshacer"
            title="Deshacer (Ctrl + Z)"
            icon={<Undo2 aria-hidden className="size-4" />}
          >
            <span className="hidden sm:inline">Deshacer</span>
          </Button>
          <Button
            size="sm"
            variant="quiet"
            onClick={hacerRehacer}
            disabled={!puedeRehacer}
            aria-label="Rehacer"
            title="Rehacer (Ctrl + Shift + Z)"
            icon={<Redo2 aria-hidden className="size-4" />}
          >
            <span className="hidden sm:inline">Rehacer</span>
          </Button>
        </div>
      </div>

      {/* ---------- pestañas de idioma ---------- */}
      <div className="flex flex-wrap items-center gap-2">
        <div
          role="tablist"
          aria-label="Idioma de la planilla"
          className="glass flex gap-1 rounded-xl border border-line p-1 shadow-panel"
        >
          {(
            [
              { id: "es" as const, label: "Entrada en español" },
              { id: "en" as const, label: "Resultado en inglés" },
            ]
          ).map((pestana) => {
            const activa = vista === pestana.id;
            const desactivada = pestana.id === "en" && !hayResultado;
            return (
              <button
                key={pestana.id}
                type="button"
                role="tab"
                aria-selected={activa}
                disabled={desactivada}
                onClick={() => setVista(pestana.id)}
                className={cn(
                  "rounded-lg px-3 py-2 text-[13px] font-medium transition-colors",
                  activa ? "bg-accent text-accent-ink" : "text-muted hover:text-ink",
                  desactivada && "cursor-not-allowed opacity-40",
                )}
              >
                {pestana.label}
              </button>
            );
          })}
        </div>

        {desactualizado && vista === "en" ? (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-warning-soft px-2.5 py-1 text-[11px] font-medium text-warning">
            <AlertTriangle aria-hidden className="size-3.5" />
            Cambiaste la entrada: vuelve a traducir
          </span>
        ) : null}

        {hayResultado && !desactualizado && avisos.length === 0 && vista === "en" ? (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-accent-soft px-2.5 py-1 text-[11px] font-medium text-accent">
            <Check aria-hidden className="size-3.5" />
            Datos comprobados contra el original
          </span>
        ) : null}
      </div>

      {/* ---------- avisos de validación ---------- */}
      {avisos.length > 0 ? (
        <div className="rounded-2xl border border-warning/40 bg-warning-soft/60 p-3 sm:p-4">
          <h2 className="flex items-center gap-2 text-[15px] font-semibold text-ink">
            <AlertTriangle aria-hidden className="size-4 text-warning" />
            {avisos.length === 1
              ? "Hay una casilla por revisar"
              : `Hay ${avisos.length} casillas por revisar`}
          </h2>
          <p className="mt-1 text-[13px] leading-relaxed text-ink-soft">
            La traducción cambió algo que no debía. Toca cada aviso para ir a la casilla y
            escribe lo correcto; el aviso desaparece solo.
          </p>

          <ul className="mt-3 flex flex-col gap-1.5">
            {avisos.slice(0, 8).map((aviso, indice) => (
              <li key={indice}>
                <button
                  type="button"
                  onClick={() => irAlAviso(aviso)}
                  className="flex w-full items-start gap-2 rounded-xl border border-line bg-surface px-3 py-2 text-left text-[13px] transition-colors hover:border-warning/60 hover:bg-surface-soft"
                >
                  <span className="shrink-0 rounded-lg bg-surface-soft px-2 py-0.5 text-[11px] font-semibold text-ink-soft">
                    {aviso.row >= 0 ? `Fila ${aviso.row + 1}` : "Título"}
                  </span>
                  <span className="min-w-0 flex-1 text-ink-soft">
                    {aviso.columnLabel ? (
                      <span className="font-medium text-ink">{aviso.columnLabel}: </span>
                    ) : null}
                    {aviso.message}
                  </span>
                  <MoveRight aria-hidden className="mt-0.5 size-4 shrink-0 text-muted" />
                </button>
              </li>
            ))}
            {avisos.length > 8 ? (
              <li className="px-1 text-[12px] text-muted">
                y {avisos.length - 8} más, debajo en la tabla (están marcadas en rojo).
              </li>
            ) : null}
          </ul>

          <p className="mt-3 text-[12px] text-muted">
            Mientras quede algún aviso, el Excel no se descarga: así nadie se lleva una
            planilla con un dato cambiado.
          </p>
        </div>
      ) : null}

      {/* ---------- la hoja ---------- */}
      <div className="glass flex flex-col gap-4 rounded-2xl border border-line p-3 shadow-panel sm:p-4">
        <div className="flex flex-wrap items-baseline gap-2">
          <h2 className="title-serif text-[19px] text-ink">{doc.title}</h2>
          <span className="eyebrow">
            {vista === "es" ? "se escribe en español" : "sale en inglés"}
          </span>
          <EstadoGuardado estado={estadoNube} hora={guardadaEn} />
        </div>

        {doc.sections.map((seccion, indice) => (
          <div key={indice} className={cn("flex flex-col gap-2.5", indice > 0 && "mt-4")}>
            {doc.sections.length > 1 ? (
              <CabeceraBloque
                cabecera={buscarPlantilla(doc.template).sections[indice]?.cabecera}
                titulo={seccion.title}
                numero={indice + 1}
                total={doc.sections.length}
              />
            ) : null}
            <Cuadricula
              seccion={seccion}
              onChange={(siguiente) => editarSeccion(indice, siguiente)}
              anchos={anchosDe(indice, seccion)}
              onAnchosChange={(nuevos) => cambiarAnchos(indice, nuevos)}
              avisos={vista === "en" ? marcadas.get(indice) : undefined}
              foco={salto && salto.seccion === indice ? salto : null}
              // Pegar sin elegir casilla va a la tabla principal.
              pegadoGlobal={activa && indice === 0}
              onMensaje={toast}
              ariaLabel={
                seccion.title || (vista === "es" ? "Planilla en español" : "Planilla en inglés")
              }
            />
          </div>
        ))}
      </div>

      {/* ---------- acciones ---------- */}
      <div className="flex flex-col gap-2">
        <div className="grid gap-2 sm:flex sm:flex-wrap">
          <Button
            size="lg"
            variant="primary"
            onClick={() => void traducir()}
            loading={traduciendo}
            disabled={traduciendo}
            icon={<Languages aria-hidden className="size-4" />}
            className="w-full justify-center sm:w-auto"
          >
            Traducir y generar Excel en inglés
          </Button>

          <Button
            size="lg"
            variant={hayResultado && avisos.length === 0 ? "secondary" : "quiet"}
            onClick={() => void descargar("xlsx")}
            loading={bajando === "xlsx"}
            disabled={!hayResultado || avisos.length > 0}
            icon={<SheetIcon aria-hidden className="size-4" />}
            className="w-full justify-center sm:w-auto"
          >
            Descargar Excel
          </Button>

          <div className="flex gap-2">
            <Button
              size="lg"
              variant="quiet"
              onClick={() => void descargar("docx")}
              loading={bajando === "docx"}
              disabled={!hayResultado || avisos.length > 0}
              icon={<FileText aria-hidden className="size-4" />}
            >
              Word
            </Button>
            <Button
              size="lg"
              variant="quiet"
              onClick={() => void descargar("pdf")}
              loading={bajando === "pdf"}
              disabled={!hayResultado || avisos.length > 0}
              icon={<FileDown aria-hidden className="size-4" />}
            >
              PDF
            </Button>
            <Button
              size="lg"
              variant="quiet"
              onClick={() => window.print()}
              disabled={!hayResultado}
              aria-label="Imprimir la planilla"
              icon={<Printer aria-hidden className="size-4" />}
            >
              <span className="hidden sm:inline">Imprimir</span>
            </Button>
          </div>
        </div>

        <p className="text-[11px] leading-relaxed text-muted">
          Las matrículas, las puertas, las horas y los códigos no pasan por la IA: se copian
          tal cual y después se comprueba una por una que siguen igual.
          {misPlanillas === null
            ? " La planilla vive mientras tengas la página abierta."
            : " La planilla se guarda sola mientras trabajas."}
        </p>
      </div>

      {misPlanillas ? (
        <MisPlanillas
          planillas={misPlanillas}
          actual={idPlanilla}
          onAbrir={(id) => void abrirGuardada(id)}
          onBorrar={(id) => void borrarGuardada(id)}
        />
      ) : null}
    </div>
  );
}

const ICONOS_DE_BLOQUE = {
  aviones: Plane,
  personal: Users,
  extras: Clock,
  vehiculos: Truck,
} as const;

/**
 * La cabecera de cada bloque de la planilla.
 *
 * En la de noches hay cuatro tablas seguidas, y con un titulo pequeno en gris
 * no se veia que eran cosas distintas que llenar. Cada una lleva su icono, un
 * titulo grande, en que bloque se va ("2 de 4") y una linea que dice que hay
 * que escribir.
 */
function CabeceraBloque({
  cabecera,
  titulo,
  numero,
  total,
}: {
  cabecera?: BloquePlantilla["cabecera"];
  /** El titulo del bloque tal como sale en el documento (o vacio). */
  titulo: string;
  numero: number;
  total: number;
}) {
  const nombre = cabecera?.nombre ?? titulo;
  if (!nombre) return null;
  const Icono = ICONOS_DE_BLOQUE[cabecera?.icono ?? "aviones"];

  return (
    <div className="flex items-start gap-3 rounded-2xl border border-accent/25 bg-accent-soft/50 px-3 py-3 sm:items-center sm:px-4">
      <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-accent text-accent-ink shadow-[0_6px_18px_-8px_var(--accent-glow)]">
        <Icono aria-hidden className="size-5" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-accent">
          Bloque {numero} de {total}
        </p>
        <div className="flex flex-wrap items-baseline gap-x-2.5 gap-y-1">
          <h3 className="text-[19px] font-semibold leading-tight tracking-[0.02em] text-ink sm:text-[21px]">
            {nombre}
          </h3>
          {titulo && titulo !== nombre ? (
            <span className="rounded-full border border-line bg-surface px-2 py-0.5 text-[11px] font-medium text-muted">
              En el Excel: {titulo}
            </span>
          ) : null}
        </div>
        {cabecera?.ayuda ? (
          <p className="mt-1 text-[13px] leading-snug text-ink-soft">{cabecera.ayuda}</p>
        ) : null}
      </div>
    </div>
  );
}

/** Aviso pequeno junto al titulo: si lo escrito ya esta a salvo. */
function EstadoGuardado({ estado, hora }: { estado: EstadoNube; hora: string | null }) {
  if (estado === "sin-nube") return null;

  const textos: Record<Exclude<EstadoNube, "sin-nube">, string> = {
    esperando: "Cambios sin guardar…",
    guardando: "Guardando…",
    guardada: hora
      ? `Guardada · ${new Date(hora).toLocaleTimeString("es-CO", { hour: "2-digit", minute: "2-digit" })}`
      : "Guardada",
    error: "No se pudo guardar · se reintenta solo",
  };

  const conProblema = estado === "error";
  const Icono = conProblema ? CloudOff : Cloud;

  return (
    <span
      aria-live="polite"
      data-estado-nube={estado}
      className={cn(
        "ml-auto inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-medium",
        conProblema ? "bg-warning-soft text-warning" : "bg-surface-soft text-muted",
      )}
    >
      <Icono aria-hidden className="size-3.5" />
      {textos[estado]}
    </span>
  );
}

function CampoMeta({
  etiqueta,
  valor,
  onChange,
  placeholder,
  ancho = false,
}: {
  etiqueta: string;
  valor: string;
  onChange: (valor: string) => void;
  placeholder: string;
  ancho?: boolean;
}) {
  const id = `planilla-${etiqueta.toLowerCase()}`;
  return (
    <div className={cn("flex min-w-0 flex-col gap-1.5", ancho ? "flex-1 sm:max-w-56" : "w-28")}>
      <label htmlFor={id} className="eyebrow">
        {etiqueta}
      </label>
      <input
        id={id}
        type="text"
        value={valor}
        maxLength={60}
        placeholder={placeholder}
        onChange={(evento) => onChange(evento.target.value)}
        className="h-11 w-full min-w-0 rounded-xl border border-line bg-surface px-3 text-sm text-ink outline-none transition-colors hover:border-line-strong placeholder:text-muted/70 sm:h-9.5"
      />
    </div>
  );
}
