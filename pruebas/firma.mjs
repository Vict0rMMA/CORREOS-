import fs from "node:fs";
import path from "node:path";
import {
  SALIDA,
  URL_BASE,
  abrirNavegador,
  crearInforme,
  esperarResultado,
} from "./comun.mjs";
import { listarZip } from "./zip.mjs";

/**
 * La firma viene de serie en `public/firma.png`: la aplicacion la procesa sola
 * (recorte a la tinta, fondo transparente, sin la raya del papel) y la dibuja
 * sobre la linea en el Word, el PDF y la impresion.
 *
 * Tambien se comprueba el boton "Con firma", que copia el texto con la firma
 * escrita al final para pegarlo en el correo. Usa la IA una vez.
 */

const informe = crearInforme("Firma");
const DIR = path.join(SALIDA, "firma");
fs.rmSync(DIR, { recursive: true, force: true });
fs.mkdirSync(DIR, { recursive: true });

const navegador = await abrirNavegador();
const contexto = await navegador.newContext({
  viewport: { width: 1440, height: 950 },
  acceptDownloads: true,
  permissions: ["clipboard-read", "clipboard-write"],
});
const page = await contexto.newPage();
page.on("pageerror", (error) => informe.anotarError(`error de página: ${error.message}`));
await page.goto(URL_BASE, { waitUntil: "domcontentloaded" });
await page.waitForTimeout(3500);

// --- La firma de serie se carga y se procesa sola ---
const firma = await page.evaluate(() =>
  JSON.parse(localStorage.getItem("paula:firma-imagen-2") || "null"),
);
informe.comprobar("la firma viene puesta de serie", firma !== null);
informe.comprobar("se ve en la pantalla", await page.getByAltText("Tu firma").isVisible());
informe.comprobar(
  "no hay que subirla a mano",
  (await page.getByRole("button", { name: /firma escaneada/ }).count()) === 0,
);

if (firma) {
  const analisis = await page.evaluate(async (datos) => {
    const imagen = new Image();
    await new Promise((listo) => {
      imagen.onload = listo;
      imagen.src = datos.dataUrl;
    });
    const canvas = document.createElement("canvas");
    canvas.width = imagen.width;
    canvas.height = imagen.height;
    const ctx = canvas.getContext("2d");
    ctx.drawImage(imagen, 0, 0);
    const pixeles = ctx.getImageData(0, 0, canvas.width, canvas.height).data;

    let opacos = 0;
    for (let i = 3; i < pixeles.length; i += 4) if (pixeles[i] > 40) opacos += 1;

    // Una raya del papel seria una fila casi entera con tinta.
    let filaLlena = false;
    for (let y = 0; y < canvas.height; y += 1) {
      let seguidos = 0;
      for (let x = 0; x < canvas.width; x += 1) {
        seguidos = pixeles[(y * canvas.width + x) * 4 + 3] > 40 ? seguidos + 1 : 0;
        if (seguidos > canvas.width * 0.8) filaLlena = true;
      }
    }

    return {
      esquina: ctx.getImageData(0, 0, 1, 1).data[3],
      tinta: opacos / (pixeles.length / 4),
      filaLlena,
    };
  }, firma);

  informe.comprobar("el papel del fondo queda transparente", analisis.esquina === 0);
  informe.comprobar(
    "queda el trazo, no la hoja",
    analisis.tinta > 0.01 && analisis.tinta < 0.5,
    `${(analisis.tinta * 100).toFixed(1)}% es tinta`,
  );
  informe.comprobar("se quita la raya del papel", !analisis.filaLlena);
}

// --- Copiar con la firma al final ---
await page.fill("#paula-input", "le confirmo que la inspeccion quedo aprobada");
await page.getByRole("button", { name: /^Corregir/ }).first().click();
await esperarResultado(page);

await page.getByRole("button", { name: /^Copiar$/ }).click();
await page.waitForTimeout(400);
const normal = await page.evaluate(() => navigator.clipboard.readText());

await page.getByRole("button", { name: /Con firma/ }).click();
await page.waitForTimeout(400);
const conFirma = await page.evaluate(() => navigator.clipboard.readText());

informe.comprobar("copiar normal no añade la firma", !/Paula/i.test(normal));
informe.comprobar(
  "copiar con firma la añade al final",
  /Paula/i.test(conFirma) && conFirma.length > normal.length,
);

// --- Y llega a los documentos ---
async function bajar(nombre, extension) {
  const [descarga] = await Promise.all([
    page.waitForEvent("download", { timeout: 60000 }),
    page.getByRole("button", { name: nombre }).click(),
  ]);
  const destino = path.join(DIR, `documento.${extension}`);
  await descarga.saveAs(destino);
  return destino;
}

const docx = await bajar("Word", "docx");
const pdf = await bajar("PDF", "pdf");

const dentro = listarZip(docx);
informe.comprobar(
  "el Word lleva la firma dibujada",
  dentro.some((nombre) => /^word\/media\/.*\.png$/i.test(nombre)),
);
informe.comprobar(
  "el PDF lleva la firma dibujada",
  /\/Subtype\s*\/Image/.test(fs.readFileSync(pdf).toString("latin1")),
);

await navegador.close();
informe.terminar();
