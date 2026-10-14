import fs from "node:fs";
import path from "node:path";
import ExcelJSModulo from "exceljs";
import { SALIDA, URL_BASE, abrirNavegador, crearInforme } from "./comun.mjs";

/**
 * Las plantillas de AVX: sus columnas, lo que viene de fabrica y la ida y
 * vuelta de los encabezados.
 *
 * Un encabezado que sale al ingles y vuelve al espanol tiene que quedar
 * EXACTAMENTE igual que estaba. Antes no pasaba: al invertir el mapa ganaba el
 * ultimo sinonimo y "AVIÓN" volvia como "AERONAVE".
 *
 * No usa la IA: todas las celdas de la prueba son codigos y todos los
 * encabezados estan en la tabla de traduccion fija.
 */

const ExcelJS = ExcelJSModulo.default ?? ExcelJSModulo;
const informe = crearInforme("Plantillas y encabezados");
const DIR = path.join(SALIDA, "plantillas");
fs.rmSync(DIR, { recursive: true, force: true });
fs.mkdirSync(DIR, { recursive: true });

/** Las columnas de cada plantilla, en el mismo orden que en la aplicacion. */
const COLUMNAS = {
  terminal: [
    "EMPLEADO", "ALMUERZO",
    "AVIÓN", "PUERTA", "HORA ASIGNADO",
    "AVIÓN 2", "PUERTA 2", "HORA ASIGNADO 2",
    "AVIÓN 3", "PUERTA 3", "HORA ASIGNADO 3",
    "AVIÓN 4", "PUERTA 4", "HORA ASIGNADO 4",
    "NOTAS",
  ],
  hangar: [
    "EMPLEADO", "ESTADO",
    "AVIÓN", "PUERTA", "HORA ASIGNADO", "HORA SALIDA",
    "AVIÓN 2", "PUERTA 2", "HORA ASIGNADO 2", "HORA SALIDA 2",
    "AVIÓN 3", "PUERTA 3", "HORA ASIGNADO 3", "HORA SALIDA 3",
    "AVIÓN 4", "PUERTA 4", "HORA ASIGNADO 4", "HORA SALIDA 4",
    "NOTAS",
  ],
  nights: [
    "TIPO", "AVIÓN", "ESTACIÓN", "TRIPULACIÓN", "PUERTA",
    "FALLA DIFERIDA", "TÉCNICO AVX", "N.° EMPLEADO", "HORA ASIGNADO",
  ],
  custom: ["EMPLEADO", "AVIÓN", "PUERTA", "HORA ASIGNADO", "NOTAS"],
};

/** Manda una planilla a traducir y devuelve la que vuelve. */
async function traducir(doc, target) {
  const respuesta = await fetch(`${URL_BASE}/api/planilla`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ doc, target }),
  });
  const datos = await respuesta.json();
  if (!respuesta.ok) throw new Error(datos.error ?? `HTTP ${respuesta.status}`);
  return datos.doc;
}

/** Una planilla minima con esas columnas; la celda es un codigo, no pasa por la IA. */
function planillaCon(columns) {
  return {
    template: "custom",
    title: "DAILY ASSIGNMENT",
    meta: { date: "", shift: "", supervisor: "" },
    sections: [
      { title: "", columns, rows: [columns.map((_, indice) => (indice === 0 ? "N123AV" : ""))] },
    ],
  };
}

// ---------------------------------------------------------------------------
// 1. Los cuatro encabezados del informe
// ---------------------------------------------------------------------------

const PARES = [
  ["AVIÓN", "A/C"],
  ["HORA ASIGNADO", "ASSGN @"],
  ["HORA SALIDA", "ETD"],
  ["N.° EMPLEADO", "EMP #"],
];

const ingles = await traducir(planillaCon(PARES.map(([es]) => es)), "en");
const vuelta = await traducir(planillaCon(ingles.sections[0].columns), "es");

console.log("\n  español          ->  inglés      ->  vuelta");
PARES.forEach(([es, en], indice) => {
  const salida = ingles.sections[0].columns[indice];
  const regreso = vuelta.sections[0].columns[indice];
  console.log(`  ${es.padEnd(16)} ->  ${salida.padEnd(10)} ->  ${regreso}`);
  informe.comprobar(`${es} sale como ${en}`, salida === en, salida);
  informe.comprobar(`${en} vuelve como ${es}`, regreso === es, regreso);
});

// ---------------------------------------------------------------------------
// 2. Ida y vuelta de TODAS las columnas de TODAS las plantillas
// ---------------------------------------------------------------------------

for (const [nombre, columns] of Object.entries(COLUMNAS)) {
  const enIngles = await traducir(planillaCon(columns), "en");
  const enEspanol = await traducir(planillaCon(enIngles.sections[0].columns), "es");
  const regreso = enEspanol.sections[0].columns;

  const distintas = columns
    .map((columna, indice) => (columna === regreso[indice] ? null : `${columna} -> ${regreso[indice]}`))
    .filter(Boolean);

  informe.comprobar(
    `${nombre}: las ${columns.length} columnas vuelven igual`,
    distintas.length === 0,
    distintas.length ? distintas.join(" | ") : `${columns.length} columnas`,
  );

  informe.comprobar(
    `${nombre}: ninguna columna se queda en español`,
    !enIngles.sections[0].columns.some((columna) => /[ÁÉÍÓÚÑ]/i.test(columna)),
    enIngles.sections[0].columns.join(" · "),
  );
}

// Las columnas numeradas conservan su numero
informe.comprobar(
  "las columnas repetidas llevan su número",
  ingles.sections[0].columns.length === 4 &&
    (await traducir(planillaCon(["AVIÓN 3", "PUERTA 4", "HORA ASIGNADO 2"]), "en")).sections[0]
      .columns.join("|") === "A/C 3|GATE 4|ASSGN @ 2",
);

// ---------------------------------------------------------------------------
// 3. Las plantillas en la aplicacion, y su Excel
// ---------------------------------------------------------------------------

const navegador = await abrirNavegador();
const contexto = await navegador.newContext({
  viewport: { width: 1440, height: 1000 },
  acceptDownloads: true,
});
const page = await contexto.newPage();
page.on("pageerror", (error) => informe.anotarError(`error de página: ${error.message}`));
await page.goto(URL_BASE, { waitUntil: "domcontentloaded" });
await page.waitForTimeout(2000);
await page.getByRole("tab", { name: /Planillas/ }).click();
await page.waitForTimeout(400);

const rejilla = (indice = 0) => page.locator('[role="grid"]').nth(indice);
const encabezadosDe = (indice = 0) => rejilla(indice).locator('[data-celda^="-1:"]').allTextContents();

for (const [plantilla, columns] of Object.entries(COLUMNAS)) {
  await page.getByLabel("Plantilla").selectOption(plantilla);
  await page.waitForTimeout(350);
  const leidas = await encabezadosDe();
  informe.comprobar(
    `${plantilla}: la cuadrícula trae sus ${columns.length} columnas`,
    leidas.join("|") === columns.join("|"),
    `${leidas.length} columnas`,
  );
}

// --- Lo que viene de fábrica en la de noches ---
await page.getByLabel("Plantilla").selectOption("nights");
await page.waitForTimeout(400);

const filasDe = (indice) => rejilla(indice).locator("tbody tr").count();
informe.comprobar("PERSONAL DEL DÍA trae 17 filas", (await filasDe(1)) === 17, `${await filasDe(1)}`);
informe.comprobar("HORAS EXTRA trae 6 filas", (await filasDe(2)) === 6, `${await filasDe(2)}`);
informe.comprobar("VEHÍCULOS trae 7 filas", (await filasDe(3)) === 7, `${await filasDe(3)}`);

const celda = (bloque, fila, columna) =>
  rejilla(bloque).locator(`[data-celda="${fila}:${columna}"]`);

informe.comprobar(
  "el personal viene numerado del 1 al 17",
  (await celda(1, 0, 0).innerText()) === "1" && (await celda(1, 16, 0).innerText()) === "17",
  `${await celda(1, 0, 0).innerText()} .. ${await celda(1, 16, 0).innerText()}`,
);
informe.comprobar(
  "las horas extra vienen numeradas del 1 al 6",
  (await celda(2, 5, 0).innerText()) === "6",
  await celda(2, 5, 0).innerText(),
);
informe.comprobar(
  "la flota viene puesta con su unidad y su tipo",
  (await celda(3, 0, 0).innerText()) === "305142" &&
    (await celda(3, 0, 2).innerText()) === "DUAL CB" &&
    (await celda(3, 6, 0).innerText()) === "27565",
  `${await celda(3, 0, 0).innerText()} / ${await celda(3, 0, 2).innerText()}`,
);
informe.comprobar(
  "y el conductor queda en blanco para escribirlo",
  (await celda(3, 0, 1).innerText()).trim() === "",
);

// --- El .xlsx de la plantilla de noches (sin IA: todo son códigos) ---
await page.getByLabel("Fecha").fill("14/10/2026");

// Una fila de la tabla principal, toda de códigos y nombres: no llama a la IA.
const PRINCIPAL = ["P-2 / P-3", "N456AV", "MDE", "C-07", "C2", "MEL-21", "M. Gómez", "1062", "23:00"];
for (let columna = 0; columna < PRINCIPAL.length; columna += 1) {
  await celda(0, 0, columna).dblclick();
  await page.keyboard.type(PRINCIPAL[columna]);
  await page.keyboard.press("Enter");
}
await page.waitForTimeout(200);

await page.getByRole("button", { name: /Traducir y generar Excel/ }).click();
await page.waitForFunction(
  () =>
    [...document.querySelectorAll('[role="tab"][aria-selected="true"]')].some((pestana) =>
      pestana.textContent?.includes("inglés"),
    ),
  undefined,
  { timeout: 120000 },
);
await page.waitForTimeout(600);

informe.comprobar(
  "la plantilla de noches se traduce sin avisos",
  (await page.getByText(/no coinciden con el original/).count()) === 0,
);
informe.comprobar(
  "y sus encabezados salen en inglés",
  (await encabezadosDe()).join("|") ===
    "TYPE|A/C|STA|CREW|GATE|MEL/NEF|AVX TECH|EMP #|ASSGN @",
  (await encabezadosDe()).join(" · "),
);

const [descarga] = await Promise.all([
  page.waitForEvent("download", { timeout: 60000 }),
  page.getByRole("button", { name: "Descargar Excel" }).click(),
]);
const archivo = path.join(DIR, "noches.xlsx");
await descarga.saveAs(archivo);

const libro = new ExcelJS.Workbook();
await libro.xlsx.readFile(archivo);
const hoja = libro.worksheets[0];
informe.comprobar("el Excel se vuelve a abrir sin errores", Boolean(hoja), hoja?.name ?? "");

/** Busca la fila cuyo primer valor coincide. */
function filaCon(valor) {
  let encontrada = 0;
  hoja.eachRow((fila, numero) => {
    if (!encontrada && String(fila.getCell(1).value ?? "") === valor) encontrada = numero;
  });
  return encontrada;
}

const filaTipo = filaCon("TYPE");
informe.comprobar("el Excel trae la tabla principal", filaTipo > 0, `fila ${filaTipo}`);
informe.comprobar(
  "con sus nueve columnas",
  [1, 2, 3, 4, 5, 6, 7, 8, 9]
    .map((columna) => String(hoja.getRow(filaTipo).getCell(columna).value ?? ""))
    .join("|") === "TYPE|A/C|STA|CREW|GATE|MEL/NEF|AVX TECH|EMP #|ASSGN @",
);
informe.comprobar("el Excel trae el bloque de personal", filaCon("DAILY MANNING") > 0);
informe.comprobar("el de horas extra", filaCon("O/T & STANDBY") > 0);
informe.comprobar("y el de vehículos", filaCon("VEHICLE LIST") > 0);

const filaFlota = filaCon("UNIT");
informe.comprobar(
  "la flota llega entera al Excel",
  filaFlota > 0 &&
    String(hoja.getRow(filaFlota + 1).getCell(3).value ?? "") === "DUAL CB" &&
    String(hoja.getRow(filaFlota + 7).getCell(3).value ?? "") === "DUAL CB",
  `${hoja.getRow(filaFlota + 1).getCell(3).value} .. ${hoja.getRow(filaFlota + 7).getCell(3).value}`,
);

// --- Con tantas columnas, el celular sigue manejable ---
await page.getByLabel("Plantilla").selectOption("hangar");
await page.waitForTimeout(400);
await page.setViewportSize({ width: 390, height: 844 });
await page.waitForTimeout(400);

const medida = await page.evaluate(() => [
  document.documentElement.scrollWidth,
  window.innerWidth,
]);
informe.comprobar(
  "con 19 columnas la página no se desborda en el celular",
  medida[0] <= medida[1],
  `${medida[0]} / ${medida[1]}`,
);
informe.comprobar(
  "la tabla se desplaza de lado por dentro",
  await rejilla().evaluate((nodo) => nodo.scrollWidth > nodo.clientWidth + 20),
);
informe.comprobar(
  "y la primera columna se queda fija",
  await rejilla()
    .locator('[data-celda="0:0"]')
    .evaluate((nodo) => getComputedStyle(nodo).position === "sticky"),
);
await page.screenshot({ path: `${SALIDA}/plantillas-movil.png` });

await navegador.close();
informe.terminar();
