import { APP_NAME } from "@/lib/config";
import { fitWidth } from "@/lib/images";
import { downloadBlob, slugify, toLines } from "@/lib/utils";
import type { ExportPayload } from "@/lib/export/docx";

const MARGIN = 64;
const PAGE_WIDTH = 595.28; // A4 en puntos
const PAGE_HEIGHT = 841.89;
const BODY_SIZE = 11;
const LINE_HEIGHT = 16;
const MAX_IMAGE_HEIGHT = 340;

/**
 * Genera un PDF real con jsPDF (fuente Helvetica, codificacion WinAnsi,
 * compatible con acentos y enes del espanol) y lo descarga.
 */
export async function downloadPdf({
  title,
  subject,
  body,
  images = [],
}: ExportPayload): Promise<void> {
  const { jsPDF } = await import("jspdf");

  const doc = new jsPDF({ unit: "pt", format: "a4", compress: true });
  const maxWidth = PAGE_WIDTH - MARGIN * 2;
  let y = MARGIN;

  const newPage = () => {
    doc.addPage();
    y = MARGIN;
  };

  /** Reserva espacio; si no cabe, salta de pagina. */
  const ensure = (needed: number) => {
    if (y + needed > PAGE_HEIGHT - MARGIN) newPage();
  };

  doc.setFont("helvetica", "bold");
  doc.setFontSize(16);
  doc.text(title, MARGIN, y);
  y += 24;

  if (subject) {
    doc.setFontSize(11);
    doc.setFont("helvetica", "bold");
    doc.text("Asunto:", MARGIN, y);
    const subjectOffset = doc.getTextWidth("Asunto: ");
    doc.setFont("helvetica", "normal");
    const subjectLines = doc.splitTextToSize(subject, maxWidth - subjectOffset) as string[];
    doc.text(subjectLines, MARGIN + subjectOffset, y);
    y += LINE_HEIGHT * subjectLines.length + 6;
  }

  doc.setDrawColor(215);
  doc.line(MARGIN, y, PAGE_WIDTH - MARGIN, y);
  y += 24;

  doc.setFont("helvetica", "normal");
  doc.setFontSize(BODY_SIZE);

  for (const rawLine of toLines(body)) {
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

  if (images.length > 0) {
    y += 14;
    ensure(40);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(12);
    doc.text(images.length === 1 ? "Anexo fotográfico" : "Anexos fotográficos", MARGIN, y);
    y += 18;

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
      doc.setTextColor(110);
      const captionLines = doc.splitTextToSize(caption, maxWidth) as string[];
      for (const line of captionLines) {
        doc.text(line, PAGE_WIDTH / 2, y, { align: "center" });
        y += 12;
      }
      doc.setTextColor(0);
      y += 14;
    });
  }

  doc.setProperties({ title: subject || title, creator: APP_NAME });
  downloadBlob(doc.output("blob"), `${slugify(subject || title)}.pdf`);
}
