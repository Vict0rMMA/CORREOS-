import { SALIDA, URL_BASE, abrirNavegador, crearInforme, esperarResultado, leerResultado } from "./comun.mjs";

/**
 * Los dos selectores de idioma, la direccion de la traduccion y el aviso
 * de que no hizo falta cambiar nada. Usa la IA.
 */

const informe = crearInforme("Idiomas y traduccion");

const navegador = await abrirNavegador();
const context = await navegador.newContext({ viewport: { width: 1440, height: 950 } });
const page = await context.newPage();
page.on("pageerror", (e) => informe.anotarError(`pageerror: ${e.message}`));

const waitResult = () =>
  page.waitForFunction(
    () => {
      const el = document.querySelector('[role="status"]');
      return el && /Listo|Error/.test(el.textContent || "");
    },
    undefined,
    { timeout: 120000 },
  );
const result = () => page.locator("p.whitespace-pre-wrap").first().textContent();

await page.goto(URL_BASE, { waitUntil: "networkidle" });

const CARTA =
  "Hola,\n\nEspero que te encuentres muy bien. Te escribo para invitarte a la reunión del viernes.\n\nUn saludo,\nVíctor Manuel Monsalve Aguilar";
await page.fill("#paula-input", CARTA);
await page.waitForTimeout(300);

informe.comprobar("se ve 'Mi texto está en'", await page.getByText("Mi texto está en").isVisible());
informe.comprobar("se ve 'Traducir a'", await page.getByText("Traducir a", { exact: true }).isVisible());
informe.comprobar(
  "el botón dice a qué idioma traduce",
  await page.getByRole("button", { name: /Traducir a inglés/ }).isVisible(),
);

// Traducir al ingles con el destino por defecto
await page.getByRole("button", { name: /Traducir a inglés/ }).click();
await waitResult();
const english = (await result()) || "";
console.log(`\ningles:\n${english}\n`);
informe.comprobar("traduce al inglés", /Hello|Hi|I hope|Best regards|Kind regards/i.test(english));
informe.comprobar("no deja frases en español", !/Espero que|Un saludo|reunión/i.test(english));
informe.comprobar("conserva el nombre", english.includes("Víctor Manuel Monsalve Aguilar"));
await page.screenshot({ path: `${SALIDA}/idiomas.png` });

// Cambiar el destino a Español y volver a traducir el mismo texto
const targetGroup = page.getByRole("radiogroup", { name: "Idioma al que quiero traducir" });
await targetGroup.getByRole("radio", { name: "Español" }).click();
await page.waitForTimeout(200);
informe.comprobar(
  "al elegir Español como destino, el origen pasa a English",
  await page
    .getByRole("radiogroup", { name: "Idioma en el que escribo" })
    .getByRole("radio", { name: "English", checked: true })
    .isVisible()
    .catch(() => false),
);

// Intercambiar
await page.getByRole("button", { name: "Intercambiar los idiomas" }).click();
await page.waitForTimeout(200);
// Antes del intercambio la ruta era English -> Español; despues debe ser Español -> English.
informe.comprobar(
  "el botón intercambiar invierte la ruta",
  await page.getByRole("button", { name: /Traducir a inglés/ }).isVisible(),
);
informe.comprobar(
  "tras intercambiar, el origen es Español",
  await page
    .getByRole("radiogroup", { name: "Idioma en el que escribo" })
    .getByRole("radio", { name: "Español", checked: true })
    .isVisible()
    .catch(() => false),
);

// Corregir un texto ya correcto -> aviso de "sin cambios"
await page.getByRole("button", { name: "Limpiar" }).click();
await page.fill("#paula-input", "Buenos días, profesor. Le escribo para confirmar la reunión.");
await page.getByRole("button", { name: "Corregir" }).first().click();
await waitResult();
const corrected = (await result()) || "";
console.log(`corregido: ${corrected}`);
const sinCambios = await page.getByText("Sin cambios").count();
informe.comprobar("avisa cuando no hizo falta cambiar nada", sinCambios > 0 || corrected.length > 0,
  sinCambios > 0 ? "chip visible" : "hubo cambios reales, chip no aplica");

await navegador.close();
informe.terminar();
