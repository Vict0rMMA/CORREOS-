"use client";

import { useEffect, useState } from "react";
import { Check, Copy, FileDown, FileText, Mail, PenLine, Plane, Printer, Type } from "lucide-react";
import { Panel, PanelFooter, PanelHeader, PanelTitle } from "@/components/Panel";
import { StatusBadge } from "@/components/StatusBadge";
import { Button } from "@/components/ui/Button";
import { cn, countChars, countWords } from "@/lib/utils";
import type { Status } from "@/types";

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
  onCopy: (plain: boolean) => Promise<boolean>;
  /** Copia el texto con la firma al final, listo para pegar en el correo. */
  onCopySigned: () => Promise<boolean>;
  onDownloadDocx: () => void;
  onDownloadPdf: () => void;
  onPrint: () => void;
  /** Abre el cliente de correo con el texto ya puesto. */
  onOpenMail: () => void;
  busyExport: "docx" | "pdf" | null;
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

export function OutputPanel({
  output,
  status,
  error,
  route,
  unchanged,
  onCopy,
  onCopySigned,
  onDownloadDocx,
  onDownloadPdf,
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
        {hasOutput ? (
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
              <p className="title-serif text-[22px] text-ink-soft">Aquí aterriza tu texto</p>
              <p className="max-w-[36ch] text-[13px] leading-relaxed text-muted">
                Corregido, traducido o generado. Elige una acción y pulsa{" "}
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
