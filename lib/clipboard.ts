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
