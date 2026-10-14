import { URL_BASE, abrirNavegador, crearInforme } from "./comun.mjs";

/**
 * Correos y planillas van separados.
 *
 * Son dos mundos distintos: los correos tienen su caja de texto y sus
 * guardados; las planillas, una cuadricula. Lo que se escribe en una no
 * aparece en la otra, no se pierde al cambiar de pestana, y la aplicacion
 * vuelve a abrirse donde se quedo.
 *
 * No usa la IA.
 */

const informe = crearInforme("Pestañas separadas");

const navegador = await abrirNavegador();
const contexto = await navegador.newContext({ viewport: { width: 1440, height: 950 } });
const page = await contexto.newPage();
page.on("pageerror", (error) => informe.anotarError(`error de página: ${error.message}`));

const GUARDADOS = [
  {
    id: "correo-1",
    preview: "Solicitud de repuesto para el flap",
    input: "solicitud de repuesto",
    output: "Estimado supervisor: solicito el repuesto del flap derecho.",
    lang: "es",
    action: "generate_email",
    textType: "email",
    tone: "professional",
    createdAt: Date.now(),
  },
];

await page.addInitScript(
  (items) => localStorage.setItem("paula:history", JSON.stringify(items)),
  GUARDADOS,
);

await page.goto(URL_BASE, { waitUntil: "domcontentloaded" });
await page.waitForTimeout(1500);

const correos = page.getByRole("tab", { name: /Correos/ });
const planillas = page.getByRole("tab", { name: /Planillas/ });
const caja = page.locator("#paula-input");
const guardados = () => page.locator("section:has-text('GUARDADOS') li");

informe.comprobar("hay dos pestañas", (await correos.count()) === 1 && (await planillas.count()) === 1);
informe.comprobar("abre en Correos", (await correos.getAttribute("aria-selected")) === "true");

// --- Cada pestaña guarda lo suyo ---
await caja.fill("quiero pedir permiso para el viernes");
await page.waitForTimeout(600);

informe.comprobar(
  "en Correos se ve lo guardado",
  (await guardados().count()) === 1 &&
    (await guardados().first().innerText()).includes("repuesto"),
);

await planillas.click();
await page.waitForTimeout(400);

informe.comprobar(
  "Planillas abre una cuadrícula, no una caja de texto",
  (await page.locator('[role="grid"]').count()) > 0 && !(await caja.isVisible()),
);
informe.comprobar(
  "en Planillas no están los tipos de correo",
  !(await page.getByLabel("Tipo de texto").isVisible()),
);
informe.comprobar(
  "ni las acciones rápidas de correo",
  !(await page.getByText("Acciones rápidas").first().isVisible()),
);
informe.comprobar(
  "ni los guardados, que son de correos",
  !(await guardados().first().isVisible()),
);
informe.comprobar(
  "el botón principal es el de traducir y generar el Excel",
  (await page.getByRole("button", { name: /Traducir y generar Excel/ }).isVisible()) &&
    !(await page.getByRole("button", { name: /Generar correo/ }).first().isVisible()),
);

// Se escribe en la cuadrícula para comprobar que sobrevive al cambio.
const primeraCelda = page.locator('[role="grid"]').first().locator('[data-celda="0:0"]');
await primeraCelda.click();
await page.keyboard.type("L. Ríos");
await page.keyboard.press("Enter");
await page.waitForTimeout(300);

await correos.click();
await page.waitForTimeout(400);
informe.comprobar(
  "al volver a Correos sigue el texto del correo",
  (await caja.inputValue()) === "quiero pedir permiso para el viernes",
  `"${await caja.inputValue()}"`,
);

await planillas.click();
await page.waitForTimeout(400);
informe.comprobar(
  "y la planilla tampoco se perdió",
  (await primeraCelda.innerText()) === "L. Ríos",
  await primeraCelda.innerText(),
);

// --- Al recargar se abre donde se quedó ---
await page.reload({ waitUntil: "domcontentloaded" });
await page.waitForTimeout(1500);

informe.comprobar(
  "al recargar vuelve a Planillas",
  (await page.getByRole("tab", { name: /Planillas/ }).getAttribute("aria-selected")) === "true",
);
informe.comprobar(
  "con la cuadrícula lista",
  (await page.locator('[role="grid"]').count()) > 0,
);

await page.getByRole("tab", { name: /Correos/ }).click();
await page.waitForTimeout(400);
informe.comprobar(
  "y el borrador del correo sigue guardado",
  (await page.locator("#paula-input").inputValue()) === "quiero pedir permiso para el viernes",
);

await navegador.close();
informe.terminar();
