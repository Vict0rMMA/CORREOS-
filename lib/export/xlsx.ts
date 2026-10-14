import { isoDate, labels } from "@/lib/export/i18n";
import { cargarLogo, medidaLogo } from "@/lib/export/logo";
import { nombreDeHoja } from "@/lib/tabla";
import { downloadBlob, slugify } from "@/lib/utils";
import type { Lang, TableData } from "@/types";

/**
 * Planilla en Excel de verdad (.xlsx con exceljs): logo, encabezados con el
 * azul de la casa, filas alternas, horas como hora y la hoja lista para
 * imprimir en horizontal.
 *
 * exceljs se carga de forma dinamica, igual que docx y jspdf: pesa bastante y
 * solo hace falta cuando se pulsa "Excel".
 */

/** Azul marino de los encabezados. */
const AZUL = "FF1F3864";
const GRIS_BORDE = "FFBFBFBF";
const GRIS_FILA = "FFF2F2F2";
const FUENTE = "Arial";

/** Alto del logo en pixeles dentro de la hoja. */
const LOGO_ALTO = 48;

const HORA = /^(\d{1,2}):([0-5]\d)$/;

export interface SheetPayload {
  table: TableData;
  /** Idioma del documento: el mismo que el del resultado. */
  lang: Lang;
  /** Pone el logo de American Airlines en la primera fila. */
  includeLogo?: boolean;
}

/** Hora "07:30" como fraccion de dia, que es lo que Excel entiende por hora. */
function comoHora(valor: string): number | null {
  const partes = HORA.exec(valor.trim());
  if (!partes) return null;
  const horas = Number(partes[1]);
  const minutos = Number(partes[2]);
  if (horas > 23) return null;
  return (horas * 60 + minutos) / 1440;
}

/** Ancho de columna a partir de lo que tiene que caber. */
function anchoColumna(encabezado: string, celdas: string[]): number {
  const largo = celdas.reduce(
    (mayor, celda) => Math.max(mayor, celda.length),
    encabezado.length,
  );
  return Math.min(40, Math.max(10, largo + 2));
}

export async function downloadXlsx({
  table,
  lang,
  includeLogo = true,
}: SheetPayload): Promise<void> {
  const modulo = await import("exceljs");
  const ExcelJS = (modulo as unknown as { default?: typeof modulo }).default ?? modulo;
  const textos = labels(lang);

  const workbook = new ExcelJS.Workbook();
  workbook.created = new Date();
  const hoja = workbook.addWorksheet(nombreDeHoja(table.title, textos.titles.sheet), {
    views: [{ state: "frozen", ySplit: 0 }],
    pageSetup: {
      orientation: "landscape",
      fitToPage: true,
      fitToWidth: 1,
      fitToHeight: 0,
      horizontalCentered: true,
      margins: { left: 0.4, right: 0.4, top: 0.5, bottom: 0.5, header: 0.3, footer: 0.3 },
    },
  });

  const ancho = table.columns.length;
  let fila = 0;

  // --- Fila 1: logo a la izquierda y titulo a la derecha ---
  fila += 1;
  const cabecera = hoja.getRow(fila);
  cabecera.height = 40;

  const celdaTitulo = hoja.getCell(fila, Math.min(2, ancho));
  if (ancho > 1) hoja.mergeCells(fila, Math.min(2, ancho), fila, ancho);
  celdaTitulo.value = table.title;
  celdaTitulo.font = { name: FUENTE, size: 16, bold: true, color: { argb: AZUL } };
  celdaTitulo.alignment = { horizontal: "right", vertical: "middle" };

  if (includeLogo) {
    const logo = await cargarLogo();
    if (logo) {
      const id = workbook.addImage({ base64: logo.base64, extension: "png" });
      hoja.addImage(id, {
        tl: { col: 0.15, row: fila - 1 + 0.1 },
        ext: medidaLogo(logo, LOGO_ALTO),
        editAs: "oneCell",
      });
    }
  }

  // --- Fila 2: fecha, turno y supervisor (solo los que vienen) ---
  const datos = [
    table.meta.date && `${textos.date}: ${table.meta.date}`,
    table.meta.shift && `${textos.shift}: ${table.meta.shift}`,
    table.meta.supervisor && `${textos.supervisor}: ${table.meta.supervisor}`,
  ].filter(Boolean) as string[];

  if (datos.length > 0) {
    fila += 1;
    const linea = hoja.getRow(fila);
    linea.height = 18;
    if (ancho > 1) hoja.mergeCells(fila, 1, fila, ancho);
    const celda = hoja.getCell(fila, 1);
    celda.value = datos.join("     ");
    celda.font = { name: FUENTE, size: 10, bold: true, color: { argb: "FF44546A" } };
    celda.alignment = { horizontal: "left", vertical: "middle" };
  }

  // Aire entre la cabecera y la tabla.
  fila += 1;
  hoja.getRow(fila).height = 6;

  // --- Encabezado de la tabla ---
  fila += 1;
  const filaEncabezado = fila;
  const encabezado = hoja.getRow(filaEncabezado);
  encabezado.height = 26;
  table.columns.forEach((nombre, indice) => {
    const celda = encabezado.getCell(indice + 1);
    celda.value = nombre;
    celda.font = { name: FUENTE, size: 10, bold: true, color: { argb: "FFFFFFFF" } };
    celda.fill = { type: "pattern", pattern: "solid", fgColor: { argb: AZUL } };
    celda.alignment = { horizontal: "center", vertical: "middle", wrapText: true };
    celda.border = {
      top: { style: "thin", color: { argb: AZUL } },
      left: { style: "thin", color: { argb: AZUL } },
      bottom: { style: "thin", color: { argb: AZUL } },
      right: { style: "thin", color: { argb: AZUL } },
    };
  });

  // --- Cuerpo ---
  const borde = {
    top: { style: "thin" as const, color: { argb: GRIS_BORDE } },
    left: { style: "thin" as const, color: { argb: GRIS_BORDE } },
    bottom: { style: "thin" as const, color: { argb: GRIS_BORDE } },
    right: { style: "thin" as const, color: { argb: GRIS_BORDE } },
  };

  table.rows.forEach((datosFila, indiceFila) => {
    fila += 1;
    const linea = hoja.getRow(fila);
    linea.height = 22;

    datosFila.forEach((valor, indiceColumna) => {
      const celda = linea.getCell(indiceColumna + 1);
      const hora = comoHora(valor);
      const esContador = table.columns[indiceColumna]?.trim() === "#";

      if (hora !== null) {
        // Hora de verdad: asi se puede ordenar y restar en Excel.
        celda.value = hora;
        celda.numFmt = "hh:mm";
        celda.alignment = { horizontal: "center", vertical: "middle" };
      } else if (esContador && /^\d{1,4}$/.test(valor.trim())) {
        celda.value = Number(valor.trim());
        celda.alignment = { horizontal: "center", vertical: "middle" };
      } else {
        // Todo lo demas se queda como texto: una matricula o una puerta no
        // pueden convertirse en numero ni en fecha.
        celda.value = valor;
        celda.alignment = { horizontal: "left", vertical: "middle", wrapText: true };
      }

      celda.font = { name: FUENTE, size: 10 };
      celda.border = borde;
      if (indiceFila % 2 === 1) {
        celda.fill = { type: "pattern", pattern: "solid", fgColor: { argb: GRIS_FILA } };
      }
    });
  });

  const ultimaFila = fila;

  // --- Notas debajo de la tabla ---
  if (table.notes) {
    fila += 2;
    if (ancho > 1) hoja.mergeCells(fila, 1, fila, ancho);
    const celda = hoja.getCell(fila, 1);
    celda.value = `${textos.notes}: ${table.notes}`;
    celda.font = { name: FUENTE, size: 9, italic: true, color: { argb: "FF595959" } };
    celda.alignment = { horizontal: "left", vertical: "top", wrapText: true };
    hoja.getRow(fila).height = 28;
  }

  // --- Anchos, filtro y panel fijo ---
  table.columns.forEach((nombre, indice) => {
    hoja.getColumn(indice + 1).width = anchoColumna(
      nombre,
      table.rows.map((datosFila) => datosFila[indice] ?? ""),
    );
  });

  hoja.views = [{ state: "frozen", ySplit: filaEncabezado }];
  hoja.autoFilter = {
    from: { row: filaEncabezado, column: 1 },
    to: { row: ultimaFila, column: ancho },
  };

  // --- Impresion ---
  hoja.pageSetup.printTitlesRow = `${filaEncabezado}:${filaEncabezado}`;
  hoja.headerFooter = {
    oddFooter: `&L&9${isoDate()}&R&9${textos.page} &P ${textos.of} &N`,
  };

  const buffer = await workbook.xlsx.writeBuffer();
  await comprobar(ExcelJS, buffer, table, filaEncabezado);

  const blob = new Blob([buffer], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
  downloadBlob(blob, `${slugify(table.title, "planilla")}-${isoDate()}.xlsx`);
}

/**
 * Se vuelve a abrir el archivo recien generado y se comprueba que tiene las
 * mismas filas y columnas que la tabla. Mas vale fallar aqui que entregar una
 * planilla a la que le falte una linea.
 */
async function comprobar(
  ExcelJS: typeof import("exceljs"),
  buffer: ArrayBuffer | Buffer,
  table: TableData,
  filaEncabezado: number,
): Promise<void> {
  const copia = new ExcelJS.Workbook();
  await copia.xlsx.load(buffer as ArrayBuffer);
  const hoja = copia.worksheets[0];
  if (!hoja) throw new Error("el Excel salió sin hoja");

  const encabezado = hoja.getRow(filaEncabezado);
  const leidas = table.columns.map((_, indice) => String(encabezado.getCell(indice + 1).value ?? ""));
  if (leidas.join("|") !== table.columns.join("|")) {
    throw new Error("los encabezados del Excel no coinciden con la tabla");
  }

  for (let indice = 0; indice < table.rows.length; indice += 1) {
    const linea = hoja.getRow(filaEncabezado + 1 + indice);
    const vacia = table.columns.every((_, columna) => {
      const valor = linea.getCell(columna + 1).value;
      return valor === null || valor === undefined || valor === "";
    });
    if (vacia && table.rows[indice].some((celda) => celda.trim())) {
      throw new Error(`la fila ${indice + 1} no se escribió en el Excel`);
    }
  }
}
