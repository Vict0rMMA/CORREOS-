import { APP_NAME } from "@/lib/config";
import { dataUrlToBytes, fitWidth } from "@/lib/images";
import { downloadBlob, slugify, toLines } from "@/lib/utils";
import type { ReportImage } from "@/types";

export interface ExportPayload {
  /** Titulo del documento (p. ej. "Correo" o el tipo de texto). */
  title: string;
  /** Asunto del correo, si existe. */
  subject?: string;
  /** Cuerpo del texto. */
  body: string;
  /** Fotos del reporte, en orden. */
  images?: ReportImage[];
}

/** Ancho util de una pagina A4 con margenes de 2 cm, en pixeles a 96 ppp. */
const CONTENT_WIDTH_PX = 624;
const MAX_IMAGE_HEIGHT_PX = 460;

/**
 * Genera un .docx real con la libreria `docx` y lo descarga.
 * La libreria se importa de forma dinamica para no cargarla en el bundle inicial.
 */
export async function downloadDocx({
  title,
  subject,
  body,
  images = [],
}: ExportPayload): Promise<void> {
  const { Document, Packer, Paragraph, TextRun, ImageRun, AlignmentType } = await import("docx");

  const children = [];

  children.push(
    new Paragraph({
      spacing: { after: subject ? 120 : 280 },
      children: [new TextRun({ text: title, bold: true, size: 32 })],
    }),
  );

  if (subject) {
    children.push(
      new Paragraph({
        spacing: { after: 280 },
        children: [
          new TextRun({ text: "Asunto: ", bold: true, size: 24 }),
          new TextRun({ text: subject, size: 24 }),
        ],
      }),
    );
  }

  for (const line of toLines(body)) {
    children.push(
      new Paragraph({
        alignment: AlignmentType.LEFT,
        spacing: { after: line.trim() ? 160 : 80, line: 300 },
        children: [new TextRun({ text: line, size: 24 })],
      }),
    );
  }

  if (images.length > 0) {
    children.push(
      new Paragraph({
        spacing: { before: 360, after: 200 },
        children: [
          new TextRun({
            text: images.length === 1 ? "Anexo fotográfico" : "Anexos fotográficos",
            bold: true,
            size: 26,
          }),
        ],
      }),
    );

    images.forEach((image, index) => {
      const size = fitWidth(image, CONTENT_WIDTH_PX, MAX_IMAGE_HEIGHT_PX);
      children.push(
        new Paragraph({
          alignment: AlignmentType.CENTER,
          spacing: { before: 120, after: image.caption ? 60 : 240 },
          children: [
            new ImageRun({
              type: "jpg",
              data: dataUrlToBytes(image.dataUrl),
              transformation: { width: size.width, height: size.height },
              altText: {
                name: `Foto ${index + 1}`,
                title: image.caption || image.name,
                description: image.caption || image.name,
              },
            }),
          ],
        }),
      );

      children.push(
        new Paragraph({
          alignment: AlignmentType.CENTER,
          spacing: { after: 280 },
          children: [
            new TextRun({
              text: image.caption
                ? `Foto ${index + 1}. ${image.caption}`
                : `Foto ${index + 1}`,
              italics: true,
              size: 20,
              color: "666666",
            }),
          ],
        }),
      );
    });
  }

  const doc = new Document({
    creator: APP_NAME,
    title: subject || title,
    description: `Generado con ${APP_NAME}`,
    styles: {
      default: {
        document: {
          run: { font: "Calibri", size: 24 },
        },
      },
    },
    sections: [
      {
        properties: {
          page: { margin: { top: 1134, right: 1134, bottom: 1134, left: 1134 } },
        },
        children,
      },
    ],
  });

  const blob = await Packer.toBlob(doc);
  downloadBlob(blob, `${slugify(subject || title)}.docx`);
}
