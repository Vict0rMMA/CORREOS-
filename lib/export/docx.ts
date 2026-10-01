import { documentFooter, longDate, parseSignature, splitClosing } from "@/lib/export/layout";
import { dataUrlToBytes, fitWidth } from "@/lib/images";
import { downloadBlob, slugify, toLines } from "@/lib/utils";
import type { ReportImage, SignatureDrawing } from "@/types";

export interface ExportPayload {
  /** Titulo del documento (p. ej. "Correo" o el tipo de texto). */
  title: string;
  /** Asunto del correo, si existe. */
  subject?: string;
  /** Cuerpo del texto. */
  body: string;
  /** Fotos del reporte, en orden. */
  images?: ReportImage[];
  /** Firma que cierra el documento: nombre en la primera linea, cargo debajo. */
  signature?: string;
  /** Firma escaneada, que se dibuja sobre la linea. */
  signatureImage?: SignatureDrawing | null;
}

/** Ancho util de una pagina A4 con margenes de 2 cm, en pixeles a 96 ppp. */
const CONTENT_WIDTH_PX = 624;
const MAX_IMAGE_HEIGHT_PX = 460;

/** Tamano maximo de la firma escaneada, en pixeles a 96 ppp. */
const SIGNATURE_WIDTH_PX = 280;
const SIGNATURE_HEIGHT_PX = 78;

/** Gris de los textos secundarios. */
const GREY = "6B7C93";
const RULE = "C9D4E3";

/**
 * Genera un .docx real con la libreria `docx` y lo descarga.
 * La libreria se importa de forma dinamica para no cargarla en el bundle inicial.
 */
export async function downloadDocx({
  title,
  subject,
  body,
  images = [],
  signature = "",
  signatureImage = null,
}: ExportPayload): Promise<void> {
  const {
    AlignmentType,
    BorderStyle,
    Document,
    Footer,
    ImageRun,
    PageNumber,
    Packer,
    Paragraph,
    TabStopPosition,
    TabStopType,
    TextRun,
  } = await import("docx");

  const firma = parseSignature(signature);
  // Si la IA ya escribio la firma, se retira del cuerpo para volver a ponerla
  // con formato (linea, nombre en negrita y cargo debajo).
  const { body: cuerpo, closing } = firma
    ? splitClosing(body, firma.name)
    : { body, closing: null };

  const children = [];

  // --- Encabezado: titulo con regla y fecha a la derecha ---
  children.push(
    new Paragraph({
      spacing: { after: 60 },
      tabStops: [{ type: TabStopType.RIGHT, position: TabStopPosition.MAX }],
      border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: RULE, space: 6 } },
      children: [
        new TextRun({ text: title.toUpperCase(), bold: true, size: 26, characterSpacing: 24 }),
        new TextRun({ text: "\t" }),
        new TextRun({ text: longDate(), size: 18, color: GREY }),
      ],
    }),
  );

  if (subject) {
    children.push(
      new Paragraph({
        spacing: { before: 280, after: 120 },
        children: [
          new TextRun({ text: "Asunto: ", bold: true, size: 24 }),
          new TextRun({ text: subject, size: 24 }),
        ],
      }),
    );
  }

  // --- Cuerpo ---
  const lines = toLines(cuerpo);
  lines.forEach((line, index) => {
    children.push(
      new Paragraph({
        alignment: AlignmentType.LEFT,
        spacing: {
          before: index === 0 ? (subject ? 120 : 320) : 0,
          after: line.trim() ? 160 : 80,
          line: 300,
        },
        children: [new TextRun({ text: line, size: 24 })],
      }),
    );
  });

  // --- Bloque de firma ---
  if (firma) {
    if (closing) {
      children.push(
        new Paragraph({
          spacing: { before: 360, after: 0 },
          children: [new TextRun({ text: closing, size: 24 })],
        }),
      );
    }

    if (signatureImage) {
      // Firma escaneada: se dibuja justo encima de la linea.
      const alto = Math.min(SIGNATURE_HEIGHT_PX, signatureImage.height);
      const ancho = Math.round((signatureImage.width / signatureImage.height) * alto);
      children.push(
        new Paragraph({
          spacing: { before: closing ? 200 : 360, after: 0 },
          children: [
            new ImageRun({
              type: "png",
              data: dataUrlToBytes(signatureImage.dataUrl),
              transformation: { width: Math.min(ancho, SIGNATURE_WIDTH_PX), height: alto },
              altText: { name: "Firma", title: firma.name, description: `Firma de ${firma.name}` },
            }),
          ],
        }),
      );
    }

    // Linea sobre la que va el nombre (y bajo la firma escaneada, si la hay).
    children.push(
      new Paragraph({
        spacing: { before: signatureImage ? 0 : closing ? 720 : 900, after: 60 },
        border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: "8B97A8", space: 2 } },
        children: [new TextRun({ text: "", size: 24 })],
      }),
    );

    children.push(
      new Paragraph({
        spacing: { after: firma.details.length ? 20 : 240 },
        children: [new TextRun({ text: firma.name, bold: true, size: 24 })],
      }),
    );

    firma.details.forEach((detail, index) => {
      children.push(
        new Paragraph({
          spacing: { after: index === firma.details.length - 1 ? 240 : 20 },
          children: [new TextRun({ text: detail, size: 20, color: GREY })],
        }),
      );
    });
  }

  // --- Anexo fotografico ---
  if (images.length > 0) {
    children.push(
      new Paragraph({
        spacing: { before: 360, after: 200 },
        border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: RULE, space: 4 } },
        children: [
          new TextRun({
            text: images.length === 1 ? "ANEXO FOTOGRÁFICO" : "ANEXOS FOTOGRÁFICOS",
            bold: true,
            size: 22,
            characterSpacing: 20,
          }),
        ],
      }),
    );

    images.forEach((image, index) => {
      const size = fitWidth(image, CONTENT_WIDTH_PX, MAX_IMAGE_HEIGHT_PX);
      children.push(
        new Paragraph({
          alignment: AlignmentType.CENTER,
          spacing: { before: 200, after: 60 },
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
              size: 18,
              color: GREY,
            }),
          ],
        }),
      );
    });
  }

  const doc = new Document({
    // Los datos del archivo llevan a quien firma, no a la aplicacion.
    creator: firma?.name ?? "",
    title: subject || title,
    description: "",
    styles: {
      default: {
        document: { run: { font: "Calibri", size: 24 } },
      },
    },
    sections: [
      {
        properties: {
          page: { margin: { top: 1134, right: 1134, bottom: 1134, left: 1134 } },
        },
        footers: {
          default: new Footer({
            children: [
              new Paragraph({
                tabStops: [{ type: TabStopType.RIGHT, position: TabStopPosition.MAX }],
                border: { top: { style: BorderStyle.SINGLE, size: 4, color: RULE, space: 6 } },
                children: [
                  new TextRun({ text: documentFooter(), size: 16, color: GREY }),
                  new TextRun({ text: "\t" }),
                  new TextRun({ text: "Página ", size: 16, color: GREY }),
                  new TextRun({ children: [PageNumber.CURRENT], size: 16, color: GREY }),
                  new TextRun({ text: " de ", size: 16, color: GREY }),
                  new TextRun({ children: [PageNumber.TOTAL_PAGES], size: 16, color: GREY }),
                ],
              }),
            ],
          }),
        },
        children,
      },
    ],
  });

  const blob = await Packer.toBlob(doc);
  downloadBlob(blob, `${slugify(subject || title)}.docx`);
}
