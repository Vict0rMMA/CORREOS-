"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ActionsRow } from "@/components/ActionsRow";
import { Header } from "@/components/Header";
import { HistoryList } from "@/components/HistoryList";
import { FlightPath } from "@/components/Logo";
import { InputPanel } from "@/components/InputPanel";
import { LanguageRoute } from "@/components/LanguageRoute";
import { OptionsBar } from "@/components/OptionsBar";
import { OutputPanel, type Route } from "@/components/OutputPanel";
import { PrintSheet } from "@/components/PrintSheet";
import { QuickActions } from "@/components/QuickActions";
import { SettingsDialog } from "@/components/SettingsDialog";
import { useToast } from "@/components/ui/Toast";
import { TEXT_TYPES } from "@/lib/actions";
import {
  MAX_MAILTO_LENGTH,
  buildMailto,
  canPaste,
  readClipboard,
  toPlainText,
  writeClipboard,
} from "@/lib/clipboard";
import { APP_NAME, APP_TAGLINE, HISTORY_LIMIT, MAX_INPUT_CHARS } from "@/lib/config";
import { detectLanguage, effectiveSourceLang } from "@/lib/detect-language";
import { cargarFirmaPorDefecto } from "@/lib/firma-por-defecto";
import { downloadDocx } from "@/lib/export/docx";
import { downloadPdf } from "@/lib/export/pdf";
import { resolveTargetLang } from "@/lib/prompts";
import { cn } from "@/lib/utils";
import {
  DEFAULT_PREFS,
  clearHistory as clearStoredHistory,
  loadDraft,
  loadHistory,
  loadPrefs,
  loadSignatureImage,
  saveDraft,
  saveHistory,
  savePrefs,
  saveSignatureImage,
} from "@/lib/storage";
import type {
  Action,
  HistoryItem,
  Lang,
  Prefs,
  ReportImage,
  SignatureDrawing,
  Status,
  SubjectResponse,
  TextType,
  Tone,
} from "@/types";

const GENERIC_ERROR =
  "No pudimos procesar el texto. Revisa tu conexión o configuración de IA.";

export function Workspace() {
  const { toast } = useToast();

  // ----- contenido -----
  const [text, setText] = useState("");
  const [output, setOutput] = useState("");
  const [subject, setSubject] = useState("");
  const [subjectOptions, setSubjectOptions] = useState<string[]>([]);
  const [images, setImages] = useState<ReportImage[]>([]);
  const [signatureImage, setSignatureImage] = useState<SignatureDrawing | null>(null);

  // ----- preferencias -----
  const [prefs, setPrefs] = useState<Prefs>(DEFAULT_PREFS);
  const [langOverride, setLangOverride] = useState<Lang | null>(null);

  // ----- estado de la interfaz -----
  const [status, setStatus] = useState<Status>("idle");
  const [error, setError] = useState<string | null>(null);
  const [running, setRunning] = useState<Action | null>(null);
  const [primaryAction, setPrimaryAction] = useState<Action>("correct");
  const [subjectLoading, setSubjectLoading] = useState(false);
  const [busyExport, setBusyExport] = useState<"docx" | "pdf" | null>(null);
  /** Ruta del ultimo resultado (solo cuando hubo cambio de idioma). */
  const [route, setRoute] = useState<Route | null>(null);
  /** El modelo devolvio exactamente el mismo texto (no hizo falta cambiar nada). */
  const [unchanged, setUnchanged] = useState(false);
  /** Texto anterior al ultimo encadenado, para poder deshacerlo. */
  const [previousText, setPreviousText] = useState<string | null>(null);
  /** En movil solo cabe un panel a la vez: cual se esta viendo. */
  const [mobileView, setMobileView] = useState<"input" | "output">("input");
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [pasteEnabled, setPasteEnabled] = useState(false);

  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  /** Falso hasta que se han leido las preferencias guardadas. */
  const [hydrated, setHydrated] = useState(false);

  // ----- carga inicial (localStorage) -----
  useEffect(() => {
    setPrefs(loadPrefs());
    setHistory(loadHistory());
    setText(loadDraft());
    const guardada = loadSignatureImage();
    if (guardada) {
      setSignatureImage(guardada);
    } else {
      // Sin firma guardada se usa la que trae la aplicacion, y queda guardada
      // para no volver a procesarla en cada visita.
      void cargarFirmaPorDefecto().then((firma) => {
        if (!firma) return;
        setSignatureImage(firma);
        saveSignatureImage(firma);
      });
    }
    setPasteEnabled(canPaste());
    setHydrated(true);
  }, []);

  // ----- deteccion de idioma -----
  const detection = useMemo(() => detectLanguage(text), [text]);
  const lang: Lang = langOverride ?? (detection.confident ? detection.lang : prefs.lang);
  const detectedLang = !langOverride && detection.confident ? detection.lang : null;
  // Si elegiste el idioma a mano pero el texto dice claramente otra cosa, avisamos.
  // Origen y destino nunca pueden coincidir: traducir al mismo idioma no hace nada.
  const other = (value: Lang): Lang => (value === "es" ? "en" : "es");
  const targetLang: Lang = prefs.targetLang === lang ? other(lang) : prefs.targetLang;
  const mismatchLang =
    langOverride && detection.confident && detection.lang !== langOverride
      ? detection.lang
      : null;

  // ----- persistencia -----
  useEffect(() => {
    // Sin esta guarda, el primer render guardaria los valores por defecto
    // encima de lo que el usuario tenia guardado, y se perdia todo al recargar.
    if (!hydrated) return;
    savePrefs({ ...prefs, lang });
  }, [hydrated, prefs, lang]);

  useEffect(() => {
    const timer = window.setTimeout(() => saveDraft(text), 400);
    return () => window.clearTimeout(timer);
  }, [text]);

  const updatePrefs = useCallback((patch: Partial<Prefs>) => {
    setPrefs((current) => ({ ...current, ...patch }));
  }, []);

  const typeLabel = useMemo(
    () => TEXT_TYPES.find((type) => type.id === prefs.textType)?.label ?? "Texto",
    [prefs.textType],
  );

  const pushHistory = useCallback(
    (item: HistoryItem) => {
      // saveHistory devuelve lo que de verdad cupo en el navegador.
      setHistory((current) => saveHistory([item, ...current].slice(0, HISTORY_LIMIT)));
    },
    [],
  );

  // ----- procesar -----
  /** El boton Traducir usa el destino elegido arriba. */
  const resolveRunnable = useCallback(
    (action: Action): Action =>
      action === "translate" ? (targetLang === "en" ? "to_english" : "to_spanish") : action,
    [targetLang],
  );

  const run = useCallback(
    async (requested: Action) => {
      const action = resolveRunnable(requested);
      const source = text.trim();

      if (!source) {
        setStatus("empty");
        toast("Escribe o pega un texto primero", "info");
        textareaRef.current?.focus();
        return;
      }
      if (source.length > MAX_INPUT_CHARS) {
        setStatus("error");
        setError(`El texto supera el límite de ${MAX_INPUT_CHARS} caracteres.`);
        toast("El texto es demasiado largo", "error");
        return;
      }

      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;

      const target = resolveTargetLang(action, lang);
      setPrimaryAction(requested);
      setRunning(action);
      setStatus("loading");
      setError(null);
      setOutput("");
      setUnchanged(false);
      setMobileView("output");
      // La ruta solo tiene sentido cuando el texto cambia de idioma.
      setRoute(target === lang ? null : { from: lang.toUpperCase(), to: target.toUpperCase() });

      let received = "";

      try {
        const response = await fetch("/api/process", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          signal: controller.signal,
          body: JSON.stringify({
            action,
            text: source,
            lang,
            tone: prefs.tone,
            textType: prefs.textType,
            subject: prefs.textType === "email" ? subject : undefined,
            signature: prefs.textType === "email" ? prefs.signature : undefined,
          }),
        });

        if (!response.ok || !response.body) {
          const data = (await response.json().catch(() => null)) as { error?: string } | null;
          throw new Error(data?.error ?? GENERIC_ERROR);
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder();

        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          received += decoder.decode(value, { stream: true });
          setOutput(received);
        }

        const finalText = received.trim();
        if (!finalText) throw new Error(GENERIC_ERROR);

        setOutput(finalText);
        setStatus("done");
        setUnchanged(finalText === source);
        setMobileView("output");

        // Encadenado: el resultado se convierte en el texto de trabajo, para
        // que la siguiente accion continue sobre el. Sin esto, traducir al
        // ingles y luego generar el correo devolvia el correo en espanol,
        // porque se seguia partiendo del texto original.
        setPreviousText(source);
        setText(finalText);
        if (target !== lang) {
          // Tras traducir, el texto pasa a estar en el idioma de destino y la
          // ruta se invierte: lo siguiente que se traduzca vuelve al de origen.
          setLangOverride(target);
          updatePrefs({ targetLang: lang });
        }

        pushHistory({
          id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          preview: source.slice(0, 90),
          input: source,
          output: finalText,
          subject: prefs.textType === "email" ? subject : undefined,
          lang: target,
          action,
          textType: prefs.textType,
          tone: prefs.tone,
          createdAt: Date.now(),
        });
      } catch (caught) {
        if (caught instanceof DOMException && caught.name === "AbortError") return;
        console.error("[paula] proceso fallido:", caught);
        const message = caught instanceof Error && caught.message ? caught.message : GENERIC_ERROR;
        setStatus("error");
        setError(message);
        toast(message, "error");
      } finally {
        setRunning(null);
        abortRef.current = null;
      }
    },
    [
      lang,
      prefs.signature,
      prefs.textType,
      prefs.tone,
      pushHistory,
      resolveRunnable,
      subject,
      text,
      toast,
    ],
  );

  // ----- asuntos sugeridos -----
  const generateSubjects = useCallback(async () => {
    const source = text.trim();
    if (!source) {
      toast("Escribe el correo primero", "info");
      return;
    }

    setSubjectLoading(true);
    try {
      const response = await fetch("/api/subject", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: source, lang, tone: prefs.tone }),
      });
      const data = (await response.json()) as SubjectResponse & { error?: string };
      if (!response.ok) throw new Error(data.error ?? GENERIC_ERROR);
      setSubjectOptions(data.subjects ?? []);
    } catch (caught) {
      console.error("[paula] asuntos fallidos:", caught);
      toast(
        caught instanceof Error && caught.message ? caught.message : GENERIC_ERROR,
        "error",
      );
    } finally {
      setSubjectLoading(false);
    }
  }, [lang, prefs.tone, text, toast]);

  // ----- portapapeles -----
  const copyResult = useCallback(
    async (plain: boolean) => {
      if (!output) return false;
      const ok = await writeClipboard(plain ? toPlainText(output) : output);
      toast(ok ? "Copiado" : "No se pudo copiar", ok ? "success" : "error");
      return ok;
    },
    [output, toast],
  );

  const pasteFromClipboard = useCallback(async () => {
    const clipboard = await readClipboard();
    if (clipboard === null) {
      toast("Tu navegador no permite pegar automáticamente. Usa Ctrl + V.", "info");
      return;
    }
    if (!clipboard.trim()) {
      toast("El portapapeles está vacío", "info");
      return;
    }
    setText(clipboard.slice(0, MAX_INPUT_CHARS));
    setStatus("idle");
    textareaRef.current?.focus();
  }, [toast]);

  /** Abre el cliente de correo con el asunto y el texto ya escritos. */
  const openMail = useCallback(async () => {
    if (!output) return;

    const asunto = prefs.textType === "email" ? subject.trim() : "";
    const enlace = buildMailto({ subject: asunto, body: output });

    // Los enlaces mailto tienen un limite: si el correo es largo, se copia el
    // texto y se abre el correo solo con el asunto.
    if (enlace.length > MAX_MAILTO_LENGTH) {
      const copiado = await writeClipboard(output);
      window.location.href = buildMailto({ subject: asunto, body: "" });
      toast(
        copiado
          ? "El texto es largo: lo copiamos, pégalo en el correo"
          : "El texto es largo para abrirlo así; cópialo y pégalo",
        "info",
      );
      return;
    }

    window.location.href = enlace;
  }, [output, prefs.textType, subject, toast]);

  // ----- exportar -----
  const exportPayload = useMemo(
    () => ({
      title: prefs.textType === "email" ? "Correo" : typeLabel,
      subject: prefs.textType === "email" && subject.trim() ? subject.trim() : undefined,
      body: output,
      images: prefs.textType === "report" ? images : undefined,
      signature: prefs.signature,
      signatureImage,
    }),
    [images, output, prefs.signature, prefs.textType, signatureImage, subject, typeLabel],
  );

  const handleExport = useCallback(
    async (kind: "docx" | "pdf") => {
      if (!output) return;
      setBusyExport(kind);
      try {
        if (kind === "docx") await downloadDocx(exportPayload);
        else await downloadPdf(exportPayload);
        toast(kind === "docx" ? "Word descargado" : "PDF descargado");
      } catch (caught) {
        console.error("[paula] exportacion fallida:", caught);
        toast("No pudimos generar el archivo", "error");
      } finally {
        setBusyExport(null);
      }
    },
    [exportPayload, output, toast],
  );

  // ----- limpiar / restaurar -----
  const clearInput = useCallback(() => {
    setText("");
    setOutput("");
    setRoute(null);
    setPreviousText(null);
    setLangOverride(null);
    setImages([]);
    setMobileView("input");
    setSubject("");
    setSubjectOptions([]);
    setStatus("idle");
    setError(null);
    saveDraft("");
    textareaRef.current?.focus();
  }, []);

  /** Vuelve al texto que habia antes del ultimo encadenado. */
  const undoChain = useCallback(() => {
    if (previousText === null) return;
    setText(previousText);
    setPreviousText(null);
    setLangOverride(null);
    setMobileView("input");
    textareaRef.current?.focus();
  }, [previousText]);

  const restore = useCallback((item: HistoryItem) => {
    setText(item.input);
    setOutput(item.output);
    setSubject(item.subject ?? "");
    setPrefs((current) => ({ ...current, tone: item.tone, textType: item.textType }));
    setPrimaryAction(item.action);
    setStatus("done");
    setMobileView("output");
    setError(null);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }, []);

  const removeHistoryItem = useCallback((id: string) => {
    setHistory((current) => saveHistory(current.filter((item) => item.id !== id)));
  }, []);

  const removeHistory = useCallback(() => {
    clearStoredHistory();
    setHistory([]);
    toast("Historial eliminado");
  }, [toast]);

  // ----- atajos de teclado -----
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const mod = event.metaKey || event.ctrlKey;

      if (mod && event.key === "Enter") {
        event.preventDefault();
        void run(primaryAction);
        return;
      }

      if (mod && event.shiftKey && event.key.toLowerCase() === "c") {
        event.preventDefault();
        void copyResult(false);
        return;
      }

      if (event.key === "Escape") {
        if (settingsOpen) {
          setSettingsOpen(false);
          return;
        }
        if (abortRef.current) {
          abortRef.current.abort();
          abortRef.current = null;
          setRunning(null);
          setStatus(output ? "done" : "idle");
          toast("Proceso cancelado", "info");
        }
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [copyResult, output, primaryAction, run, settingsOpen, toast]);

  const busy = running !== null;

  return (
    <>
      <Header onOpenSettings={() => setSettingsOpen(true)} />

      <main className="print-hidden relative z-10 mx-auto w-full max-w-[1400px] px-3 pb-[calc(3rem+env(safe-area-inset-bottom))] pt-4 sm:px-6 sm:pb-16 sm:pt-6">
        <div className="flex flex-col gap-3 sm:gap-4">
          <LanguageRoute
            source={lang}
            onSourceChange={(value) => {
              setLangOverride(value);
              // Si el destino pasaria a ser el mismo idioma, se mueve al otro.
              if (value === targetLang) updatePrefs({ targetLang: other(value) });
            }}
            target={targetLang}
            onTargetChange={(value) => {
              updatePrefs({ targetLang: value });
              // Elegir "traducir a Español" implica que el texto esta en ingles.
              if (value === lang) setLangOverride(other(value));
            }}
            onSwap={() => {
              setLangOverride(targetLang);
              updatePrefs({ targetLang: lang });
            }}
          />

          <OptionsBar
            tone={prefs.tone}
            onToneChange={(tone: Tone) => updatePrefs({ tone })}
            textType={prefs.textType}
            onTextTypeChange={(textType: TextType) => updatePrefs({ textType })}
            subject={subject}
            onSubjectChange={setSubject}
            onGenerateSubject={generateSubjects}
            subjectLoading={subjectLoading}
            subjectOptions={subjectOptions}
            onPickSubject={(value) => {
              setSubject(value);
              setSubjectOptions([]);
              toast("Asunto aplicado");
            }}
            canGenerateSubject={text.trim().length > 0 && !subjectLoading}
            images={images}
            onImagesChange={setImages}
            signature={prefs.signature}
            onSignatureChange={(value) => updatePrefs({ signature: value })}
            signatureImage={signatureImage}
            onSignatureImageChange={(imagen) => {
              setSignatureImage(imagen);
              saveSignatureImage(imagen);
            }}
          />

          {/* En movil se ve un panel a la vez: dos cuadros altos obligaban a
              demasiado scroll. En pantalla grande siguen lado a lado. */}
          <div
            role="tablist"
            aria-label="Paneles"
            className="glass flex gap-1 rounded-xl border border-line p-1 shadow-panel lg:hidden"
          >
            {(
              [
                { id: "input" as const, label: "Tu texto" },
                { id: "output" as const, label: "Resultado" },
              ]
            ).map((tab) => {
              const active = mobileView === tab.id;
              return (
                <button
                  key={tab.id}
                  type="button"
                  role="tab"
                  aria-selected={active}
                  onClick={() => setMobileView(tab.id)}
                  className={cn(
                    "flex flex-1 items-center justify-center gap-1.5 rounded-lg py-2.5 text-sm font-medium transition-colors",
                    active ? "bg-accent text-accent-ink" : "text-muted hover:text-ink",
                  )}
                >
                  {tab.label}
                  {tab.id === "output" && output && !active ? (
                    <span aria-hidden className="size-1.5 rounded-full bg-accent" />
                  ) : null}
                </button>
              );
            })}
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <InputPanel
              className={cn(mobileView === "input" ? "flex" : "hidden", "lg:flex")}
              value={text}
              onChange={(value) => {
                setText(value);
                setPreviousText(null);
                if (status === "empty") setStatus("idle");
              }}
              lang={lang}
              onLangChange={(value) => setLangOverride(value)}
              detectedLang={detectedLang}
              mismatchLang={mismatchLang}
              onClear={clearInput}
              onUndo={previousText !== null ? undoChain : undefined}
              onPaste={pasteFromClipboard}
              pasteEnabled={pasteEnabled}
              textareaRef={textareaRef}
            />

            <OutputPanel
              className={cn(mobileView === "output" ? "flex" : "hidden", "lg:flex")}
              output={output}
              status={status}
              error={error}
              route={route}
              unchanged={unchanged}
              onCopy={copyResult}
              onDownloadDocx={() => void handleExport("docx")}
              onDownloadPdf={() => void handleExport("pdf")}
              onPrint={() => window.print()}
              onOpenMail={() => void openMail()}
              busyExport={busyExport}
            />
          </div>

          <div className="flex flex-col gap-2">
            <ActionsRow
              primary={primaryAction}
              running={running}
              disabled={busy}
              onRun={(action) => void run(action)}
              translateTarget={targetLang === "es" ? "español" : "inglés"}
            />
            <p className="hidden text-xs text-muted sm:block">
              <kbd className="rounded-md border border-line bg-surface px-1.5 py-0.5 font-sans text-[11px] text-ink-soft">
                Ctrl + Enter
              </kbd>{" "}
              procesa &middot;{" "}
              <kbd className="rounded-md border border-line bg-surface px-1.5 py-0.5 font-sans text-[11px] text-ink-soft">
                Ctrl + Shift + C
              </kbd>{" "}
              copia el resultado
            </p>
          </div>

          <QuickActions
            running={running}
            disabled={busy}
            onRun={(action) => void run(action)}
          />

          <HistoryList
            items={history}
            onRestore={restore}
            onRemove={removeHistoryItem}
            onClear={removeHistory}
          />
        </div>

        <footer className="mt-12 flex items-center justify-center gap-3 text-xs text-muted">
          <FlightPath className="hidden sm:block" />
          <span className="text-center">
            {APP_NAME} &mdash; {APP_TAGLINE}
          </span>
          <FlightPath className="hidden sm:block" />
        </footer>
      </main>

      <SettingsDialog
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        signature={prefs.signature}
        onSignatureChange={(signature) => updatePrefs({ signature })}
        onClearHistory={removeHistory}
        historyCount={history.length}
      />

      <PrintSheet
        title={exportPayload.title}
        subject={exportPayload.subject}
        body={output}
        images={exportPayload.images}
        signature={prefs.signature}
        signatureImage={signatureImage}
      />
    </>
  );
}
