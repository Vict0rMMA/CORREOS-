import { APP_NAME } from "@/lib/config";

/**
 * Reglas de maquetacion compartidas por el Word, el PDF y la impresion, para
 * que los tres documentos salgan iguales.
 *
 * Los textos acaban en documentacion de mantenimiento aeronautico, asi que se
 * espera el formato de un documento formal: encabezado con fecha, cuerpo y un
 * bloque de firma con linea, nombre y cargo.
 */

export interface SignatureBlock {
  /** Nombre de quien firma, en negrita. */
  name: string;
  /** Cargo y demas lineas, en gris bajo el nombre. */
  details: string[];
}

/** Separa la firma en nombre (primera linea) y cargo (el resto). */
export function parseSignature(signature: string): SignatureBlock | null {
  const lines = signature
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
  if (lines.length === 0) return null;

  return { name: lines[0], details: lines.slice(1) };
}

/** Fecha larga en espanol: "27 de septiembre de 2026". */
export function longDate(date = new Date()): string {
  return date.toLocaleDateString("es-CO", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

/** Pie de pagina comun. */
export function documentFooter(): string {
  return `${APP_NAME} · ${longDate()}`;
}

/**
 * true si el cuerpo ya termina con esa firma.
 * Los correos generados la traen escrita, y no se debe repetir.
 */
export function endsWithSignature(body: string, name: string): boolean {
  const simple = (value: string) =>
    value
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .toLowerCase()
      .replace(/\s+/g, " ")
      .trim();

  const needle = simple(name);
  if (!needle) return false;
  return simple(body).slice(-220).includes(needle);
}

/**
 * Quita del cuerpo la firma que la IA ya escribio, para volver a ponerla
 * despues con formato. Devuelve tambien la despedida ("Atentamente,") si la
 * encontro, que se conserva encima de la linea de firma.
 */
export function splitClosing(
  body: string,
  name: string,
): { body: string; closing: string | null } {
  if (!endsWithSignature(body, name)) return { body, closing: null };

  const lines = body.replace(/\s+$/, "").split("\n");
  const simple = (value: string) =>
    value
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .toLowerCase()
      .trim();

  const needle = simple(name);
  // Se recorta desde la linea del nombre hacia abajo.
  let cut = lines.length;
  for (let index = lines.length - 1; index >= 0; index -= 1) {
    if (simple(lines[index]).includes(needle)) {
      cut = index;
      break;
    }
  }

  const rest = lines.slice(0, cut);
  // Justo encima suele quedar la despedida: se guarda y se quita del cuerpo.
  let closing: string | null = null;
  while (rest.length > 0 && !rest[rest.length - 1].trim()) rest.pop();
  const last = rest[rest.length - 1]?.trim() ?? "";
  if (/^(atentamente|cordialmente|saludos|un saludo|best regards|kind regards|sincerely|regards)[,.]?$/i.test(last)) {
    closing = last;
    rest.pop();
  }
  while (rest.length > 0 && !rest[rest.length - 1].trim()) rest.pop();

  return { body: rest.join("\n"), closing };
}
