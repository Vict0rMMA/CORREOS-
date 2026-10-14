"use client";

import { useEffect, useState } from "react";
import {
  Check,
  Copy,
  FileDown,
  FileText,
  Mail,
  PenLine,
  Plane,
  Printer,
  Sheet,
  Type,
} from "lucide-react";
import { Panel, PanelFooter, PanelHeader, PanelTitle } from "@/components/Panel";
import { StatusBadge } from "@/components/StatusBadge";
import { Button } from "@/components/ui/Button";
import { cn, countChars, countWords } from "@/lib/utils";
import { labels } from "@/lib/export/i18n";
import type { Lang, Status, TableData } from "@/types";

export interface Route {
  from: string;
  to: string;
}

interface OutputPanelProps {
  output: string;
  status: Status;
  error: string | null;
  route: Route | null;
  /** El resultado es identico al texto original. */
  unchanged: boolean;
  /** Planilla, cuando el resultado vino en forma de tabla. */
  table: TableData | null;
  /** Idioma en el que salio el resultado. */
  lang: Lang;
  /** Hay algo que bajar a Excel: una planilla o un reporte numerado. */
  canExportXlsx: boolean;
  /** Pestana de planillas: aqui no pintan las cosas de correo. */
  esPlanilla: boolean;
  onCopy: (plain: boolean) => Promise<boolean>;
  /** Copia el texto con la firma al final, listo para pegar en el correo. */
  onCopySigned: () => Promise<boolean>;
  onDownloadDocx: () => void;
  onDownloadPdf: () => void;
  /** Solo tiene sentido con una planilla. */
  onDownloadXlsx: () => void;
  onPrint: () => void;
  /** Abre el cliente de correo con el texto ya puesto. */
  onOpenMail: () => void;
  busyExport: "docx" | "pdf" | "xlsx" | null;
  className?: string;
}

/** Carril de ruta con un avion recorriendolo: el estado "en vuelo". */
function FlightStrip({ flying }: { flying: boolean }) {
  return (
    <div className="relative flex h-5 w-full max-w-[220px] items-center">
      <span aria-hidden className="flight-path h-px w-full" />
      <Plane
        aria-hidden
        className={cn(
          "absolute size-5 rotate-45 text-accent",
          flying ? "animate-fly" : "animate-hover-soft right-0",
        )}
        style={flying ? { top: "50%", marginTop: "-0.625rem" } : undefined}
      />
    </div>
  );
}

/** La planilla tal y como va a salir: encabezado azul y filas alternas. */
function TablePreview({ table, lang }: { table: TableData; lang: Lang }) {
  const textos = labels(lang);
  const datos = [
    table.meta.date && `${textos.date}: ${table.meta.date}`,
    table.meta.shift && `${textos.shift}: ${table.meta.shift}`,
    table.meta.supervisor && `${textos.supervisor}: ${table.meta.supervisor}`,
  ].filter(Boolean);

  return (
    <div className="flex flex-col gap-3">
      {table.title ? (
        <h3 className="title-serif text-[18px] text-ink">{table.title}</h3>
      ) : null}
      {datos.length > 0 ? (
        <p className="text-[12px] font-medium text-muted">{datos.join(" · ")}</p>
      ) : null}

      <div className="scroll-slim -mx-1 overflow-x-auto px-1">
        <table className="w-full min-w-max border-collapse text-[13px]">
          <thead>
            <tr>
              {table.columns.map((columna, indice) => (
                <th
                  key={`${columna}-${indice}`}
                  scope="col"
                  className="whitespace-nowrap border border-[#2b4572] bg-[#1f3864] px-2.5 py-2 text-center text-[11px] font-semibold tracking-[0.04em] text-white"
                >
                  {columna}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {table.rows.map((fila, indiceFila) => (
              <tr key={indiceFila} className={indiceFila % 2 === 1 ? "bg-surface-soft" : undefined}>
                {table.columns.map((_, indiceColumna) => (
                  <td
                    key={indiceColumna}
                    className="border border-line px-2.5 py-1.5 align-middle text-ink-soft"
                  >
                    {fila[indiceColumna] ?? ""}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {table.notes ? (
        <p className="text-[12px] italic leading-relaxed text-muted">{table.notes}</p>
      ) : null}
    </div>
  );
}

export function OutputPanel({
  output,
  status,
  error,
  route,
  unchanged,
  table,
  lang,
  canExportXlsx,
  esPlanilla,
  onCopy,
  onCopySigned,
  onDownloadDocx,
  onDownloadPdf,
  onDownloadXlsx,
  onPrint,
  onOpenMail,
  busyExport,
  className,
}: OutputPanelProps) {
  const [copied, setCopied] = useState<"rich" | "plain" | "firma" | null>(null);
  const [tardando, setTardando] = useState(false);
  const loading = status === "loading";

  // El plan gratuito de la IA a veces tarda varios segundos. Mejor decirlo que
  // dejar a la persona mirando una pantalla que parece colgada.
  useEffect(() => {
    if (!loading) {
      setTardando(false);
      return;
    }
    const aviso = window.setTimeout(() => setTardando(true), 4000);
    return () => window.clearTimeout(aviso);
  }, [loading]);
  const hasOutput = output.length > 0;

  const copy = async (plain: boolean) => {
    const ok = await onCopy(plain);
    if (!ok) return;
    setCopied(plain ? "plain" : "rich");
    window.setTimeout(() => setCopied(null), 2000);
  };

  const copyWithSignature = async () => {
    const ok = await onCopySigned();
    if (!ok) return;
    setCopied("firma");
    window.setTimeout(() => setCopied(null), 2000);
  };

  return (
    <Panel className={className}>
      <PanelHeader>
        <PanelTitle>Resultado</PanelTitle>
        <StatusBadge status={status} />
        {route ? (
          <span className="animate-fade inline-flex items-center gap-1.5 rounded-full bg-accent-soft px-2 py-0.5 text-[11px] font-medium tracking-[0.04em] text-accent">
            {route.from}
            <Plane aria-hidden className="size-3 rotate-45" />
            {route.to}
          </span>
        ) : null}
        {unchanged ? (
          <span className="animate-fade rounded-full bg-surface-soft px-2 py-0.5 text-[11px] font-medium text-muted">
            Sin cambios: tu texto ya estaba bien
          </span>
        ) : null}
        {hasOutput ? (
          <p className="ml-auto text-xs tabular-nums text-muted">
            {countWords(output)} palabras
            <span className="px-1.5 text-line-strong">|</span>
            {countChars(output).toLocaleString("es")} caracteres
          </p>
        ) : null}
      </PanelHeader>

      <div className="scroll-slim min-h-[190px] flex-1 overflow-y-auto px-4 py-4 sm:px-5 lg:min-h-[420px]">
        {table ? (
          <TablePreview table={table} lang={lang} />
        ) : hasOutput ? (
          <p
            className={cn(
              "max-w-[68ch] whitespace-pre-wrap text-[16px] leading-[1.75] text-ink",
              loading && "stream-caret",
            )}
          >
            {output}
          </p>
        ) : loading ? (
          <div className="flex flex-col gap-5">
            <FlightStrip flying />
            {tardando ? (
              <p className="animate-fade -mt-2 text-[13px] text-muted">
                La IA está tardando más de lo normal. Sigue trabajando, espera un momento.
              </p>
            ) : null}
            <div className="space-y-2.5" aria-hidden>
              {[92, 78, 96, 64, 86, 40].map((width, index) => (
                <div
                  key={index}
                  className="h-3.5 animate-pulse rounded-full bg-surface-soft"
                  style={{ width: `${width}%`, animationDelay: `${index * 80}ms` }}
                />
              ))}
            </div>
          </div>
        ) : status === "error" ? (
          <p className="max-w-prose text-sm leading-relaxed text-danger">{error}</p>
        ) : (
          <div className="flex h-full flex-col items-center justify-center gap-4 py-8 text-center">
            <FlightStrip flying={false} />
            <div className="space-y-2">
              <p className="title-serif text-[22px] text-ink-soft">
                {esPlanilla ? "Aquí aterriza tu planilla" : "Aquí aterriza tu texto"}
              </p>
              <p className="max-w-[36ch] text-[13px] leading-relaxed text-muted">
                {esPlanilla
                  ? "La tabla, lista para bajar a Excel. Elige una acción y pulsa "
                  : "Corregido, traducido o generado. Elige una acción y pulsa "}
                <kbd className="whitespace-nowrap rounded-md border border-line bg-surface-soft px-1.5 py-0.5 font-sans text-[11px] text-ink-soft">
                  Ctrl + Enter
                </kbd>
                .
              </p>
            </div>
          </div>
        )}
      </div>

      <PanelFooter>
        <Button
          size="sm"
          variant={hasOutput ? "primary" : "quiet"}
          onClick={() => copy(false)}
          disabled={!hasOutput}
          icon={
            copied === "rich" ? (
              <Check aria-hidden className="size-4" />
            ) : (
              <Copy aria-hidden className="size-4" />
            )
          }
        >
          {copied === "rich" ? "Copiado" : "Copiar"}
        </Button>
        {esPlanilla ? null : (
        <Button
          size="sm"
          variant="quiet"
          onClick={() => void copyWithSignature()}
          disabled={!hasOutput}
          title="Copia el texto con tu firma al final, listo para pegar en el correo"
          icon={
            copied === "firma" ? (
              <Check aria-hidden className="size-4" />
            ) : (
              <PenLine aria-hidden className="size-4" />
            )
          }
        >
          {copied === "firma" ? "Copiado" : "Con firma"}
        </Button>
        )}
        <Button
          size="sm"
          variant="quiet"
          onClick={() => copy(true)}
          disabled={!hasOutput}
          title="Copia el texto sin comillas tipográficas ni espacios sobrantes"
          icon={
            copied === "plain" ? (
              <Check aria-hidden className="size-4" />
            ) : (
              <Type aria-hidden className="size-4" />
            )
          }
        >
          Sin formato
        </Button>
        <div className="ml-auto flex items-center gap-2">
          <Button
            size="sm"
            variant="quiet"
            onClick={onOpenMail}
            disabled={!hasOutput}
            title="Abrir tu correo con este texto ya escrito"
            icon={<Mail aria-hidden className="size-4" />}
          >
            Correo
          </Button>
          {canExportXlsx ? (
            <Button
              size="sm"
              variant={table ? "secondary" : "quiet"}
              onClick={onDownloadXlsx}
              disabled={!hasOutput}
              loading={busyExport === "xlsx"}
              title="Descargar la planilla en Excel, con el logo y el formato de la empresa"
              icon={<Sheet aria-hidden className="size-4" />}
            >
              Excel
            </Button>
          ) : null}
          <Button
            size="sm"
            variant="quiet"
            onClick={onDownloadDocx}
            disabled={!hasOutput}
            loading={busyExport === "docx"}
            icon={<FileText aria-hidden className="size-4" />}
          >
            Word
          </Button>
          <Button
            size="sm"
            variant="quiet"
            onClick={onDownloadPdf}
            disabled={!hasOutput}
            loading={busyExport === "pdf"}
            icon={<FileDown aria-hidden className="size-4" />}
          >
            PDF
          </Button>
          <Button
            size="sm"
            variant="quiet"
            onClick={onPrint}
            disabled={!hasOutput}
            aria-label="Imprimir el resultado"
            icon={<Printer aria-hidden className="size-4" />}
          >
            <span className="hidden sm:inline">Imprimir</span>
          </Button>
        </div>
      </PanelFooter>
    </Panel>
  );
}
