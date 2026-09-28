import { SALIDA, URL_BASE, abrirNavegador, crearInforme, esperarResultado, leerResultado } from "./comun.mjs";

/**
 * Genera un correo y comprueba que el Word y el PDF salen con el formato
 * de documento formal y la firma. Usa la IA.
 */

const informe = crearInforme("Word y PDF");
import fs from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";

const DIR = path.join(SALIDA, "docs");
fs.rmSync(DIR, { recursive: true, force: true });
fs.mkdirSync(DIR, { recursive: true });

const navegador = await abrirNavegador();
const context = await navegador.newContext({
  viewport: { width: 1440, height: 950 },
  acceptDownloads: true,
});
const page = await context.newPage();
page.on("pageerror", (e) => informe.anotarError(`pageerror: ${e.message}`));
await page.goto(URL_BASE, { waitUntil: "networkidle" });

// Firma con cargo, como la usaria un tecnico
await page.getByLabel("Tu firma", { exact: true }).fill("Paula Andrea Ochoa\nAdministradora\nMantenimiento aeronáutico");
await page.waitForTimeout(400);

await page.fill(
  "#paula-input",
  "informar al supervisor que la inspeccion del tren de aterrizaje del avion HK-4721 se realizo el 12 de marzo y que se encontro desgaste en el amortiguador derecho, por lo que se solicita autorizacion para reemplazarlo",
);
await page.getByRole("button", { name: "Generar correo" }).first().click();
await page.waitForFunction(
  () => {
    const el = document.querySelector('[role="status"]');
    return el && /Listo|Error/.test(el.textContent || "");
  },
  undefined,
  { timeout: 120000 },
);
await page.waitForTimeout(500);

const correo = await page.locator("p.whitespace-pre-wrap").first().textContent();
console.log(`\n--- correo generado ---\n${correo}\n`);

async function bajar(nombre, ext) {
  const [download] = await Promise.all([
    page.waitForEvent("download", { timeout: 60000 }),
    page.getByRole("button", { name: nombre }).click(),
  ]);
  const destino = path.join(DIR, `documento.${ext}`);
  await download.saveAs(destino);
  return destino;
}

const docx = await bajar("Word", "docx");
const pdf = await bajar("PDF", "pdf");
console.log(`Word ${(fs.statSync(docx).size / 1024).toFixed(0)} KB · PDF ${(fs.statSync(pdf).size / 1024).toFixed(0)} KB`);

// Contenido del Word
const xml = execSync(`unzip -p "${docx}" word/document.xml`, { encoding: "utf8" });
const plano = xml.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");
informe.comprobar("el Word lleva el nombre una sola vez", (plano.match(/Paula Andrea Ochoa/g) || []).length === 1);
informe.comprobar("el Word lleva el cargo", /Administradora/.test(plano));
informe.comprobar("el Word lleva la fecha", /de \d{4}/.test(plano));
informe.comprobar("el Word numera las páginas", /P.gina/.test(execSync(`unzip -l "${docx}"`, { encoding: "utf8" })) || /footer/.test(execSync(`unzip -l "${docx}"`, { encoding: "utf8" })));

// Vista del PDF renderizado
await page.goto(`file:///${pdf.replace(/\\/g, "/")}`);
await page.waitForTimeout(3500);
await page.screenshot({ path: `${SALIDA}/documento-pdf.png` });

await navegador.close();
informe.terminar();
