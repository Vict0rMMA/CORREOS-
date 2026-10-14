import { isoDate, labels } from "@/lib/export/i18n";
import { cargarLogo, medidaLogo } from "@/lib/export/logo";
import { paraExportar } from "@/lib/planilla";
import { nombreDeHoja } from "@/lib/tabla";
import { downloadBlob, slugify } from "@/lib/utils";
import type { Lang, SheetDoc, SheetSection } from "@/types";

/**
 * Planilla en Excel de verdad (.xlsx con exceljs).
 *
 * La idea es que no parezca una hoja de calculo en bruto sino un documento:
 * sin la cuadricula gris de fondo, con una banda de encabezado, la tabla
 * enmarcada, las filas altas lo justo para que el texto quepa entero y cada
 * columna alineada segun lo que lleva dentro.
 *
 * exceljs se carga de forma dinamica, igual que docx y jspdf: pesa bastante y
 * solo hace falta cuando se pulsa "Descargar Excel".
 */

/** Azul marino de la casa. */
const AZUL = "FF1F3864";
const AZUL_CLARO = "FF2E4D7D";
const GRIS_TEXTO = "FF44546A";
const GRIS_BORDE = "FFD6DCE4";
const GRIS_FILA = "FFF4F6FA";
const TINTA = "FF1A1A1A";
const FUENTE = "Arial";

/** Alto del logo en pixeles dentro de la hoja. */
const LOGO_ALTO = 46;

/** Alto de una linea de texto dentro de una celda, en puntos. */
const LINEA = 13.5;
const ALTO_MINIMO = 22;

const HORA = /^(\d{1,2}):([0-5]\d)$/;
const NUMERO_LIMPIO = /^\d{1,9}$/;

/** Columnas cuyos valores son codigos y nunca pueden volverse numero. */
const COLUMNAS_CODIGO = /^(a\/c|gate|sta|crew|mel\/nef|tail|avion|puerta|estacion)/i;

export interface SheetPayload {
  doc: SheetDoc;
  /** Idioma del documento: el mismo que el del resultado. */
  lang: Lang;
  /** Pone el logo de American Airlines en la cabecera. */
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

/**
 * true si la celda se puede guardar como numero.
 *
 * Un contador o un numero de empleado como numero evita el aviso de Excel
 * ("numero guardado como texto"). Un codigo con cero delante, o cualquier cosa
 * en una columna de matriculas o puertas, se queda en texto.
 */
function comoNumero(valor: string, columna: string): number | null {
  const texto = valor.trim();
  if (!NUMERO_LIMPIO.test(texto)) return null;
  if (texto.length > 1 && texto.startsWith("0")) return null;
  if (COLUMNAS_CODIGO.test(columna.trim())) return null;
  return Number(texto);
}

/**
 * Ancho de columna a partir de lo que tiene que caber.
 *
 * El encabezado pide sitio de mas: el boton del filtro se dibuja dentro de
 * la celda y, si no, se come el final del titulo.
 */
function anchoColumna(encabezado: string, celdas: string[]): number {
  const largoDatos = celdas.reduce((mayor, celda) => Math.max(mayor, celda.length), 0);
  // El titulo va en negrita (ocupa una cuarta parte mas) y centrado, asi que
  // necesita su ancho mas el del boton a cada lado para no pisarlo.
  const largoTitulo = Math.ceil(encabezado.length * 1.25) + 5;
  return Math.min(42, Math.max(10, largoTitulo, largoDatos + 3));
}

/** Cuantas lineas ocupa un texto en una columna de ese ancho. */
function lineasQueOcupa(texto: string, ancho: number): number {
  if (!texto) return 1;
  const porLinea = Math.max(6, Math.floor(ancho) - 1);
  let lineas = 0;
  for (const parrafo of texto.split("\n")) {
    lineas += Math.max(1, Math.ceil(parrafo.length / porLinea));
  }
  return lineas;
}

/**
 * Alineacion de una columna entera, segun lo que lleva.
 *
 * Se decide por columna y no por casilla: si no, en NOTES una nota corta
 * ("None") quedaba centrada y la de al lado, larga, a la izquierda. Una
 * columna con texto de verdad (nombres, notas) va a la izquierda; una de
 * datos (matriculas, puertas, horas, estados) va centrada.
 */
function alineacionDeColumna(valores: string[]): "left" | "center" {
  const conTexto = valores.some(
    (valor) => /\p{Ll}/u.test(valor) && /\s/.test(valor.trim()),
  );
  return conTexto ? "left" : "center";
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
    properties: { tabColor: { argb: AZUL } },
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

  // Los anchos se calculan antes de escribir: hacen falta para saber cuantas
  // lineas ocupa cada celda y darle a la fila el alto que necesita.
  const anchos: number[] = [];
  for (let columna = 1; columna <= ancho; columna += 1) {
    const valores: string[] = [];
    let encabezado = "";
    for (const bloque of bloques) {
      if (columna > bloque.columns.length) continue;
      if (!encabezado) encabezado = bloque.columns[columna - 1] ?? "";
      for (const fila of bloque.rows) valores.push(fila[columna - 1] ?? "");
    }
    const medida = anchoColumna(encabezado, valores);
    anchos.push(medida);
    hoja.getColumn(columna).width = medida;
  }

  let fila = 0;

  // ---------------------------------------------------------------------
  // Cabecera: logo a la izquierda, titulo a la derecha, sobre fondo blanco
  // ---------------------------------------------------------------------
  fila += 1;
  const filaTitulo = fila;
  hoja.getRow(filaTitulo).height = 44;

  if (ancho > 1) hoja.mergeCells(filaTitulo, Math.min(3, ancho), filaTitulo, ancho);
  const celdaTitulo = hoja.getCell(filaTitulo, Math.min(3, ancho));
  celdaTitulo.value = planilla.title;
  celdaTitulo.font = { name: FUENTE, size: 16, bold: true, color: { argb: AZUL } };
  celdaTitulo.alignment = { horizontal: "right", vertical: "middle" };

  // Una regla fina bajo la cabecera separa el membrete de la tabla.
  for (let columna = 1; columna <= ancho; columna += 1) {
    hoja.getCell(filaTitulo, columna).border = {
      bottom: { style: "medium", color: { argb: AZUL } },
    };
  }

  if (includeLogo) {
    const logo = await cargarLogo();
    if (logo) {
      const id = workbook.addImage({ base64: logo.base64, extension: "png" });
      hoja.addImage(id, {
        tl: { col: 0.2, row: filaTitulo - 1 + 0.12 },
        ext: medidaLogo(logo, LOGO_ALTO),
        editAs: "oneCell",
      });
    }
  }

  // ---------------------------------------------------------------------
  // Fecha, turno y supervisor, con la etiqueta en negrita
  // ---------------------------------------------------------------------
  const datos: Array<[string, string]> = [];
  if (planilla.meta.date) datos.push([textos.date, planilla.meta.date]);
  if (planilla.meta.shift) datos.push([textos.shift, planilla.meta.shift]);
  if (planilla.meta.supervisor) datos.push([textos.supervisor, planilla.meta.supervisor]);

  if (datos.length > 0) {
    fila += 1;
    hoja.getRow(fila).height = 22;
    if (ancho > 1) hoja.mergeCells(fila, 1, fila, ancho);
    const celda = hoja.getCell(fila, 1);
    celda.value = {
      richText: datos.flatMap(([etiqueta, valor], indice) => [
        ...(indice > 0
          ? [{ font: { name: FUENTE, size: 10 }, text: "        " }]
          : []),
        {
          font: { name: FUENTE, size: 10, bold: true, color: { argb: AZUL } },
          text: `${etiqueta}: `,
        },
        { font: { name: FUENTE, size: 10, color: { argb: GRIS_TEXTO } }, text: valor },
      ]),
    };
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
    hoja.getRow(fila).height = indiceBloque === 0 ? 10 : 18;

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
    encabezado.height = Math.max(
      28,
      Math.max(
        ...bloque.columns.map((nombre, indice) =>
          // Se descuenta el hueco del boton del filtro.
          lineasQueOcupa(nombre, (anchos[indice] ?? 12) - 4),
        ),
      ) *
        LINEA +
        12,
    );
    bloque.columns.forEach((nombre, indice) => {
      const celda = encabezado.getCell(indice + 1);
      celda.value = nombre;
      celda.font = { name: FUENTE, size: 10, bold: true, color: { argb: "FFFFFFFF" } };
      celda.fill = { type: "pattern", pattern: "solid", fgColor: { argb: AZUL } };
      celda.alignment = { horizontal: "center", vertical: "middle", wrapText: true };
      celda.border = {
        top: { style: "thin", color: { argb: AZUL } },
        left: { style: "thin", color: { argb: AZUL_CLARO } },
        bottom: { style: "medium", color: { argb: AZUL } },
        right: { style: "thin", color: { argb: AZUL_CLARO } },
      };
    });

    // --- Cuerpo ---
    const alineaciones = bloque.columns.map((_, indice) =>
      alineacionDeColumna(bloque.rows.map((datosFila) => datosFila[indice] ?? "")),
    );
    bloque.rows.forEach((datosFila, indiceFila) => {
      fila += 1;
      const linea = hoja.getRow(fila);
      const ultima = indiceFila === bloque.rows.length - 1;

      // El alto se calcula: con un alto fijo, una nota larga se veia cortada.
      linea.height = Math.max(
        ALTO_MINIMO,
        Math.max(
          ...bloque.columns.map((_, indice) =>
            lineasQueOcupa(datosFila[indice] ?? "", anchos[indice] ?? 12),
          ),
        ) *
          LINEA +
          7,
      );

      bloque.columns.forEach((nombreColumna, indiceColumna) => {
        const valor = datosFila[indiceColumna] ?? "";
        const celda = linea.getCell(indiceColumna + 1);
        const hora = comoHora(valor);
        const numero = hora === null ? comoNumero(valor, nombreColumna) : null;

        if (hora !== null) {
          // Hora de verdad: asi se puede ordenar y restar en Excel.
          celda.value = hora;
          celda.numFmt = "hh:mm";
          celda.alignment = { horizontal: "center", vertical: "middle" };
        } else if (numero !== null) {
          celda.value = numero;
          celda.alignment = { horizontal: "center", vertical: "middle" };
        } else {
          // Todo lo demas se queda como texto: una matricula o una puerta no
          // pueden convertirse en numero ni en fecha.
          celda.value = valor;
          celda.alignment = {
            horizontal: alineaciones[indiceColumna],
            vertical: "middle",
            wrapText: true,
          };
        }

        celda.font = { name: FUENTE, size: 10, color: { argb: TINTA } };
        celda.border = ultima
          ? { ...borde, bottom: { style: "medium", color: { argb: AZUL } } }
          : borde;
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
    celda.font = { name: FUENTE, size: 9, italic: true, color: { argb: GRIS_TEXTO } };
    celda.alignment = { horizontal: "left", vertical: "top", wrapText: true };
    hoja.getRow(fila).height = Math.max(
      20,
      lineasQueOcupa(planilla.notes, anchos.reduce((total, a) => total + a, 0)) * LINEA + 8,
    );
  }

  const ultimaFila = fila;

  // --- Filtro, panel fijo y cuadricula de fondo apagada ---
  hoja.views = [
    { state: "frozen", ySplit: filaEncabezadoPrincipal, showGridLines: false },
  ];
  if (ultimaFilaPrincipal > filaEncabezadoPrincipal) {
    hoja.autoFilter = {
      from: { row: filaEncabezadoPrincipal, column: 1 },
      to: { row: ultimaFilaPrincipal, column: bloques[0].columns.length },
    };
  }

  // --- Impresion ---
  hoja.pageSetup.printTitlesRow = `${filaEncabezadoPrincipal}:${filaEncabezadoPrincipal}`;
  hoja.pageSetup.printArea = `A1:${hoja.getColumn(ancho).letter}${ultimaFila}`;
  hoja.headerFooter = {
    oddFooter: `&L&9${isoDate()}&R&9${textos.page} &P ${textos.of} &N`,
  };

  const buffer = await workbook.xlsx.writeBuffer();
  await comprobar(ExcelJS, buffer, bloques, filaEncabezadoPrincipal);

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
      // Las horas y los numeros viajan como numero: ahi basta con que haya algo.
      if (comoHora(esperado) !== null) continue;
      if (comoNumero(esperado, principal.columns[columna]) !== null) continue;
      if (typeof leido === "string" && leido.trim() !== esperado) {
        throw new Error(`"${esperado}" salió como "${leido.trim()}" en el Excel`);
      }
    }
  }
}
