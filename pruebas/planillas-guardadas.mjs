import { readFileSync } from "node:fs";
import { URL_BASE, abrirNavegador, crearInforme } from "./comun.mjs";

/**
 * La pestana Guardadas: cada planilla que se hace queda ahi, con su
 * plantilla, su fecha, su turno, el crew chief y la hora, y se puede volver a
 * abrir para modificarla.
 *
 * Sin nube (como la version publicada mientras no tenga la clave), que es el
 * caso que antes perdia la planilla anterior al empezar otra. No usa la IA.
 */

const informe = crearInforme("Planillas guardadas");

const navegador = await abrirNavegador();
const contexto = await navegador.newContext({
  viewport: { width: 1280, height: 950 },
  permissions: ["clipboard-read", "clipboard-write"],
});
const page = await contexto.newPage();
page.on("pageerror", (error) => informe.anotarError(`error de página: ${error.message}`));

await page.goto(URL_BASE, { waitUntil: "domcontentloaded" });
await page.waitForTimeout(2000);

const TAB = String.fromCharCode(9);
const celda = (fila, columna) =>
  page.locator('[role="grid"]').first().locator(`[data-celda="${fila}:${columna}"]`);
const pegar = async (filas) => {
  await celda(0, 0).click();
  await page.evaluate(
    (texto) => navigator.clipboard.writeText(texto),
    filas.map((fila) => fila.join(TAB)).join("\n"),
  );
  await page.keyboard.press("Control+V");
  await page.waitForTimeout(700);
};
const irA = async (nombre) => {
  await page.getByRole("tab", { name: nombre }).click();
  await page.waitForTimeout(500);
};
const tarjetas = page.locator("li[data-planilla]");

// --- Al empezar no hay ninguna ---
await irA(/Guardadas/);
informe.comprobar(
  "sin planillas, lo dice con palabras",
  await page.getByText("Todavía no hay planillas guardadas").isVisible(),
);

// --- Una de terminal, de noche ---
await irA(/Planillas/);
informe.comprobar(
  "el campo se llama Crew chief y ya viene puesto",
  (await page.getByLabel("Crew chief").inputValue()) === "Paula Andrea Ochoa",
  await page.getByLabel("Crew chief").inputValue(),
);
await page.getByLabel("Turno").fill("Noche");
await pegar([
  ["J. Pérez", "12:00", "N123AV", "B4", "07:30"],
  ["M. Gómez", "12:30", "N789AV", "A1", "08:00"],
]);

// --- Cambiar de plantilla ya no pregunta ni pierde nada ---
let pregunto = false;
const alPreguntar = (dialogo) => {
  pregunto = true;
  void dialogo.dismiss();
};
page.on("dialog", alPreguntar);
await page.getByLabel("Plantilla").selectOption("hangar");
await page.waitForTimeout(500);
page.off("dialog", alPreguntar);
informe.comprobar("cambiar de plantilla no pregunta nada", !pregunto);
await pegar([["L. Torres", "N555AV", "Revisión de frenos"]]);

await irA(/Guardadas/);
informe.comprobar("están las dos planillas", (await tarjetas.count()) === 2, `${await tarjetas.count()}`);

const terminal = tarjetas.filter({ hasText: "Terminal" });
const hangar = tarjetas.filter({ hasText: "Hangar" });
const textoTerminal = (await terminal.innerText()).replace(/\s+/g, " ");
informe.comprobar(
  "la última tocada va primero y dice que está abierta",
  (await tarjetas.first().innerText()).includes("Hangar") &&
    (await hangar.innerText()).includes("Abierta ahora"),
);
informe.comprobar(
  "dice de qué plantilla es, el día y el turno",
  textoTerminal.includes("Terminal") &&
    /Planilla del \d{2}\/\d{2}\/\d{4}/.test(textoTerminal) &&
    textoTerminal.includes("Turno Noche"),
  textoTerminal.slice(0, 90),
);
informe.comprobar(
  "dice quién es el crew chief",
  textoTerminal.includes("Crew chief: Paula Andrea Ochoa"),
);
informe.comprobar(
  "dice cuándo se creó y cuándo se modificó, con la hora",
  /Creada hoy, \d{1,2}:\d{2}/.test(textoTerminal) &&
    /Última modificación hoy, \d{1,2}:\d{2}/.test(textoTerminal),
  textoTerminal.match(/Creada.*?(?=Sin|En inglés)/)?.[0] ?? textoTerminal,
);
informe.comprobar(
  "y cuántas filas tiene y dónde está guardada",
  textoTerminal.includes("2 filas escritas") && textoTerminal.includes("En este equipo"),
);
informe.comprobar(
  "con una vista previa para reconocerla",
  textoTerminal.includes("J. Pérez"),
);

// --- Abrir la de terminal y modificarla ---
await terminal.getByRole("button", { name: "Abrir y modificar" }).click();
await page.waitForTimeout(600);
informe.comprobar(
  "abrir lleva a la pestaña de Planillas",
  (await page.getByRole("tab", { name: /Planillas/ }).getAttribute("aria-selected")) === "true",
);
informe.comprobar(
  "con la planilla tal como estaba",
  (await page.getByLabel("Plantilla").inputValue()) === "terminal" &&
    (await celda(1, 0).innerText()) === "M. Gómez" &&
    (await page.getByLabel("Turno").inputValue()) === "Noche",
  `${await celda(1, 0).innerText()} / ${await page.getByLabel("Turno").inputValue()}`,
);

await celda(2, 0).dblclick();
await page.keyboard.type("R. Díaz");
await page.keyboard.press("Enter");
await page.waitForTimeout(800);

await irA(/Guardadas/);
informe.comprobar(
  "lo modificado queda guardado y la sube arriba",
  (await tarjetas.first().innerText()).includes("Terminal") &&
    (await tarjetas.first().innerText()).includes("3 filas escritas"),
  (await tarjetas.first().innerText()).replace(/\s+/g, " ").slice(0, 80),
);

// --- Recargar no las borra ---
await page.reload({ waitUntil: "domcontentloaded" });
await page.waitForTimeout(2200);
informe.comprobar(
  "al recargar sigue en Guardadas con las dos",
  (await page.getByRole("tab", { name: /Guardadas/ }).getAttribute("aria-selected")) === "true" &&
    (await tarjetas.count()) === 2,
  `${await tarjetas.count()}`,
);

// --- Buscar y filtrar ---
await page.getByLabel("Buscar en las planillas guardadas").fill("frenos");
await page.waitForTimeout(200);
informe.comprobar(
  "buscar por lo escrito encuentra la de hangar",
  (await tarjetas.count()) === 1 && (await tarjetas.first().innerText()).includes("Hangar"),
);
await page.getByLabel("Buscar en las planillas guardadas").fill("");
await page.getByRole("button", { name: "Terminal", exact: true }).click();
await page.waitForTimeout(200);
informe.comprobar(
  "el filtro por plantilla deja solo las de terminal",
  (await tarjetas.count()) === 1 && (await tarjetas.first().innerText()).includes("Terminal"),
);
await page.getByRole("button", { name: "Todas", exact: true }).click();

// --- Borrar pide confirmación ---
page.once("dialog", (dialogo) => void dialogo.dismiss());
await hangar.getByRole("button", { name: "Borrar esta planilla" }).click();
await page.waitForTimeout(300);
informe.comprobar("si se dice que no, no se borra", (await tarjetas.count()) === 2);

page.once("dialog", (dialogo) => void dialogo.accept());
await hangar.getByRole("button", { name: "Borrar esta planilla" }).click();
await page.waitForTimeout(500);
informe.comprobar(
  "si se confirma, se borra",
  (await tarjetas.count()) === 1 && (await tarjetas.first().innerText()).includes("Terminal"),
);

await page.reload({ waitUntil: "domcontentloaded" });
await page.waitForTimeout(2200);
informe.comprobar("y no vuelve al recargar", (await tarjetas.count()) === 1);

// --- El crew chief en los documentos ---
const etiquetas = readFileSync(new URL("../lib/export/i18n.ts", import.meta.url), "utf8");
informe.comprobar(
  "en el Excel, el Word y el PDF sale CREW CHIEF",
  (etiquetas.match(/supervisor: "CREW CHIEF"/g) ?? []).length === 2 && !etiquetas.includes('"SUPERVISOR"'),
);

await navegador.close();
informe.terminar();
