import fs from "node:fs";
import path from "node:path";
import ExcelJSModulo from "exceljs";
import { SALIDA, URL_BASE, abrirNavegador, crearInforme } from "./comun.mjs";
import { leerDelZip, listarZip } from "./zip.mjs";
import { textoDelPdf } from "./pdf.mjs";

/**
 * El documento se escribe en el idioma del resultado.
 *
 * Un correo que salio en ingles tiene que descargarse con "Subject:",
 * "Page 1 of 1" y la fecha en ingles; uno en espanol, con "Asunto:" y
 * "Página 1 de 1". Tambien se comprueban el logo de American Airlines, el
 * interruptor para quitarlo y el Excel de un reporte.
 *
 * No usa la IA: los textos vienen sembrados en lo guardado.
 */

const ExcelJS = ExcelJSModulo.default ?? ExcelJSModulo;
const informe = crearInforme("Documentos: idioma, logo y Excel");
const DIR = path.join(SALIDA, "idioma");
fs.rmSync(DIR, { recursive: true, force: true });
fs.mkdirSync(DIR, { recursive: true });

const navegador = await abrirNavegador();
const contexto = await navegador.newContext({
  viewport: { width: 1440, height: 950 },
  acceptDownloads: true,
});
const page = await contexto.newPage();
page.on("pageerror", (error) => informe.anotarError(`error de página: ${error.message}`));

const HISTORIAL = [
      {
        id: "ingles",
        preview: "Landing gear inspection",
        input: "inspeccion del tren de aterrizaje",
        output:
          "Dear Supervisor,\n\nThe landing gear inspection on aircraft N123AV was completed on March 12. Wear was found on the right shock strut, so we request authorization to replace the part.\n\nBest regards,",
        subject: "Landing gear inspection report",
        lang: "en",
        action: "to_english",
        textType: "email",
        tone: "professional",
        createdAt: Date.now(),
      },
      {
        id: "espanol",
        preview: "Inspeccion del tren de aterrizaje",
        input: "notas del turno",
        output:
          "Estimado supervisor:\n\nLe informo que la inspección del tren de aterrizaje del avión N123AV se realizó el 12 de marzo.\n\nAtentamente,",
        subject: "Inspección del tren de aterrizaje",
        lang: "es",
        action: "generate_email",
        textType: "email",
        tone: "professional",
        createdAt: Date.now() - 60000,
      },
      {
        id: "reporte",
        preview: "Shift report",
        input: "reporte del turno",
        output: [
          "Aircraft N123AV was released at 07:30.",
          "Deferred defect MEL-21 remains open.",
          "No further discrepancies were found.",
        ].join("\n\n"),
        lang: "en",
        action: "to_english",
        textType: "report",
        tone: "professional",
        createdAt: Date.now() - 120000,
      },
];

const sembrar = (page) =>
  page.addInitScript(
    (items) => localStorage.setItem("paula:history", JSON.stringify(items)),
    HISTORIAL,
  );

await sembrar(page);
await page.goto(URL_BASE, { waitUntil: "domcontentloaded" });
// La firma de serie se procesa al abrir: hay que dejarla llegar.
await page.waitForTimeout(3500);

async function bajar(nombre, archivo) {
  const [descarga] = await Promise.all([
    page.waitForEvent("download", { timeout: 60000 }),
    page.getByRole("button", { name: nombre, exact: true }).click(),
  ]);
  const destino = path.join(DIR, archivo);
  await descarga.saveAs(destino);
  return destino;
}

/** Texto plano del cuerpo y del pie de un .docx. */
function leerDocx(ruta) {
  const limpiar = (xml) => xml.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");
  return {
    cuerpo: limpiar(leerDelZip(ruta, "word/document.xml").toString("utf8")),
    pie: limpiar(leerDelZip(ruta, "word/footer1.xml").toString("utf8")),
    archivos: listarZip(ruta),
  };
}

// --- Resultado en ingles ---
await page.getByRole("button", { name: /Landing gear inspection/ }).first().click();
await page.waitForTimeout(500);

const docxEn = leerDocx(await bajar("Word", "ingles.docx"));
informe.comprobar("el Word en inglés dice Subject", /Subject:/.test(docxEn.cuerpo));
informe.comprobar("y no dice Asunto", !/Asunto/.test(docxEn.cuerpo));
informe.comprobar(
  "el título del documento está en inglés",
  /EMAIL/.test(docxEn.cuerpo) && !/CORREO/.test(docxEn.cuerpo),
);
informe.comprobar(
  "la fecha sale en inglés",
  /January|February|March|April|May|June|July|August|September|October|November|December/.test(
    docxEn.cuerpo,
  ),
);
informe.comprobar(
  "el pie numera en inglés",
  /Page/.test(docxEn.pie) && / of /.test(docxEn.pie) && !/Página/.test(docxEn.pie),
);

const imagenes = docxEn.archivos.filter((nombre) => /^word\/media\/.+/i.test(nombre));
informe.comprobar(
  "el Word lleva el logo y la firma",
  imagenes.length >= 2,
  `${imagenes.length} imagen(es)`,
);

const pdfEn = textoDelPdf(await bajar("PDF", "ingles.pdf"));
informe.comprobar("el PDF en inglés dice Subject", /Subject:/.test(pdfEn));
informe.comprobar("el PDF en inglés numera Page 1 of 1", /Page 1 of 1/.test(pdfEn));
informe.comprobar("el PDF en inglés no dice Página", !/P.gina/.test(pdfEn));

// --- Resultado en espanol ---
await page.getByRole("button", { name: /Inspeccion del tren/ }).first().click();
await page.waitForTimeout(500);

const docxEs = leerDocx(await bajar("Word", "espanol.docx"));
informe.comprobar("el Word en español dice Asunto", /Asunto:/.test(docxEs.cuerpo));
informe.comprobar("y no dice Subject", !/Subject:/.test(docxEs.cuerpo));
informe.comprobar("el pie numera en español", /P.gina/.test(docxEs.pie) && / de /.test(docxEs.pie));

const pdfEs = textoDelPdf(await bajar("PDF", "espanol.pdf"));
informe.comprobar("el PDF en español dice Asunto", /Asunto:/.test(pdfEs));
informe.comprobar("el PDF en español numera Página 1 de 1", /P.gina 1 de 1/.test(pdfEs));

// --- El logo se puede quitar ---
await page.getByLabel(/Incluir el logo/).uncheck();
await page.waitForTimeout(300);
const sinLogo = leerDocx(await bajar("Word", "sin-logo.docx"));
const imagenesSinLogo = sinLogo.archivos.filter((nombre) => /^word\/media\/.+/i.test(nombre));
informe.comprobar(
  "al quitar el logo solo queda la firma",
  imagenesSinLogo.length === imagenes.length - 1,
  `${imagenesSinLogo.length} imagen(es)`,
);

// --- Un reporte tambien se baja a Excel, numerado ---
await page.getByRole("button", { name: /Shift report/ }).first().click();
await page.waitForTimeout(400);

const [excel] = await Promise.all([
  page.waitForEvent("download", { timeout: 60000 }),
  page.getByRole("button", { name: "Excel", exact: true }).click(),
]);
const hojaReporte = path.join(DIR, "reporte.xlsx");
await excel.saveAs(hojaReporte);

const libro = new ExcelJS.Workbook();
await libro.xlsx.readFile(hojaReporte);
const hoja = libro.worksheets[0];
let cabecera = 0;
hoja.eachRow((fila, numero) => {
  if (!cabecera && String(fila.getCell(1).value ?? "") === "#") cabecera = numero;
});
informe.comprobar("el reporte sale como tabla # / Description", cabecera > 0);
if (cabecera > 0) {
  informe.comprobar(
    "la segunda columna se llama Description",
    String(hoja.getRow(cabecera).getCell(2).value ?? "") === "Description",
  );
  informe.comprobar(
    "cada párrafo es una fila numerada",
    hoja.getRow(cabecera + 1).getCell(1).value === 1 &&
      String(hoja.getRow(cabecera + 1).getCell(2).value ?? "").includes("N123AV"),
  );
}

// --- Si el logo no se puede leer, el documento sale igual ---
const otro = await navegador.newContext({
  viewport: { width: 1440, height: 950 },
  acceptDownloads: true,
});
const pagina = await otro.newPage();
pagina.on("pageerror", (error) => informe.anotarError(`error de página: ${error.message}`));
await pagina.route("**/logo-american-airlines.png", (ruta) => ruta.abort());
await sembrar(pagina);
await pagina.goto(URL_BASE, { waitUntil: "domcontentloaded" });
await pagina.waitForTimeout(3000);
await pagina.getByRole("button", { name: /Landing gear inspection/ }).first().click();
await pagina.waitForTimeout(400);

const [descarga] = await Promise.all([
  pagina.waitForEvent("download", { timeout: 60000 }),
  pagina.getByRole("button", { name: "Word", exact: true }).click(),
]);
const sinRed = path.join(DIR, "sin-red.docx");
await descarga.saveAs(sinRed);
const contenido = leerDocx(sinRed);
informe.comprobar(
  "sin logo disponible el Word se descarga igual",
  /Subject:/.test(contenido.cuerpo),
);

await navegador.close();
informe.terminar();
