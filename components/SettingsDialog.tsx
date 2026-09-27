"use client";

import { useEffect, useRef } from "react";
import { X } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { APP_NAME, MAX_INPUT_CHARS } from "@/lib/config";

const SHORTCUTS = [
  { keys: "Ctrl / Cmd + Enter", description: "Procesar el texto" },
  { keys: "Ctrl / Cmd + Shift + C", description: "Copiar el resultado" },
  { keys: "Esc", description: "Cerrar ventana o cancelar el proceso" },
];

interface SettingsDialogProps {
  open: boolean;
  onClose: () => void;
  signature: string;
  onSignatureChange: (signature: string) => void;
  onClearHistory: () => void;
  historyCount: number;
}

export function SettingsDialog({
  open,
  onClose,
  signature,
  onSignatureChange,
  onClearHistory,
  historyCount,
}: SettingsDialogProps) {
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (open) closeRef.current?.focus();
  }, [open]);

  if (!open) return null;

  return (
    <div className="print-hidden fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-6">
      <button
        type="button"
        aria-label="Cerrar configuración"
        onClick={onClose}
        className="animate-fade absolute inset-0 bg-black/30 backdrop-blur-[2px]"
      />

      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="settings-title"
        className="animate-rise relative w-full max-w-lg overflow-hidden rounded-t-2xl border border-line bg-surface shadow-panel sm:rounded-2xl"
      >
        <div className="flex items-center justify-between border-b border-line px-5 py-3.5">
          <h2 id="settings-title" className="text-sm font-semibold text-ink">
            Configuración
          </h2>
          <button
            ref={closeRef}
            type="button"
            onClick={onClose}
            aria-label="Cerrar"
            className="grid size-8 place-items-center rounded-lg text-muted transition-colors hover:bg-surface-soft hover:text-ink"
          >
            <X aria-hidden className="size-4" />
          </button>
        </div>

        <div className="scroll-slim max-h-[70vh] space-y-6 overflow-y-auto px-5 py-5">
          <div className="space-y-2">
            <label htmlFor="settings-signature" className="text-sm font-medium text-ink">
              Firma para correos
            </label>
            <p className="text-xs leading-relaxed text-muted">
              Se agrega al final cuando generas un correo. Déjalo vacío si no quieres firma.
            </p>
            <textarea
              id="settings-signature"
              value={signature}
              maxLength={200}
              rows={3}
              onChange={(event) => onSignatureChange(event.target.value)}
              placeholder={"Saludos,\nTu nombre"}
              className="scroll-slim w-full resize-none rounded-xl border border-line bg-surface-soft px-3 py-2.5 text-sm text-ink outline-none transition-colors hover:border-line-strong placeholder:text-muted/70"
            />
          </div>

          <div className="space-y-2">
            <h3 className="text-sm font-medium text-ink">Atajos de teclado</h3>
            <ul className="divide-y divide-line overflow-hidden rounded-xl border border-line">
              {SHORTCUTS.map((shortcut) => (
                <li
                  key={shortcut.keys}
                  className="flex items-center justify-between gap-3 bg-surface-soft px-3 py-2"
                >
                  <span className="text-[13px] text-ink-soft">{shortcut.description}</span>
                  <kbd className="rounded-md border border-line bg-surface px-1.5 py-0.5 font-sans text-[11px] text-muted">
                    {shortcut.keys}
                  </kbd>
                </li>
              ))}
            </ul>
          </div>

          <div className="space-y-2">
            <h3 className="text-sm font-medium text-ink">Datos locales</h3>
            <p className="text-xs leading-relaxed text-muted">
              {APP_NAME} guarda tus preferencias, el borrador y tus textos recientes solo en
              este navegador. No hay base de datos ni cuentas. Límite por petición:{" "}
              {MAX_INPUT_CHARS.toLocaleString("es")} caracteres.
            </p>
            <Button
              size="sm"
              variant="secondary"
              onClick={onClearHistory}
              disabled={historyCount === 0}
            >
              Eliminar historial ({historyCount})
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
