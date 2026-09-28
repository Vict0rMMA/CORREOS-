/** Utilidades de portapapeles con respaldo para navegadores antiguos. */

export function canPaste(): boolean {
  return (
    typeof navigator !== "undefined" &&
    typeof navigator.clipboard?.readText === "function"
  );
}

export async function readClipboard(): Promise<string | null> {
  if (!canPaste()) return null;
  try {
    return await navigator.clipboard.readText();
  } catch (error) {
    console.error("[paula] no se pudo leer el portapapeles:", error);
    return null;
  }
}

export async function writeClipboard(text: string): Promise<boolean> {
  if (!text) return false;

  if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch (error) {
      console.error("[paula] Clipboard API fallo, usando respaldo:", error);
    }
  }

  // Respaldo: textarea temporal + execCommand.
  try {
    const textarea = document.createElement("textarea");
    textarea.value = text;
    textarea.setAttribute("readonly", "true");
    textarea.style.position = "fixed";
    textarea.style.opacity = "0";
    document.body.appendChild(textarea);
    textarea.select();
    const ok = document.execCommand("copy");
    textarea.remove();
    return ok;
  } catch (error) {
    console.error("[paula] no se pudo copiar:", error);
    return false;
  }
}

/** Quita formato: normaliza espacios, comillas tipograficas y saltos. */
export function toPlainText(text: string): string {
  return text
    .replace(/\r\n/g, "\n")
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[–—]/g, "-")
    .replace(/…/g, "...")
    .replace(/ /g, " ")
    .replace(/[ \t]+$/gm, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/**
 * Longitud maxima razonable de un enlace mailto.
 *
 * Windows corta los enlaces alrededor de los 2.000 caracteres y algunos
 * clientes de correo antes, asi que por encima de esto se copia el texto en
 * vez de meterlo en el enlace.
 */
export const MAX_MAILTO_LENGTH = 1800;

export interface MailtoOptions {
  subject?: string;
  body: string;
}

/** Construye el enlace para abrir el correo ya redactado. */
export function buildMailto({ subject, body }: MailtoOptions): string {
  const params = new URLSearchParams();
  if (subject?.trim()) params.set("subject", subject.trim());
  if (body.trim()) params.set("body", body.trim());
  // URLSearchParams usa "+" para los espacios y los clientes de correo
  // esperan %20, asi que se corrige.
  return `mailto:?${params.toString().replace(/\+/g, "%20")}`;
}
