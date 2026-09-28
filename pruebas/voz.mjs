import { SALIDA, URL_BASE, abrirNavegador, crearInforme, esperarResultado, leerResultado } from "./comun.mjs";

/**
 * El boton de dictar, la grabacion y la transcripcion de un audio real.
 * Usa la IA.
 */

const informe = crearInforme("Dictado por voz");
import fs from "node:fs";

// 1) La ruta /api/transcribe con un WAV de verdad (voz generada por Windows).
const wav = `${SALIDA}/voz.wav`;
if (fs.existsSync(wav)) {
  const buffer = fs.readFileSync(wav);
  const form = new FormData();
  form.append("audio", new Blob([buffer], { type: "audio/wav" }), "voz.wav");
  form.append("lang", "es");
  const response = await fetch("http://localhost:3000/api/transcribe", {
    method: "POST",
    body: form,
  });
  const data = await response.json();
  console.log(`transcripción -> ${JSON.stringify(data)}`);
  informe.comprobar("la API transcribe audio real", response.ok && typeof data.text === "string" && data.text.length > 5);
} else {
  console.log("(sin voz.wav: se omite la prueba de la API)");
}

// 2) La interfaz: grabar, medidor, parar y transcribir.
const navegador = await abrirNavegador({
  args: [
    "--use-fake-ui-for-media-stream",
    "--use-fake-device-for-media-stream",
    "--autoplay-policy=no-user-gesture-required",
  ],
});
const context = await navegador.newContext({
  viewport: { width: 1440, height: 950 },
  permissions: ["microphone"],
});
const page = await context.newPage();
page.on("pageerror", (e) => informe.anotarError(`pageerror: ${e.message}`));
await page.goto(URL_BASE, { waitUntil: "networkidle" });

informe.comprobar("el botón Dictar existe", await page.getByRole("button", { name: "Dictar" }).isVisible());

await page.getByRole("button", { name: "Dictar" }).click();
await page.waitForTimeout(2500);

informe.comprobar("entra en modo grabación", await page.getByRole("button", { name: "Grabando" }).isVisible());
const reloj = await page.locator("span.font-mono").first().textContent();
informe.comprobar("muestra el cronómetro", /^\s*0\d:\d\d\s*$/.test(reloj || ""), reloj);
informe.comprobar("hay botón para descartar", await page.getByRole("button", { name: /Descartar/ }).count() > 0);
await page.screenshot({ path: `${SALIDA}/grabando.png` });

await page.getByRole("button", { name: "Listo" }).click();
await page.waitForTimeout(600);

// El micrófono falso emite un tono, no voz: el trozo se descarta sin enviarlo
// a la IA y la interfaz debe volver al reposo sin romperse.
await page.waitForFunction(
  () => !document.body.textContent.includes("Pasando tu voz a texto"),
  undefined,
  { timeout: 90000 },
);
informe.comprobar("termina y vuelve a Dictar", await page.getByRole("button", { name: "Dictar" }).isVisible());

await navegador.close();
informe.terminar();
