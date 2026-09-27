"use client";

import { type ChangeEvent, type DragEvent, type RefObject, useCallback, useState } from "react";
import {
  AlertTriangle,
  ClipboardPaste,
  Eraser,
  Loader2,
  Mic,
  Square,
  Undo2,
  X,
} from "lucide-react";
import { Panel, PanelFooter, PanelHeader, PanelTitle } from "@/components/Panel";
import { Button } from "@/components/ui/Button";
import { useToast } from "@/components/ui/Toast";
import { MAX_INPUT_CHARS } from "@/lib/config";
import { useDictation } from "@/lib/use-dictation";
import { cn, countChars, countWords } from "@/lib/utils";
import type { Lang } from "@/types";

interface InputPanelProps {
  value: string;
  onChange: (value: string) => void;
  lang: Lang;
  onLangChange: (lang: Lang) => void;
  detectedLang: Lang | null;
  /** Idioma que detectamos cuando contradice al elegido a mano. */
  mismatchLang: Lang | null;
  onClear: () => void;
  /** Vuelve al texto anterior al ultimo resultado encadenado. */
  onUndo?: () => void;
  onPaste: () => void;
  pasteEnabled: boolean;
  textareaRef: RefObject<HTMLTextAreaElement | null>;
  className?: string;
}

export function InputPanel({
  value,
  onChange,
  lang,
  onLangChange,
  detectedLang,
  mismatchLang,
  onClear,
  onUndo,
  onPaste,
  pasteEnabled,
  textareaRef,
  className,
}: InputPanelProps) {
  const { toast } = useToast();
  const [dragging, setDragging] = useState(false);
  const words = countWords(value);
  const chars = countChars(value);
  const overLimit = chars > MAX_INPUT_CHARS;

  /** Cada frase reconocida se anade al final del texto, respetando el espaciado. */
  const appendPhrase = useCallback(
    (phrase: string) => {
      const textarea = textareaRef.current;
      const current = textarea ? textarea.value : value;
      const needsSpace = current.length > 0 && !/\s$/.test(current);
      const next = `${current}${needsSpace ? " " : ""}${phrase}`.slice(0, MAX_INPUT_CHARS);
      onChange(next);
      // Mantenemos la vista al final, como en un dictado real.
      if (textarea) {
        window.requestAnimationFrame(() => {
          textarea.scrollTop = textarea.scrollHeight;
        });
      }
    },
    [onChange, textareaRef, value],
  );

  const dictation = useDictation({
    lang,
    onText: appendPhrase,
    onError: (message) => toast(message, "error"),
  });

  const recording = dictation.state === "recording";
  const transcribing = dictation.state === "transcribing";
  const minutes = String(Math.floor(dictation.seconds / 60)).padStart(2, "0");
  const secs = String(dictation.seconds % 60).padStart(2, "0");


  const handleDrop = async (event: DragEvent<HTMLTextAreaElement>) => {
    setDragging(false);
    const file = event.dataTransfer.files?.[0];
    if (!file) return; // texto simple: lo gestiona el propio textarea
    if (!file.type.startsWith("text/") && !file.name.endsWith(".txt")) return;
    event.preventDefault();
    try {
      onChange(await file.text());
    } catch (error) {
      console.error("[paula] no se pudo leer el archivo:", error);
    }
  };

  return (
    <Panel className={className}>
      <PanelHeader>
        <PanelTitle>Tu texto</PanelTitle>
        {detectedLang ? (
          <span className="animate-fade rounded-full bg-accent-soft px-2 py-0.5 text-[11px] font-medium text-accent">
            Detectado: {detectedLang === "es" ? "español" : "inglés"}
          </span>
        ) : null}
        {onUndo ? (
          <button
            type="button"
            onClick={onUndo}
            title="Volver al texto anterior"
            className="animate-fade ml-auto inline-flex items-center gap-1 rounded-full bg-surface-soft px-2 py-1 text-[11px] font-medium text-muted transition-colors hover:text-ink"
          >
            <Undo2 aria-hidden className="size-3" />
            Deshacer
          </button>
        ) : null}
        {mismatchLang ? (
          <button
            type="button"
            onClick={() => onLangChange(mismatchLang)}
            title="Cambiar el idioma del texto"
            className="animate-fade ml-auto inline-flex items-center gap-1 rounded-full bg-danger/10 px-2 py-0.5 text-[11px] font-medium text-danger transition-colors hover:bg-danger/20"
          >
            <AlertTriangle aria-hidden className="size-3" />
            Parece {mismatchLang === "es" ? "español" : "inglés"} &middot; cambiar
          </button>
        ) : null}
      </PanelHeader>

      <label className="sr-only" htmlFor="paula-input">
        Texto a procesar
      </label>
      <textarea
        id="paula-input"
        ref={textareaRef}
        value={value}
        onChange={(event: ChangeEvent<HTMLTextAreaElement>) => onChange(event.target.value)}
        onDragOver={() => setDragging(true)}
        onDragLeave={() => setDragging(false)}
        onDrop={handleDrop}
        spellCheck={false}
        placeholder={"Escribe, pega o dicta tu texto aquí...\n\nEjemplo: Hola profe, quería preguntarle si puedo faltar el viernes porque tengo otra clase."}
        className={cn(
          "scroll-slim min-h-[190px] flex-1 resize-none bg-transparent px-4 py-4 text-[16px]",
          "leading-[1.75] text-ink outline-none placeholder:text-muted/70 sm:px-5 lg:min-h-[420px]",
          dragging && "bg-accent-soft/40",
        )}
      />

      {recording || transcribing ? (
        <div
          className="animate-rise flex items-center gap-3 border-t border-line bg-accent-soft/60 px-4 py-2.5 sm:px-5"
          aria-live="polite"
        >
          {transcribing ? (
            <>
              <Loader2 aria-hidden className="size-4 shrink-0 animate-spin text-accent" />
              <p className="flex-1 text-[13px] text-ink-soft">
                Pasando tu voz a texto
                {dictation.pending > 1 ? ` (${dictation.pending} trozos)` : ""}...
              </p>
            </>
          ) : (
            <>
              <span aria-hidden className="relative flex size-2.5 shrink-0">
                <span className="absolute inline-flex size-full animate-ping rounded-full bg-danger opacity-60" />
                <span className="relative inline-flex size-2.5 rounded-full bg-danger" />
              </span>
              <span className="font-mono text-[13px] tabular-nums text-ink-soft">
                {minutes}:{secs}
              </span>
              {/* Medidor: confirma que el microfono esta entrando */}
              <span aria-hidden className="flex h-5 flex-1 items-center gap-[3px]">
                {Array.from({ length: 18 }).map((_, index) => {
                  const threshold = (index + 1) / 18;
                  const active = dictation.level * 1.6 >= threshold;
                  return (
                    <span
                      key={index}
                      className={cn(
                        "w-[3px] rounded-full transition-all duration-75",
                        active ? "bg-accent" : "bg-line-strong",
                      )}
                      style={{ height: active ? `${28 + index * 2}%` : "22%" }}
                    />
                  );
                })}
              </span>
              {dictation.pending > 0 ? (
                <span className="hidden text-[11px] text-muted sm:inline">
                  escribiendo lo dicho...
                </span>
              ) : null}
              <Button
                size="sm"
                variant="ghost"
                onClick={dictation.cancel}
                title="Descartar la grabación"
                icon={<X aria-hidden className="size-4" />}
              >
                <span className="sr-only">Descartar</span>
              </Button>
              <Button
                size="sm"
                variant="primary"
                onClick={dictation.stop}
                icon={<Square aria-hidden className="size-3.5 fill-current" />}
              >
                Listo
              </Button>
            </>
          )}
        </div>
      ) : null}

      <PanelFooter>
        <p className="text-xs tabular-nums text-muted" aria-live="polite">
          {words} {words === 1 ? "palabra" : "palabras"}
          <span className="px-1.5 text-line-strong">|</span>
          <span className={cn(overLimit && "font-medium text-danger")}>
            {chars.toLocaleString("es")} / {MAX_INPUT_CHARS.toLocaleString("es")} caracteres
          </span>
        </p>
        <div className="ml-auto flex items-center gap-2">
          {dictation.supported ? (
            <Button
              size="sm"
              variant={recording ? "primary" : "quiet"}
              onClick={dictation.toggle}
              disabled={transcribing}
              aria-pressed={recording}
              title={recording ? "Terminar y transcribir" : "Dictar con la voz"}
              icon={<Mic aria-hidden className="size-4" />}
            >
              {recording ? "Grabando" : "Dictar"}
            </Button>
          ) : null}
          <Button
            size="sm"
            variant="quiet"
            onClick={onClear}
            disabled={!value}
            icon={<Eraser aria-hidden className="size-4" />}
          >
            Limpiar
          </Button>
          {pasteEnabled ? (
            <Button
              size="sm"
              variant="quiet"
              onClick={onPaste}
              icon={<ClipboardPaste aria-hidden className="size-4" />}
            >
              Pegar
            </Button>
          ) : null}
        </div>
      </PanelFooter>
    </Panel>
  );
}
