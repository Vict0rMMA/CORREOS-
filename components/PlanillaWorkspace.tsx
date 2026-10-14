"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  Check,
  FileDown,
  FileText,
  Languages,
  MoveRight,
  Printer,
  Redo2,
  Sheet as SheetIcon,
  Undo2,
} from "lucide-react";
import { Cuadricula } from "@/components/Cuadricula";
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

import { PLANTILLAS, crearPlanilla, esPlantillaIntacta } from "@/lib/plantillas";
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
 * Nada de esto se guarda: la planilla vive mientras dura la sesion.
 */

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

  const [entrada, setEntrada] = useState<Historial<SheetDoc>>(() =>
    iniciarHistorial(crearPlanilla("terminal")),
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
    setEntrada((historial) => cambiar(historial, siguiente));
    setSalida((actual) => {
      if (actual) setDesactualizado(true);
      return actual;
    });
  }, []);

  const cambiarSalida = useCallback((siguiente: SheetDoc) => {
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
      // La de noches trae la flota y la numeracion puestas: "vacia" es que
      // siga igual que recien creada, no que no tenga ni una celda escrita.
      if (!esPlantillaIntacta(entrada.presente)) {
        const seguro = window.confirm(
          "Vas a cambiar de plantilla y la planilla que tienes escrita se pierde. ¿Seguimos?",
        );
        if (!seguro) return;
      }
      setEntrada(iniciarHistorial(crearPlanilla(id)));
      setSalida(null);
      setAvisos([]);
      setDesactualizado(false);
      setVista("es");
      setAnchos({});
    },
    [entrada.presente],
  );

  // ----- deshacer y rehacer -----
  const puedeDeshacer = (historialActual?.pasado.length ?? 0) > 0;
  const puedeRehacer = (historialActual?.futuro.length ?? 0) > 0;

  const hacerDeshacer = useCallback(() => {
    if (vista === "es") setEntrada((historial) => deshacer(historial));
    else setSalida((historial) => (historial ? deshacer(historial) : historial));
  }, [vista]);

  const hacerRehacer = useCallback(() => {
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
            setSalida(iniciarHistorial(datos.doc));
            setVista("en");
          }
          toast(`Hay ${datos.avisos.length} celda(s) que no coinciden`, "error");
          return;
        }
        throw new Error(datos.error ?? GENERIC_ERROR);
      }

      if (!datos.doc) throw new Error(GENERIC_ERROR);

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
        </div>

        {doc.sections.map((seccion, indice) => (
          <div key={indice} className="flex flex-col gap-2">
            {seccion.title ? (
              <h3 className="eyebrow border-t border-line pt-3">{seccion.title}</h3>
            ) : null}
            <Cuadricula
              seccion={seccion}
              onChange={(siguiente) => editarSeccion(indice, siguiente)}
              anchos={anchosDe(indice, seccion)}
              onAnchosChange={(nuevos) => cambiarAnchos(indice, nuevos)}
              avisos={vista === "en" ? marcadas.get(indice) : undefined}
              foco={salto && salto.seccion === indice ? salto : null}
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
          tal cual y después se comprueba una por una que siguen igual. La planilla vive
          mientras tengas la página abierta.
        </p>
      </div>
    </div>
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
