import fs from "node:fs";
import path from "node:path";
import ExcelJSModulo from "exceljs";
import { SALIDA, URL_BASE, abrirNavegador, crearInforme, esperarResultado } from "./comun.mjs";

/**
 * Planilla: se pega la tabla de Excel, sale en ingles y se descarga el .xlsx.
 *
 * La primera parte no gasta cuota: una tabla en la que todas las celdas son
 * codigos, horas o nombres no pasa por la IA, se resuelve con el mapa de
 * encabezados. La segunda si la usa, porque hay notas que traducir.
 */

const ExcelJS = ExcelJSModulo.default ?? ExcelJSModulo;
const informe = crearInforme("Planilla y Excel");
const DIR = path.join(SALIDA, "planilla");
fs.rmSync(DIR, { recursive: true, force: true });
fs.mkdirSync(DIR, { recursive: true });

/** La tabla de la prueba manual, tal y como se copia desde Excel. */
const TABLA = [
  "EMPLEADO\tALMUERZO\tAVIÓN\tPUERTA\tHORA ASIGNADO\tNOTAS",
  "J. Pérez\t12:00\tN123AV\tB4\t07:30\tFalla diferida MEL-21 pendiente",
  "M. Gómez\t12:30\tN789AV\tA1\t08:00\tRevisión completada sin novedades",
].join("\n");

// ---------------------------------------------------------------------------
// 1. Sin IA: encabezados y datos que se resuelven solos
// ---------------------------------------------------------------------------

const soloDatos = [
  "EMPLEADO\tAVIÓN\tPUERTA\tHORA ASIGNADO",
  "J. Pérez\tN123AV\tB4\t07:30",
  "M. Gómez\tN789AV\tA1\t08:00",
].join("\n");

const comienzo = Date.now();
const respuesta = await fetch(`${URL_BASE}/api/process`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    action: "to_english",
    text: soloDatos,
    lang: "es",
    tone: "professional",
    textType: "sheet",
    format: "table",
  }),
});
const sinIa = await respuesta.json();
const tardo = Date.now() - comienzo;

informe.comprobar("la tabla sin texto se resuelve sin IA", respuesta.ok && tardo < 3000, `${tardo} ms`);
if (sinIa.table) {
  informe.comprobar(
    "traduce los encabezados conocidos",
    sinIa.table.columns.join("|") === "EMPLOYEE|A/C|GATE|ASSGN @",
    sinIa.table.columns.join(" · "),
  );
  informe.comprobar(
    "los datos salen idénticos",
    sinIa.table.rows[0].join("|") === "J. Pérez|N123AV|B4|07:30",
    sinIa.table.rows[0].join(" · "),
  );
}

// ---------------------------------------------------------------------------
// 2. Con IA: la planilla completa, desde la aplicacion
// ---------------------------------------------------------------------------

const navegador = await abrirNavegador();
const contexto = await navegador.newContext({
  viewport: { width: 1440, height: 950 },
  acceptDownloads: true,
});
const page = await contexto.newPage();
page.on("pageerror", (error) => informe.anotarError(`error de página: ${error.message}`));
await page.goto(URL_BASE, { waitUntil: "domcontentloaded" });
await page.waitForTimeout(2500);

await page.getByLabel("Tipo de texto").selectOption("sheet");
await page.fill("#paula-input", TABLA);
await page.waitForTimeout(300);

await page.getByRole("button", { name: /Traducir al inglés/ }).first().click();
await esperarResultado(page);

// La hoja de impresion tambien tiene su tabla: aqui solo interesa la del panel.
const tabla = page.locator("table").first();
const celdas = await tabla.locator("thead th").allTextContents();
console.log(`  encabezados: ${celdas.join(" · ")}`);
informe.comprobar(
  "la tabla sale con los encabezados de la plantilla",
  celdas.join("|") === "EMPLOYEE|LUNCH|A/C|GATE|ASSGN @|NOTES",
  celdas.join(" · "),
);

const filas = await tabla.locator("tbody tr").count();
informe.comprobar("salen las dos filas", filas === 2, `${filas} fila(s)`);

const textoTabla = (await tabla.innerText()) ?? "";
console.log(`\n--- tabla ---\n${textoTabla}\n`);
for (const dato of ["N123AV", "B4", "07:30", "MEL-21", "N789AV", "A1", "08:00", "12:00"]) {
  informe.comprobar(`${dato} sigue igual`, textoTabla.includes(dato));
}
informe.comprobar(
  "las notas quedaron en inglés",
  !/pendiente|Revisi.n|novedades|completada/i.test(textoTabla),
);

// --- El Excel ---
const [descarga] = await Promise.all([
  page.waitForEvent("download", { timeout: 60000 }),
  page.getByRole("button", { name: "Excel", exact: true }).click(),
]);
const archivo = path.join(DIR, descarga.suggestedFilename());
await descarga.saveAs(archivo);
console.log(`  archivo: ${descarga.suggestedFilename()} · ${(fs.statSync(archivo).size / 1024).toFixed(0)} KB`);

informe.comprobar(
  "el archivo se llama con el título y la fecha",
  /^[a-z0-9-]+-\d{4}-\d{2}-\d{2}\.xlsx$/.test(descarga.suggestedFilename()),
  descarga.suggestedFilename(),
);

const libro = new ExcelJS.Workbook();
await libro.xlsx.readFile(archivo);
const hoja = libro.worksheets[0];

informe.comprobar(
  "el nombre de la hoja es válido",
  hoja.name.length <= 31 && !/[:\\/?*[\]]/.test(hoja.name),
  hoja.name,
);
informe.comprobar("el Excel lleva el logo", (libro.model.media ?? []).length > 0);

// La fila del encabezado es la primera que trae EMPLOYEE.
let filaEncabezado = 0;
hoja.eachRow((fila, numero) => {
  if (!filaEncabezado && String(fila.getCell(1).value ?? "") === "EMPLOYEE") filaEncabezado = numero;
});
informe.comprobar("hay fila de encabezado", filaEncabezado > 0, `fila ${filaEncabezado}`);

if (filaEncabezado > 0) {
  const encabezados = [1, 2, 3, 4, 5, 6].map((columna) =>
    String(hoja.getRow(filaEncabezado).getCell(columna).value ?? ""),
  );
  informe.comprobar(
    "los encabezados del Excel coinciden",
    encabezados.join("|") === "EMPLOYEE|LUNCH|A/C|GATE|ASSGN @|NOTES",
    encabezados.join(" · "),
  );

  const cabecera = hoja.getRow(filaEncabezado).getCell(1);
  informe.comprobar(
    "el encabezado va en azul marino con letra blanca",
    cabecera.fill?.fgColor?.argb === "FF1F3864" && cabecera.font?.color?.argb === "FFFFFFFF",
  );

  const primera = hoja.getRow(filaEncabezado + 1);
  informe.comprobar("la matrícula queda como texto", primera.getCell(3).value === "N123AV");
  informe.comprobar("la puerta queda como texto", primera.getCell(4).value === "B4");

  // En el archivo la hora es el numero 0.3125 con formato hh:mm. Al releerlo,
  // exceljs lo devuelve como fecha (interpretada en UTC); de las dos formas
  // tiene que salir 07:30.
  const hora = primera.getCell(5);
  const comoFraccion =
    hora.value instanceof Date
      ? (hora.value.getTime() - Date.UTC(1899, 11, 30)) / 86400000
      : Number(hora.value);
  informe.comprobar(
    "la hora es una hora de verdad",
    Math.abs(comoFraccion - 7.5 / 24) < 1e-6 && hora.numFmt === "hh:mm",
    `${comoFraccion} · ${hora.numFmt}`,
  );

  const notas = String(primera.getCell(6).value ?? "");
  informe.comprobar("MEL-21 sigue en las notas", notas.includes("MEL-21"), notas);
  informe.comprobar("las notas del Excel están en inglés", !/pendiente/i.test(notas), notas);

  informe.comprobar("el panel queda fijo bajo el encabezado", hoja.views?.[0]?.ySplit === filaEncabezado);
  informe.comprobar("hay autofiltro", Boolean(hoja.autoFilter));
}

informe.comprobar("se imprime en horizontal", hoja.pageSetup?.orientation === "landscape");
informe.comprobar("se ajusta a una página de ancho", hoja.pageSetup?.fitToWidth === 1);
informe.comprobar(
  "repite el encabezado al imprimir",
  Boolean(hoja.pageSetup?.printTitlesRow),
  String(hoja.pageSetup?.printTitlesRow),
);
informe.comprobar(
  "el pie lleva la numeración",
  /Page &P of &N/.test(hoja.headerFooter?.oddFooter ?? ""),
  hoja.headerFooter?.oddFooter ?? "",
);

const anchos = hoja.columns.slice(0, 6).map((columna) => columna.width ?? 0);
informe.comprobar(
  "las columnas tienen ancho entre 10 y 40",
  anchos.every((ancho) => ancho >= 10 && ancho <= 40),
  anchos.map((ancho) => Math.round(ancho)).join(" · "),
);

await navegador.close();
informe.terminar();
