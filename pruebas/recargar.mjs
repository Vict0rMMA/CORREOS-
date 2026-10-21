import { URL_BASE, abrirNavegador, crearInforme } from "./comun.mjs";

/**
 * Recargar la pagina no borra nada.
 *
 * Se prueba SIN nube, que es el caso dificil (y el de la version publicada
 * mientras no tenga la clave de Supabase): todo tiene que volver desde la
 * copia del navegador. La planilla en espanol, su resultado en ingles con lo
 * corregido a mano, y en Correos el resultado y el asunto.
 *
 * No usa la IA: la planilla de prueba es toda de codigos y nombres.
 */

const informe = crearInforme("Recargar sin perder nada");

const navegador = await abrirNavegador();
const contexto = await navegador.newContext({
  viewport: { width: 1440, height: 1000 },
  permissions: ["clipboard-read", "clipboard-write"],
});
const page = await contexto.newPage();
page.on("pageerror", (error) => informe.anotarError(`error de página: ${error.message}`));

await page.addInitScript(() => {
  if (sessionStorage.getItem("sembrado")) return;
  sessionStorage.setItem("sembrado", "1");
  localStorage.setItem(
    "paula:history",
    JSON.stringify([
      {
        id: "recargar-1",
        preview: "Inspección del tren de aterrizaje",
        input: "inspeccion del tren de aterrizaje",
        output: "Estimado supervisor: la inspección del avión N123AV quedó aprobada.",
        subject: "Inspección aprobada",
        lang: "es",
        action: "generate_email",
        textType: "email",
        tone: "professional",
        createdAt: Date.now(),
      },
    ]),
  );
});

await page.goto(URL_BASE, { waitUntil: "domcontentloaded" });
await page.waitForTimeout(2000);

const recargar = async () => {
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.waitForTimeout(2200);
};

// ---------------------------------------------------------------------------
// Correos: el resultado y el asunto
// ---------------------------------------------------------------------------

await page.getByRole("button", { name: /Inspección del tren/ }).first().click();
await page.waitForTimeout(500);
await recargar();

const resultado = (await page.locator("p.whitespace-pre-wrap").first().textContent()) ?? "";
informe.comprobar(
  "en Correos, el resultado sigue después de recargar",
  resultado.includes("quedó aprobada"),
  resultado.slice(0, 60),
);
informe.comprobar(
  "y el asunto también",
  (await page.getByPlaceholder(/Asunto del correo/).inputValue()) === "Inspección aprobada",
);
informe.comprobar(
  "y se puede descargar sin volver a procesar",
  await page.getByRole("button", { name: "Word", exact: true }).isEnabled(),
);

// ---------------------------------------------------------------------------
// Planillas: lo escrito en español
// ---------------------------------------------------------------------------

await page.getByRole("tab", { name: /Planillas/ }).click();
await page.waitForTimeout(400);

const celda = (fila, columna) =>
  page.locator('[role="grid"]').first().locator(`[data-celda="${fila}:${columna}"]`);

await page.getByLabel("Turno").fill("Noche");
await celda(0, 0).click();
await page.evaluate(
  (texto) => navigator.clipboard.writeText(texto),
  ["J. Pérez", "12:00", "N123AV", "B4", "07:30"].join("\t") +
    "\n" +
    ["M. Gómez", "12:30", "N789AV", "A1", "08:00"].join("\t"),
);
await page.keyboard.press("Control+V");
await page.waitForTimeout(400);

// Recargar enseguida, sin esperar a nada.
await recargar();
informe.comprobar(
  "al recargar vuelve a la pestaña de Planillas",
  (await page.getByRole("tab", { name: /Planillas/ }).getAttribute("aria-selected")) === "true",
);
informe.comprobar(
  "y la planilla sigue escrita",
  (await celda(0, 0).innerText()) === "J. Pérez" && (await celda(1, 2).innerText()) === "N789AV",
  `${await celda(0, 0).innerText()} / ${await celda(1, 2).innerText()}`,
);
informe.comprobar(
  "con el turno puesto",
  (await page.getByLabel("Turno").inputValue()) === "Noche",
  await page.getByLabel("Turno").inputValue(),
);

// ---------------------------------------------------------------------------
// Planillas: el resultado en inglés, con lo corregido a mano
// ---------------------------------------------------------------------------

await page.getByRole("button", { name: /Traducir y generar Excel/ }).click();
await page.waitForFunction(
  () =>
    [...document.querySelectorAll('[role="tab"][aria-selected="true"]')].some((pestana) =>
      pestana.textContent?.includes("inglés"),
    ),
  undefined,
  { timeout: 60000 },
);
await page.waitForTimeout(400);

await celda(0, 3).dblclick();
await page.keyboard.press("Control+A");
await page.keyboard.type("B5");
await page.keyboard.press("Enter");
await page.waitForTimeout(400);

await recargar();
informe.comprobar(
  "el resultado en inglés sigue después de recargar",
  [...(await page.locator('[role="tab"][aria-selected="true"]').allTextContents())].some((texto) =>
    texto.includes("inglés"),
  ),
);
informe.comprobar(
  "con los encabezados en inglés",
  (await page.locator('[role="grid"]').first().locator('[data-celda="-1:0"]').innerText()) ===
    "EMPLOYEE",
);
informe.comprobar(
  "y con la corrección hecha a mano",
  (await celda(0, 3).innerText()) === "B5",
  await celda(0, 3).innerText(),
);
informe.comprobar(
  "el Excel se puede bajar sin volver a traducir",
  await page.getByRole("button", { name: "Descargar Excel" }).isEnabled(),
);

// ---------------------------------------------------------------------------
// "Nueva" deja la planilla nueva, no la anterior, al recargar
// ---------------------------------------------------------------------------

await page.getByRole("button", { name: /Nueva/ }).click();
await page.waitForTimeout(400);
await recargar();
informe.comprobar(
  "tras empezar una nueva, recargar no trae la anterior",
  (await celda(0, 0).innerText()).trim() === "" &&
    (await page.getByLabel("Turno").inputValue()) === "Noche",
  `"${(await celda(0, 0).innerText()).trim()}"`,
);

await navegador.close();
informe.terminar();
