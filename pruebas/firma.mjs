import fs from "node:fs";
import path from "node:path";
import { listarZip } from "./zip.mjs";
import {
  SALIDA,
  URL_BASE,
  abrirNavegador,
  crearInforme,
  esperarResultado,
} from "./comun.mjs";

/**
 * Firma escaneada: subirla, que se le quite el papel de fondo y que salga
 * dibujada sobre la linea en el Word y en el PDF. Usa la IA una vez.
 */

const informe = crearInforme("Firma escaneada");
const DIR = path.join(SALIDA, "firma");
fs.rmSync(DIR, { recursive: true, force: true });
fs.mkdirSync(DIR, { recursive: true });

const navegador = await abrirNavegador();
const contexto = await navegador.newContext({
  viewport: { width: 1440, height: 950 },
  acceptDownloads: true,
});
const page = await contexto.newPage();
page.on("pageerror", (error) => informe.anotarError(`error de página: ${error.message}`));
await page.goto(URL_BASE, { waitUntil: "networkidle" });

// Firma de prueba: trazo azul sobre papel gris con grano, como un escaneo real.
await page.evaluate(async () => {
  const canvas = document.createElement("canvas");
  canvas.width = 900;
  canvas.height = 260;
  const ctx = canvas.getContext("2d");

  ctx.fillStyle = "#dedcd6";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  const grano = ctx.getImageData(0, 0, canvas.width, canvas.height);
  for (let i = 0; i < grano.data.length; i += 4) {
    const ruido = (Math.random() - 0.5) * 18;
    grano.data[i] += ruido;
    grano.data[i + 1] += ruido;
    grano.data[i + 2] += ruido;
  }
  ctx.putImageData(grano, 0, 0);

  ctx.strokeStyle = "#1f3a93";
  ctx.lineWidth = 7;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(120, 170);
  ctx.bezierCurveTo(180, 60, 250, 210, 320, 120);
  ctx.bezierCurveTo(390, 40, 430, 200, 500, 140);
  ctx.bezierCurveTo(560, 90, 620, 190, 700, 110);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(140, 200);
  ctx.lineTo(720, 196);
  ctx.lineWidth = 3;
  ctx.stroke();

  const blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/png"));
  const transferencia = new DataTransfer();
  transferencia.items.add(new File([blob], "firma.png", { type: "image/png" }));
  window.__firma = transferencia.files;
});

await page.evaluate(() => {
  const input = document.querySelector('input[aria-label="Subir una foto de tu firma"]');
  Object.defineProperty(input, "files", { value: window.__firma, configurable: true });
  input.dispatchEvent(new Event("change", { bubbles: true }));
});
await page.waitForTimeout(1500);

informe.comprobar(
  "la firma subida se ve en la pantalla",
  await page.getByAltText("Tu firma escaneada").isVisible(),
);

// El papel tiene que haber quedado transparente
const analisis = await page.evaluate(async () => {
  const guardada = JSON.parse(localStorage.getItem("paula:firma-imagen") || "null");
  if (!guardada) return null;
  const imagen = new Image();
  await new Promise((listo) => {
    imagen.onload = listo;
    imagen.src = guardada.dataUrl;
  });
  const canvas = document.createElement("canvas");
  canvas.width = imagen.width;
  canvas.height = imagen.height;
  const ctx = canvas.getContext("2d");
  ctx.drawImage(imagen, 0, 0);
  const datos = ctx.getImageData(0, 0, canvas.width, canvas.height).data;

  let opacos = 0;
  for (let i = 3; i < datos.length; i += 4) if (datos[i] > 40) opacos += 1;
  const esquina = ctx.getImageData(0, 0, 1, 1).data[3];
  return { ancho: canvas.width, alto: canvas.height, esquina, tinta: opacos / (datos.length / 4) };
});

informe.comprobar("queda guardada", analisis !== null);
informe.comprobar("el papel de fondo queda transparente", analisis?.esquina === 0, `alfa ${analisis?.esquina}`);
informe.comprobar(
  "queda el trazo, no la hoja entera",
  analisis !== null && analisis.tinta > 0.005 && analisis.tinta < 0.5,
  `${((analisis?.tinta ?? 0) * 100).toFixed(1)}% de la imagen es tinta`,
);
informe.comprobar(
  "se recorta a la firma",
  analisis !== null && analisis.ancho < 900,
  `${analisis?.ancho}x${analisis?.alto}`,
);

// Genera un correo y descarga los documentos
await page.fill("#paula-input", "avisar al supervisor que la inspeccion quedo aprobada");
await page.getByRole("button", { name: "Generar correo" }).first().click();
await esperarResultado(page);

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
  "el Word lleva la firma como imagen",
  dentro.some((nombre) => /^word\/media\/.*\.png$/i.test(nombre)),
  dentro.filter((n) => n.includes("media")).join(", "),
);

const bytes = fs.readFileSync(pdf).toString("latin1");
informe.comprobar("el PDF lleva la firma como imagen", /\/Subtype\s*\/Image/.test(bytes));

// Vista del PDF, para mirarlo
await page.goto(`file:///${pdf.replace(/\\/g, "/")}`);
await page.waitForTimeout(3500);
await page.screenshot({ path: `${SALIDA}/firma-en-pdf.png` });

await navegador.close();
informe.terminar();
