import { isoDate, labels } from "@/lib/export/i18n";
import { cargarLogo, medidaLogo } from "@/lib/export/logo";
import { paraExportar } from "@/lib/planilla";
import { nombreDeHoja } from "@/lib/tabla";
import { downloadBlob, slugify } from "@/lib/utils";
import type { Lang, SheetDoc, SheetSection } from "@/types";

/**
 * Planilla en Excel de verdad (.xlsx con exceljs): logo, encabezados con el
 * azul de la casa, filas alternas, horas como hora y la hoja lista para
 * imprimir en horizontal.
 *
 * exceljs se carga de forma dinamica, igual que docx y jspdf: pesa bastante y
 * solo hace falta cuando se pulsa "Descargar Excel".
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
  doc: SheetDoc;
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
  doc,
  lang,
  includeLogo = true,
}: SheetPayload): Promise<void> {
  const modulo = await import("exceljs");
  const ExcelJS = (modulo as unknown as { default?: typeof modulo }).default ?? modulo;
  const textos = labels(lang);
  const planilla = paraExportar(doc);
  const bloques = planilla.sections;
  if (bloques.length === 0) throw new Error("la planilla está vacía");

  const workbook = new ExcelJS.Workbook();
  workbook.created = new Date();
  const hoja = workbook.addWorksheet(nombreDeHoja(planilla.title, textos.titles.sheet), {
    pageSetup: {
      orientation: "landscape",
      fitToPage: true,
      fitToWidth: 1,
      fitToHeight: 0,
      horizontalCentered: true,
      margins: { left: 0.4, right: 0.4, top: 0.5, bottom: 0.5, header: 0.3, footer: 0.3 },
    },
  });

  /** El ancho de la hoja es el del bloque mas ancho. */
  const ancho = Math.max(...bloques.map((bloque) => bloque.columns.length));
  let fila = 0;

  // --- Fila 1: logo a la izquierda y titulo a la derecha ---
  fila += 1;
  hoja.getRow(fila).height = 40;

  const celdaTitulo = hoja.getCell(fila, Math.min(2, ancho));
  if (ancho > 1) hoja.mergeCells(fila, Math.min(2, ancho), fila, ancho);
  celdaTitulo.value = planilla.title;
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
    planilla.meta.date && `${textos.date}: ${planilla.meta.date}`,
    planilla.meta.shift && `${textos.shift}: ${planilla.meta.shift}`,
    planilla.meta.supervisor && `${textos.supervisor}: ${planilla.meta.supervisor}`,
  ].filter(Boolean) as string[];

  if (datos.length > 0) {
    fila += 1;
    hoja.getRow(fila).height = 18;
    if (ancho > 1) hoja.mergeCells(fila, 1, fila, ancho);
    const celda = hoja.getCell(fila, 1);
    celda.value = datos.join("     ");
    celda.font = { name: FUENTE, size: 10, bold: true, color: { argb: "FF44546A" } };
    celda.alignment = { horizontal: "left", vertical: "middle" };
  }

  const borde = {
    top: { style: "thin" as const, color: { argb: GRIS_BORDE } },
    left: { style: "thin" as const, color: { argb: GRIS_BORDE } },
    bottom: { style: "thin" as const, color: { argb: GRIS_BORDE } },
    right: { style: "thin" as const, color: { argb: GRIS_BORDE } },
  };

  /** Fila del encabezado del bloque principal: ahi se fija el panel. */
  let filaEncabezadoPrincipal = 0;
  let ultimaFilaPrincipal = 0;

  bloques.forEach((bloque, indiceBloque) => {
    // Aire antes de cada bloque.
    fila += 1;
    hoja.getRow(fila).height = indiceBloque === 0 ? 6 : 14;

    if (bloque.title) {
      fila += 1;
      hoja.getRow(fila).height = 20;
      if (ancho > 1) hoja.mergeCells(fila, 1, fila, ancho);
      const celda = hoja.getCell(fila, 1);
      celda.value = bloque.title;
      celda.font = { name: FUENTE, size: 11, bold: true, color: { argb: AZUL } };
      celda.alignment = { horizontal: "left", vertical: "middle" };
    }

    // --- Encabezado de la tabla ---
    fila += 1;
    const filaEncabezado = fila;
    const encabezado = hoja.getRow(filaEncabezado);
    encabezado.height = 26;
    bloque.columns.forEach((nombre, indice) => {
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
    bloque.rows.forEach((datosFila, indiceFila) => {
      fila += 1;
      const linea = hoja.getRow(fila);
      linea.height = 22;

      bloque.columns.forEach((_, indiceColumna) => {
        const valor = datosFila[indiceColumna] ?? "";
        const celda = linea.getCell(indiceColumna + 1);
        const hora = comoHora(valor);
        const esContador = bloque.columns[indiceColumna]?.trim() === "#";

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

    if (indiceBloque === 0) {
      filaEncabezadoPrincipal = filaEncabezado;
      ultimaFilaPrincipal = fila;
    }
  });

  // --- Notas debajo de la tabla ---
  if (planilla.notes) {
    fila += 2;
    if (ancho > 1) hoja.mergeCells(fila, 1, fila, ancho);
    const celda = hoja.getCell(fila, 1);
    celda.value = `${textos.notes}: ${planilla.notes}`;
    celda.font = { name: FUENTE, size: 9, italic: true, color: { argb: "FF595959" } };
    celda.alignment = { horizontal: "left", vertical: "top", wrapText: true };
    hoja.getRow(fila).height = 28;
  }

  // --- Anchos, filtro y panel fijo ---
  for (let columna = 1; columna <= ancho; columna += 1) {
    const textosColumna: string[] = [];
    let encabezado = "";
    for (const bloque of bloques) {
      if (columna > bloque.columns.length) continue;
      if (!encabezado) encabezado = bloque.columns[columna - 1] ?? "";
      for (const datosFila of bloque.rows) textosColumna.push(datosFila[columna - 1] ?? "");
    }
    hoja.getColumn(columna).width = anchoColumna(encabezado, textosColumna);
  }

  hoja.views = [{ state: "frozen", ySplit: filaEncabezadoPrincipal }];
  if (ultimaFilaPrincipal > filaEncabezadoPrincipal) {
    hoja.autoFilter = {
      from: { row: filaEncabezadoPrincipal, column: 1 },
      to: { row: ultimaFilaPrincipal, column: bloques[0].columns.length },
    };
  }

  // --- Impresion ---
  hoja.pageSetup.printTitlesRow = `${filaEncabezadoPrincipal}:${filaEncabezadoPrincipal}`;
  hoja.headerFooter = {
    oddFooter: `&L&9${isoDate()}&R&9${textos.page} &P ${textos.of} &N`,
  };

  const buffer = await workbook.xlsx.writeBuffer();
  await comprobar(ExcelJS, buffer, bloques, filaEncabezadoPrincipal, Boolean(includeLogo));

  const blob = new Blob([buffer], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
  downloadBlob(blob, `${slugify(planilla.title, "planilla")}-${isoDate()}.xlsx`);
}

/**
 * Se vuelve a abrir el archivo recien generado y se comprueba que tiene lo
 * mismo que la planilla. Mas vale fallar aqui que entregar un Excel al que le
 * falte una linea.
 */
async function comprobar(
  ExcelJS: typeof import("exceljs"),
  buffer: ArrayBuffer | Buffer,
  bloques: SheetSection[],
  filaEncabezado: number,
  conLogo: boolean,
): Promise<void> {
  const copia = new ExcelJS.Workbook();
  await copia.xlsx.load(buffer as ArrayBuffer);
  const hoja = copia.worksheets[0];
  if (!hoja) throw new Error("el Excel salió sin hoja");
  if (hoja.name.length > 31 || /[:\\/?*[\]]/.test(hoja.name)) {
    throw new Error("el nombre de la hoja no es válido");
  }

  const principal = bloques[0];
  const encabezado = hoja.getRow(filaEncabezado);
  const leidos = principal.columns.map((_, indice) =>
    String(encabezado.getCell(indice + 1).value ?? ""),
  );
  if (leidos.join("|") !== principal.columns.join("|")) {
    throw new Error("los encabezados del Excel no coinciden con la planilla");
  }

  for (let indice = 0; indice < principal.rows.length; indice += 1) {
    const linea = hoja.getRow(filaEncabezado + 1 + indice);
    const original = principal.rows[indice];
    for (let columna = 0; columna < principal.columns.length; columna += 1) {
      const esperado = (original[columna] ?? "").trim();
      if (!esperado) continue;
      const leido = linea.getCell(columna + 1).value;
      if (leido === null || leido === undefined || leido === "") {
        throw new Error(`la fila ${indice + 1} perdió el dato "${esperado}"`);
      }
      // Las horas viajan como numero: ahi basta con que haya algo.
      if (comoHora(esperado) !== null) continue;
      if (typeof leido === "string" && leido.trim() !== esperado) {
        throw new Error(`"${esperado}" salió como "${leido.trim()}" en el Excel`);
      }
    }
  }

  if (conLogo && (copia.model.media ?? []).length === 0) {
    // No es un fallo: el logo puede no estar disponible y el archivo vale igual.
    console.warn("[paula] el Excel salió sin el logo");
  }
}
