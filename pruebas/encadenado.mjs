import { SALIDA, URL_BASE, abrirNavegador, crearInforme, esperarResultado, leerResultado } from "./comun.mjs";

/**
 * Traducir y despues generar el correo tiene que seguir en el mismo idioma:
 * cada resultado es el punto de partida del siguiente. Usa la IA.
 */

const informe = crearInforme("Encadenado de acciones");

const navegador = await abrirNavegador();
const page = await (
  await navegador.newContext({ viewport: { width: 1440, height: 950 } })
).newPage();
page.on("pageerror", (e) => informe.anotarError(`pageerror: ${e.message}`));
await page.goto(URL_BASE, { waitUntil: "networkidle" });

const esperar = () =>
  page.waitForFunction(
    () => {
      const el = document.querySelector('[role="status"]');
      return el && /Listo|Error/.test(el.textContent || "");
    },
    undefined,
    { timeout: 120000 },
  );
const resultado = () => page.locator("p.whitespace-pre-wrap").first().textContent();
const entrada = () => page.inputValue("#paula-input");

// --- Paso 1: escribir en español y traducir al inglés ---
await page.fill("#paula-input", "hola como estas, ya estamos listos para la reunion del viernes");
await page.waitForTimeout(300);
await page.getByRole("button", { name: /Traducir a inglés/ }).click();
await esperar();
await page.waitForTimeout(400);

const ingles = (await resultado()) || "";
console.log(`\n1) traducción: ${ingles}`);
informe.comprobar("traduce al inglés", /ready|meeting|Friday/i.test(ingles));
informe.comprobar("el texto de trabajo pasa a ser la traducción", (await entrada()).trim() === ingles.trim());
informe.comprobar(
  "el idioma de origen cambia a English",
  await page
    .getByRole("radiogroup", { name: "Idioma en el que escribo" })
    .getByRole("radio", { name: "English", checked: true })
    .isVisible()
    .catch(() => false),
);
informe.comprobar(
  "ahora el botón traduce de vuelta al español",
  await page.getByRole("button", { name: /Traducir a español/ }).isVisible(),
);
informe.comprobar("aparece Deshacer", await page.getByRole("button", { name: /Deshacer/ }).isVisible());
await page.screenshot({ path: `${SALIDA}/encadenar-1.png` });

// --- Paso 2: generar correo, que debe salir EN INGLÉS ---
await page.getByRole("button", { name: "Generar correo" }).first().click();
await esperar();
await page.waitForTimeout(400);

const correo = (await resultado()) || "";
console.log(`\n2) correo generado:\n${correo}\n`);
informe.comprobar(
  "el correo se genera en inglés",
  /\b(Dear|Hello|Hi|Best regards|Kind regards|Sincerely)\b/i.test(correo),
);
informe.comprobar(
  "no se fue al español",
  !/\b(Estimado|Hola|Atentamente|Cordialmente|saludos)\b/i.test(correo),
);
await page.screenshot({ path: `${SALIDA}/encadenar-2.png` });

// --- Paso 3: deshacer devuelve el texto anterior ---
await page.getByRole("button", { name: /Deshacer/ }).click();
await page.waitForTimeout(400);
informe.comprobar("Deshacer devuelve el texto anterior", (await entrada()).trim() === ingles.trim(), (await entrada()).slice(0, 60));

await navegador.close();
informe.terminar();
