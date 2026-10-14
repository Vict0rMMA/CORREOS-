import type { Lang, TextType } from "@/types";

/**
 * Textos de los documentos (Word, PDF, Excel e impresion).
 *
 * El documento se escribe en el idioma del RESULTADO, no en el de la
 * aplicacion: si el correo salio en ingles, la etiqueta es "Subject:" y la
 * fecha "October 14, 2026". Antes estaban en espanol fijo y un correo en
 * ingles salia con el encabezado mezclado.
 */

export interface DocumentLabels {
  /** Etiqueta del asunto, con sus dos puntos. */
  subject: string;
  /** Titulo del anexo de fotos, en singular y en plural. */
  annex: string;
  annexes: string;
  /** Palabra que encabeza el pie de cada foto ("Foto 1" / "Photo 1"). */
  photo: string;
  /** Piezas de "Pagina X de Y": en el Word son campos, no texto. */
  page: string;
  of: string;
  /** Cabecera de la planilla. */
  date: string;
  shift: string;
  supervisor: string;
  notes: string;
  /** Columnas de la tabla minima, cuando el texto no es tabular. */
  number: string;
  description: string;
  /** Titulo de la planilla cuando el texto no trae ninguno. */
  sheetTitle: string;
  /** Titulo del documento segun el tipo de texto. */
  titles: Record<TextType, string>;
  /** Idioma de los formatos de fecha y de numero. */
  locale: string;
}

const ES: DocumentLabels = {
  subject: "Asunto:",
  annex: "ANEXO FOTOGRÁFICO",
  annexes: "ANEXOS FOTOGRÁFICOS",
  photo: "Foto",
  page: "Página",
  of: "de",
  date: "FECHA",
  shift: "TURNO",
  supervisor: "SUPERVISOR",
  notes: "NOTAS",
  number: "#",
  description: "Descripción",
  sheetTitle: "Planilla de asignación",
  titles: {
    email: "Correo",
    report: "Reporte",
    message: "Mensaje",
    sheet: "Planilla",
  },
  locale: "es-CO",
};

const EN: DocumentLabels = {
  subject: "Subject:",
  annex: "PHOTO ANNEX",
  annexes: "PHOTO ANNEXES",
  photo: "Photo",
  page: "Page",
  of: "of",
  date: "DATE",
  shift: "SHIFT",
  supervisor: "SUPERVISOR",
  notes: "NOTES",
  number: "#",
  description: "Description",
  sheetTitle: "Shift Assignment Sheet",
  titles: {
    email: "Email",
    report: "Report",
    message: "Message",
    sheet: "Sheet",
  },
  locale: "en-US",
};

export function labels(lang: Lang): DocumentLabels {
  return lang === "en" ? EN : ES;
}

/** Fecha larga: "27 de septiembre de 2026" / "September 27, 2026". */
export function longDate(lang: Lang, date = new Date()): string {
  return date.toLocaleDateString(labels(lang).locale, {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

/** Fecha corta para los nombres de archivo: 2026-09-27. */
export function isoDate(date = new Date()): string {
  const mes = `${date.getMonth() + 1}`.padStart(2, "0");
  const dia = `${date.getDate()}`.padStart(2, "0");
  return `${date.getFullYear()}-${mes}-${dia}`;
}

/** Titulo del documento para un tipo de texto. */
export function documentTitle(textType: TextType, lang: Lang): string {
  return labels(lang).titles[textType];
}

/** Pie de pagina de una foto: "Foto 1. Detalle del amortiguador". */
export function photoCaption(index: number, caption: string, lang: Lang): string {
  const base = `${labels(lang).photo} ${index + 1}`;
  return caption ? `${base}. ${caption}` : base;
}
