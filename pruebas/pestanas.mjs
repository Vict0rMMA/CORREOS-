import { URL_BASE, abrirNavegador, crearInforme } from "./comun.mjs";

/**
 * Correos y planillas van separados.
 *
 * Son dos pestanas distintas: lo que se escribe en una no aparece en la otra,
 * cada una guarda su borrador, cada una enseña solo sus guardados y la
 * aplicacion vuelve a abrirse en la pestana en la que se quedo.
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
  {
    id: "planilla-1",
    preview: "Night shift assignment sheet",
    input: "planilla del turno",
    output: "EMPLOYEE\tA/C\nJ. Pérez\tN123AV",
    lang: "en",
    action: "to_english",
    textType: "sheet",
    tone: "professional",
    createdAt: Date.now() - 60000,
    table: {
      title: "Night shift assignment sheet",
      meta: {},
      columns: ["EMPLOYEE", "A/C"],
      rows: [["J. Pérez", "N123AV"]],
    },
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
  "en Correos solo se ve lo guardado de correos",
  (await guardados().count()) === 1 &&
    (await guardados().first().innerText()).includes("repuesto"),
);

await planillas.click();
await page.waitForTimeout(400);

informe.comprobar(
  "al pasar a Planillas la caja está vacía",
  (await caja.inputValue()) === "",
  `"${await caja.inputValue()}"`,
);
informe.comprobar(
  "en Planillas no están los tipos de correo",
  (await page.getByLabel("Tipo de texto").count()) === 0,
);
informe.comprobar(
  "ni las acciones rápidas de correo",
  (await page.getByText("Acciones rápidas").count()) === 0,
);
informe.comprobar(
  "las acciones son Traducir y Organizar",
  (await page.getByRole("button", { name: /Organizar/ }).count()) === 1 &&
    (await page.getByRole("button", { name: /Generar correo/ }).count()) === 0,
);
informe.comprobar(
  "en Planillas solo se ven las planillas guardadas",
  (await guardados().count()) === 1 &&
    (await guardados().first().innerText()).includes("Night shift"),
);

await caja.fill("EMPLEADO\tAVIÓN\nJ. Pérez\tN123AV");
await page.waitForTimeout(600);

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
  (await caja.inputValue()).startsWith("EMPLEADO"),
  `"${await caja.inputValue()}"`,
);

// --- Al recargar se abre donde se quedó ---
await page.reload({ waitUntil: "domcontentloaded" });
await page.waitForTimeout(1500);

informe.comprobar(
  "al recargar vuelve a Planillas",
  (await page.getByRole("tab", { name: /Planillas/ }).getAttribute("aria-selected")) === "true",
);
informe.comprobar(
  "con su borrador intacto",
  (await page.locator("#paula-input").inputValue()).startsWith("EMPLEADO"),
);

await page.getByRole("tab", { name: /Correos/ }).click();
await page.waitForTimeout(400);
informe.comprobar(
  "y el borrador del correo sigue guardado",
  (await page.locator("#paula-input").inputValue()) === "quiero pedir permiso para el viernes",
);

await navegador.close();
informe.terminar();
