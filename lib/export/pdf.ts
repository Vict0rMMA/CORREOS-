import {
  documentTitle,
  isoDate,
  labels,
  longDate,
  photoCaption,
} from "@/lib/export/i18n";
import { documentFooter, parseSignature, splitClosing } from "@/lib/export/layout";
import { cargarLogo, medidaLogo } from "@/lib/export/logo";
import { fitWidth } from "@/lib/images";
import { downloadBlob, slugify, toLines } from "@/lib/utils";
import { paraExportar } from "@/lib/planilla";
import type { ExportPayload } from "@/lib/export/docx";
import type { SheetSection } from "@/types";

const MARGIN = 64;
/** A4 en puntos. En la planilla se usa apaisado y se intercambian. */
const A4_SHORT = 595.28;
const A4_LONG = 841.89;
const BODY_SIZE = 11;
const LINE_HEIGHT = 16;
const MAX_IMAGE_HEIGHT = 320;
/** Espacio reservado abajo para el pie de pagina. */
const FOOTER_SPACE = 44;
/** Alto del logo en el encabezado, en puntos. */
const LOGO_HEIGHT = 26;

const GREY = 110;
const RULE = 205;
/** Azul marino de los encabezados de tabla. */
const AZUL: [number, number, number] = [31, 56, 100];
const FILA_ALTERNA = 242;

/**
 * Genera un PDF real con jsPDF (fuente Helvetica, codificacion WinAnsi,
 * compatible con acentos y enes del espanol) y lo descarga.
 *
 * Formato de documento formal: encabezado con fecha, cuerpo, bloque de firma
 * con linea y pie con numeracion de paginas.
 */
export async function downloadPdf({
  title,
  subject,
  body,
  lang,
  images = [],
  sheet = null,
  signature = "",
  signatureImage = null,
  includeLogo = true,
}: ExportPayload): Promise<void> {
  const { jsPDF } = await import("jspdf");

  const textos = labels(lang);
  const firma = parseSignature(signature);
  const { body: cuerpo, closing } = firma
    ? splitClosing(body, firma.name)
    : { body, closing: null };

  // La planilla se lee mejor apaisada.
  const apaisado = sheet !== null;
  const doc = new jsPDF({
    unit: "pt",
    format: "a4",
    orientation: apaisado ? "landscape" : "portrait",
    compress: true,
  });
  const PAGE_WIDTH = apaisado ? A4_LONG : A4_SHORT;
  const PAGE_HEIGHT = apaisado ? A4_SHORT : A4_LONG;

  const maxWidth = PAGE_WIDTH - MARGIN * 2;
  const bottom = PAGE_HEIGHT - MARGIN - FOOTER_SPACE;
  let y = MARGIN;

  const newPage = () => {
    doc.addPage();
    y = MARGIN;
  };

  /** Reserva espacio; si no cabe, salta de pagina. */
  const ensure = (needed: number) => {
    if (y + needed > bottom) newPage();
  };

  // --- Logo ---
  const logo = includeLogo ? await cargarLogo() : null;
  if (logo) {
    const medida = medidaLogo(logo, LOGO_HEIGHT);
    doc.addImage(logo.dataUrl, "PNG", MARGIN, y - 4, medida.width, medida.height, undefined, "FAST");
    y += medida.height + 12;
  }

  // --- Encabezado ---
  doc.setFont("helvetica", "bold");
  doc.setFontSize(13);
  doc.setCharSpace(1.2);
  doc.text(title.toUpperCase(), MARGIN, y);
  doc.setCharSpace(0);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(GREY);
  doc.text(longDate(lang), PAGE_WIDTH - MARGIN, y, { align: "right" });
  doc.setTextColor(0);

  y += 10;
  doc.setDrawColor(RULE);
  doc.setLineWidth(0.8);
  doc.line(MARGIN, y, PAGE_WIDTH - MARGIN, y);
  y += 30;

  // --- Asunto ---
  if (subject) {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    doc.text(textos.subject, MARGIN, y);
    const offset = doc.getTextWidth(`${textos.subject} `);
    doc.setFont("helvetica", "normal");
    const subjectLines = doc.splitTextToSize(subject, maxWidth - offset) as string[];
    doc.text(subjectLines, MARGIN + offset, y);
    y += LINE_HEIGHT * subjectLines.length + 14;
  }

  if (sheet) {
    // --- Planilla ---
    const planilla = paraExportar(sheet);
    const datos = [
      planilla.meta.date && `${textos.date}: ${planilla.meta.date}`,
      planilla.meta.shift && `${textos.shift}: ${planilla.meta.shift}`,
      planilla.meta.supervisor && `${textos.supervisor}: ${planilla.meta.supervisor}`,
    ].filter(Boolean) as string[];

    if (datos.length > 0) {
      doc.setFont("helvetica", "bold");
      doc.setFontSize(9.5);
      doc.setTextColor(68, 84, 106);
      doc.text(datos.join("     "), MARGIN, y);
      doc.setTextColor(0);
      y += 20;
    }

    planilla.sections.forEach((bloque, indice) => {
      if (bloque.title) {
        ensure(26);
        y += indice === 0 ? 0 : 14;
        doc.setFont("helvetica", "bold");
        doc.setFontSize(10);
        doc.setTextColor(AZUL[0], AZUL[1], AZUL[2]);
        doc.setCharSpace(0.8);
        doc.text(bloque.title, MARGIN, y);
        doc.setCharSpace(0);
        doc.setTextColor(0);
        y += 12;
      }

      y = dibujarTabla(doc, bloque, {
        x: MARGIN,
        y,
        width: maxWidth,
        bottom,
        onNewPage: () => {
          doc.addPage();
          return MARGIN;
        },
      });
    });

    if (planilla.notes) {
      ensure(30);
      y += 10;
      doc.setFont("helvetica", "italic");
      doc.setFontSize(9);
      doc.setTextColor(GREY);
      const notas = doc.splitTextToSize(
        `${textos.notes}: ${planilla.notes}`,
        maxWidth,
      ) as string[];
      for (const linea of notas) {
        ensure(12);
        doc.text(linea, MARGIN, y);
        y += 12;
      }
      doc.setTextColor(0);
    }
  } else {
    // --- Cuerpo ---
    doc.setFont("helvetica", "normal");
    doc.setFontSize(BODY_SIZE);

    for (const rawLine of toLines(cuerpo)) {
      if (!rawLine.trim()) {
        y += LINE_HEIGHT * 0.6;
        continue;
      }
      const lines = doc.splitTextToSize(rawLine, maxWidth) as string[];
      for (const line of lines) {
        ensure(LINE_HEIGHT);
        doc.text(line, MARGIN, y);
        y += LINE_HEIGHT;
      }
      y += LINE_HEIGHT * 0.35;
    }
  }

  // --- Bloque de firma ---
  if (firma) {
    const altoFirma = signatureImage
      ? Math.min(58, (signatureImage.height / signatureImage.width) * 210)
      : 0;
    const alto = 34 + (closing ? 22 : 0) + altoFirma + 18 + firma.details.length * 13;
    ensure(alto);
    y += 18;

    if (closing) {
      doc.setFont("helvetica", "normal");
      doc.setFontSize(BODY_SIZE);
      doc.text(closing, MARGIN, y);
      y += signatureImage ? 14 : 40;
    } else {
      y += signatureImage ? 8 : 30;
    }

    if (signatureImage) {
      // La firma escaneada se apoya sobre la linea.
      const ancho = Math.min(210, (signatureImage.width / signatureImage.height) * altoFirma);
      doc.addImage(signatureImage.dataUrl, "PNG", MARGIN, y, ancho, altoFirma, undefined, "FAST");
      y += altoFirma + 4;
    }

    // Linea sobre la que se firma a mano
    const lineWidth = 210;
    doc.setDrawColor(140);
    doc.setLineWidth(0.7);
    doc.line(MARGIN, y, MARGIN + lineWidth, y);
    y += 14;

    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    doc.text(firma.name, MARGIN, y);
    y += 13;

    if (firma.details.length > 0) {
      doc.setFont("helvetica", "normal");
      doc.setFontSize(9);
      doc.setTextColor(GREY);
      for (const detail of firma.details) {
        doc.text(detail, MARGIN, y);
        y += 12;
      }
      doc.setTextColor(0);
    }
    y += 10;
  }

  // --- Anexo fotografico ---
  if (images.length > 0) {
    ensure(46);
    y += 16;
    doc.setFont("helvetica", "bold");
    doc.setFontSize(10);
    doc.setCharSpace(1);
    doc.text(images.length === 1 ? textos.annex : textos.annexes, MARGIN, y);
    doc.setCharSpace(0);
    y += 8;
    doc.setDrawColor(RULE);
    doc.setLineWidth(0.8);
    doc.line(MARGIN, y, PAGE_WIDTH - MARGIN, y);
    y += 22;

    images.forEach((image, index) => {
      const size = fitWidth(image, maxWidth, MAX_IMAGE_HEIGHT);
      const caption = photoCaption(index, image.caption, lang);

      // La foto y su pie viajan juntos: nunca se separan entre paginas.
      ensure(size.height + 26);

      const x = MARGIN + (maxWidth - size.width) / 2;
      doc.addImage(image.dataUrl, "JPEG", x, y, size.width, size.height, undefined, "FAST");
      y += size.height + 12;

      doc.setFont("helvetica", "italic");
      doc.setFontSize(9);
      doc.setTextColor(GREY);
      const captionLines = doc.splitTextToSize(caption, maxWidth) as string[];
      for (const line of captionLines) {
        doc.text(line, PAGE_WIDTH / 2, y, { align: "center" });
        y += 12;
      }
      doc.setTextColor(0);
      y += 14;
    });
  }

  // --- Pie con numeracion, en todas las paginas ---
  const total = doc.getNumberOfPages();
  const pie = documentFooter(lang);
  for (let page = 1; page <= total; page += 1) {
    doc.setPage(page);
    const lineY = PAGE_HEIGHT - MARGIN - 18;
    doc.setDrawColor(RULE);
    doc.setLineWidth(0.6);
    doc.line(MARGIN, lineY, PAGE_WIDTH - MARGIN, lineY);

    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(GREY);
    doc.text(pie, MARGIN, lineY + 12);
    doc.text(
      `${textos.page} ${page} ${textos.of} ${total}`,
      PAGE_WIDTH - MARGIN,
      lineY + 12,
      { align: "right" },
    );
    doc.setTextColor(0);
  }

  doc.setProperties({ title: subject || title, creator: firma?.name ?? "" });
  const nombre = sheet
    ? `${slugify(sheet.title, documentTitle("sheet", lang))}-${isoDate()}`
    : slugify(subject || title);
  downloadBlob(doc.output("blob"), `${nombre}.pdf`);
}

/**
 * Dibuja la tabla y devuelve la y donde termina.
 *
 * Las columnas se reparten el ancho segun lo que tienen que mostrar, el texto
 * se parte dentro de la celda y el encabezado se repite al cambiar de pagina.
 */
function dibujarTabla(
  doc: import("jspdf").jsPDF,
  table: SheetSection,
  caja: {
    x: number;
    y: number;
    width: number;
    bottom: number;
    onNewPage: () => number;
  },
): number {
  const PADDING = 5;
  const FUENTE = 8.5;
  const INTERLINEA = 11;

  // Reparto del ancho: cada columna pide segun su contenido, con un minimo.
  const pesos = table.columns.map((nombre, indice) => {
    const largos = table.rows.map((fila) => (fila[indice] ?? "").length);
    const mayor = Math.max(nombre.length, ...largos, 1);
    return Math.min(42, Math.max(7, mayor));
  });
  const suma = pesos.reduce((total, peso) => total + peso, 0);
  const anchos = pesos.map((peso) => (peso / suma) * caja.width);

  doc.setFontSize(FUENTE);

  /** Reparte el texto de cada celda en lineas que caben en su columna. */
  const partir = (fila: string[]) =>
    anchos.map(
      (ancho, indice) =>
        doc.splitTextToSize(fila[indice] ?? "", ancho - PADDING * 2) as string[],
    );

  const alturaDe = (lineas: string[][]) =>
    Math.max(18, Math.max(...lineas.map((celda) => celda.length)) * INTERLINEA + PADDING * 2);

  let y = caja.y;

  const encabezado = () => {
    const lineas = partir(table.columns);
    const alto = Math.max(22, alturaDe(lineas));

    doc.setFillColor(AZUL[0], AZUL[1], AZUL[2]);
    doc.rect(caja.x, y, caja.width, alto, "F");
    doc.setFont("helvetica", "bold");
    doc.setTextColor(255);

    let x = caja.x;
    lineas.forEach((celda, indice) => {
      const centro = x + anchos[indice] / 2;
      celda.forEach((linea, nivel) => {
        doc.text(linea, centro, y + PADDING + INTERLINEA * (nivel + 0.7), { align: "center" });
      });
      x += anchos[indice];
    });

    doc.setTextColor(0);
    y += alto;
  };

  encabezado();

  table.rows.forEach((fila, indiceFila) => {
    const lineas = partir(fila);
    const alto = alturaDe(lineas);

    if (y + alto > caja.bottom) {
      y = caja.onNewPage();
      doc.setFontSize(FUENTE);
      encabezado();
    }

    if (indiceFila % 2 === 1) {
      doc.setFillColor(FILA_ALTERNA, FILA_ALTERNA, FILA_ALTERNA);
      doc.rect(caja.x, y, caja.width, alto, "F");
    }

    doc.setFont("helvetica", "normal");
    doc.setDrawColor(191);
    doc.setLineWidth(0.4);

    let x = caja.x;
    lineas.forEach((celda, indice) => {
      doc.rect(x, y, anchos[indice], alto);
      celda.forEach((linea, nivel) => {
        doc.text(linea, x + PADDING, y + PADDING + INTERLINEA * (nivel + 0.7));
      });
      x += anchos[indice];
    });

    y += alto;
  });

  return y;
}
