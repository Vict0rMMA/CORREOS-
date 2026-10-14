import {
  documentTitle,
  isoDate,
  labels,
  longDate,
  photoCaption,
} from "@/lib/export/i18n";
import { documentFooter, parseSignature, splitClosing } from "@/lib/export/layout";
import { cargarLogo, medidaLogo } from "@/lib/export/logo";
import { dataUrlToBytes, fitWidth } from "@/lib/images";
import { downloadBlob, slugify, toLines } from "@/lib/utils";
import type { Lang, ReportImage, SignatureDrawing, TableData } from "@/types";

export interface ExportPayload {
  /** Titulo del documento (p. ej. "Correo" o "Email"). */
  title: string;
  /** Asunto del correo, si existe. */
  subject?: string;
  /** Cuerpo del texto. */
  body: string;
  /** Idioma del documento: el mismo en el que salio el resultado. */
  lang: Lang;
  /** Fotos del reporte, en orden. */
  images?: ReportImage[];
  /** Planilla, cuando el resultado vino en forma de tabla. */
  table?: TableData | null;
  /** Firma que cierra el documento: nombre en la primera linea, cargo debajo. */
  signature?: string;
  /** Firma escaneada, que se dibuja sobre la linea. */
  signatureImage?: SignatureDrawing | null;
  /** Pone el logo de American Airlines en el encabezado. */
  includeLogo?: boolean;
}

/** Ancho util de una pagina A4 con margenes de 2 cm, en pixeles a 96 ppp. */
const CONTENT_WIDTH_PX = 624;
const MAX_IMAGE_HEIGHT_PX = 460;

/** Tamano maximo de la firma escaneada, en pixeles a 96 ppp. */
const SIGNATURE_WIDTH_PX = 280;
const SIGNATURE_HEIGHT_PX = 78;

/** Alto del logo en el encabezado, en pixeles a 96 ppp. */
const LOGO_HEIGHT_PX = 34;

/** Gris de los textos secundarios. */
const GREY = "6B7C93";
const RULE = "C9D4E3";
const AZUL = "1F3864";
const FILA_ALTERNA = "F2F2F2";

/**
 * Genera un .docx real con la libreria `docx` y lo descarga.
 * La libreria se importa de forma dinamica para no cargarla en el bundle inicial.
 */
export async function downloadDocx({
  title,
  subject,
  body,
  lang,
  images = [],
  table = null,
  signature = "",
  signatureImage = null,
  includeLogo = true,
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
    ShadingType,
    Table,
    TableCell,
    TableRow,
    TabStopPosition,
    TabStopType,
    TextRun,
    WidthType,
  } = await import("docx");

  const textos = labels(lang);
  const firma = parseSignature(signature);
  // Si la IA ya escribio la firma, se retira del cuerpo para volver a ponerla
  // con formato (linea, nombre en negrita y cargo debajo).
  const { body: cuerpo, closing } = firma
    ? splitClosing(body, firma.name)
    : { body, closing: null };

  const children = [];

  // --- Logo ---
  if (includeLogo) {
    const logo = await cargarLogo();
    if (logo) {
      children.push(
        new Paragraph({
          spacing: { after: 140 },
          children: [
            new ImageRun({
              type: "png",
              data: dataUrlToBytes(logo.dataUrl),
              transformation: medidaLogo(logo, LOGO_HEIGHT_PX),
              altText: {
                name: "American Airlines",
                title: "American Airlines",
                description: "American Airlines",
              },
            }),
          ],
        }),
      );
    }
  }

  // --- Encabezado: titulo con regla y fecha a la derecha ---
  children.push(
    new Paragraph({
      spacing: { after: 60 },
      tabStops: [{ type: TabStopType.RIGHT, position: TabStopPosition.MAX }],
      border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: RULE, space: 6 } },
      children: [
        new TextRun({ text: title.toUpperCase(), bold: true, size: 26, characterSpacing: 24 }),
        new TextRun({ text: "\t" }),
        new TextRun({ text: longDate(lang), size: 18, color: GREY }),
      ],
    }),
  );

  if (subject) {
    children.push(
      new Paragraph({
        spacing: { before: 280, after: 120 },
        children: [
          new TextRun({ text: `${textos.subject} `, bold: true, size: 24 }),
          new TextRun({ text: subject, size: 24 }),
        ],
      }),
    );
  }

  if (table) {
    // --- Planilla ---
    const datos = [
      table.meta.date && `${textos.date}: ${table.meta.date}`,
      table.meta.shift && `${textos.shift}: ${table.meta.shift}`,
      table.meta.supervisor && `${textos.supervisor}: ${table.meta.supervisor}`,
    ].filter(Boolean) as string[];

    if (datos.length > 0) {
      children.push(
        new Paragraph({
          spacing: { before: 280, after: 160 },
          children: [
            new TextRun({ text: datos.join("     "), bold: true, size: 19, color: "44546A" }),
          ],
        }),
      );
    }

    const celda = (texto: string, cabecera: boolean, alterna: boolean) =>
      new TableCell({
        shading: {
          type: ShadingType.CLEAR,
          color: "auto",
          fill: cabecera ? AZUL : alterna ? FILA_ALTERNA : "FFFFFF",
        },
        margins: { top: 60, bottom: 60, left: 90, right: 90 },
        children: [
          new Paragraph({
            alignment: cabecera ? AlignmentType.CENTER : AlignmentType.LEFT,
            spacing: { before: 0, after: 0 },
            children: [
              new TextRun({
                text: texto,
                bold: cabecera,
                size: 18,
                color: cabecera ? "FFFFFF" : "1A1A1A",
              }),
            ],
          }),
        ],
      });

    children.push(
      new Table({
        width: { size: 100, type: WidthType.PERCENTAGE },
        rows: [
          new TableRow({
            tableHeader: true,
            children: table.columns.map((nombre) => celda(nombre, true, false)),
          }),
          ...table.rows.map(
            (fila, indice) =>
              new TableRow({
                children: table.columns.map((_, columna) =>
                  celda(fila[columna] ?? "", false, indice % 2 === 1),
                ),
              }),
          ),
        ],
      }),
    );

    if (table.notes) {
      children.push(
        new Paragraph({
          spacing: { before: 240, after: 120 },
          children: [
            new TextRun({
              text: `${textos.notes}: ${table.notes}`,
              italics: true,
              size: 18,
              color: GREY,
            }),
          ],
        }),
      );
    }
  } else {
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
  }

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
            text: images.length === 1 ? textos.annex : textos.annexes,
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
                name: `${textos.photo} ${index + 1}`,
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
              text: photoCaption(index, image.caption, lang),
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
          page: {
            margin: { top: 1134, right: 1134, bottom: 1134, left: 1134 },
            // La planilla se lee mejor apaisada.
            ...(table ? { size: { orientation: "landscape" as const } } : {}),
          },
        },
        footers: {
          default: new Footer({
            children: [
              new Paragraph({
                tabStops: [{ type: TabStopType.RIGHT, position: TabStopPosition.MAX }],
                border: { top: { style: BorderStyle.SINGLE, size: 4, color: RULE, space: 6 } },
                children: [
                  new TextRun({ text: documentFooter(lang), size: 16, color: GREY }),
                  new TextRun({ text: "\t" }),
                  new TextRun({ text: `${textos.page} `, size: 16, color: GREY }),
                  new TextRun({ children: [PageNumber.CURRENT], size: 16, color: GREY }),
                  new TextRun({ text: ` ${textos.of} `, size: 16, color: GREY }),
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
  const nombre = table
    ? `${slugify(table.title, documentTitle("sheet", lang))}-${isoDate()}`
    : slugify(subject || title);
  downloadBlob(blob, `${nombre}.docx`);
}
