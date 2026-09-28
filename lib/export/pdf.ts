import { documentFooter, longDate, parseSignature, splitClosing } from "@/lib/export/layout";
import { fitWidth } from "@/lib/images";
import { downloadBlob, slugify, toLines } from "@/lib/utils";
import type { ExportPayload } from "@/lib/export/docx";

const MARGIN = 64;
const PAGE_WIDTH = 595.28; // A4 en puntos
const PAGE_HEIGHT = 841.89;
const BODY_SIZE = 11;
const LINE_HEIGHT = 16;
const MAX_IMAGE_HEIGHT = 320;
/** Espacio reservado abajo para el pie de pagina. */
const FOOTER_SPACE = 44;

const GREY = 110;
const RULE = 205;

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
  images = [],
  signature = "",
  signatureImage = null,
}: ExportPayload): Promise<void> {
  const { jsPDF } = await import("jspdf");

  const firma = parseSignature(signature);
  const { body: cuerpo, closing } = firma
    ? splitClosing(body, firma.name)
    : { body, closing: null };

  const doc = new jsPDF({ unit: "pt", format: "a4", compress: true });
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

  // --- Encabezado ---
  doc.setFont("helvetica", "bold");
  doc.setFontSize(13);
  doc.setCharSpace(1.2);
  doc.text(title.toUpperCase(), MARGIN, y);
  doc.setCharSpace(0);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(GREY);
  doc.text(longDate(), PAGE_WIDTH - MARGIN, y, { align: "right" });
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
    doc.text("Asunto:", MARGIN, y);
    const offset = doc.getTextWidth("Asunto: ");
    doc.setFont("helvetica", "normal");
    const subjectLines = doc.splitTextToSize(subject, maxWidth - offset) as string[];
    doc.text(subjectLines, MARGIN + offset, y);
    y += LINE_HEIGHT * subjectLines.length + 14;
  }

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

  // --- Bloque de firma ---
  if (firma) {
    const altoFirma = signatureImage
      ? Math.min(52, (signatureImage.height / signatureImage.width) * 160)
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
      const ancho = Math.min(160, (signatureImage.width / signatureImage.height) * altoFirma);
      doc.addImage(signatureImage.dataUrl, "PNG", MARGIN, y, ancho, altoFirma, undefined, "FAST");
      y += altoFirma + 2;
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
    doc.text(
      images.length === 1 ? "ANEXO FOTOGRÁFICO" : "ANEXOS FOTOGRÁFICOS",
      MARGIN,
      y,
    );
    doc.setCharSpace(0);
    y += 8;
    doc.setDrawColor(RULE);
    doc.setLineWidth(0.8);
    doc.line(MARGIN, y, PAGE_WIDTH - MARGIN, y);
    y += 22;

    images.forEach((image, index) => {
      const size = fitWidth(image, maxWidth, MAX_IMAGE_HEIGHT);
      const caption = image.caption
        ? `Foto ${index + 1}. ${image.caption}`
        : `Foto ${index + 1}`;

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
  const pie = documentFooter();
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
    doc.text(`Página ${page} de ${total}`, PAGE_WIDTH - MARGIN, lineY + 12, { align: "right" });
    doc.setTextColor(0);
  }

  doc.setProperties({ title: subject || title, creator: firma?.name ?? "" });
  downloadBlob(doc.output("blob"), `${slugify(subject || title)}.pdf`);
}
