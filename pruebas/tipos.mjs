import { SALIDA, URL_BASE, abrirNavegador, crearInforme, esperarResultado, leerResultado } from "./comun.mjs";

/**
 * Correo, Reporte y Mensaje, y que un tipo guardado que ya no existe no
 * rompa nada. Usa la IA una vez.
 */

const informe = crearInforme("Tipos de texto");

const navegador = await abrirNavegador();

// 1) Selector con las tres opciones
const fresh = await navegador.newContext({ viewport: { width: 1440, height: 950 } });
const page = await fresh.newPage();
page.on("pageerror", (e) => informe.anotarError(`pageerror: ${e.message}`));
await page.goto(URL_BASE, { waitUntil: "networkidle" });

const options = await page.locator("select").nth(1).locator("option").allTextContents();
console.log(`opciones: ${JSON.stringify(options)}`);
informe.comprobar("el selector tiene 3 opciones", options.length === 3, `${options.length}`);
informe.comprobar(
  "son Correo, Reporte y Mensaje",
  JSON.stringify(options) === JSON.stringify(["Correo", "Reporte", "Mensaje"]),
);

// Reporte sigue mostrando las fotos
await page.locator("select").nth(1).selectOption("report");
await page.waitForTimeout(300);
informe.comprobar("Reporte sigue trayendo las fotos", await page.getByText("Fotos del reporte").isVisible());

// Correo sigue mostrando el asunto
await page.locator("select").nth(1).selectOption("email");
await page.waitForTimeout(300);
informe.comprobar("Correo sigue trayendo el asunto", await page.getByPlaceholder(/Asunto del correo/).isVisible());

// Mensaje no trae ni asunto ni fotos
await page.locator("select").nth(1).selectOption("message");
await page.waitForTimeout(300);
informe.comprobar(
  "Mensaje queda limpio",
  (await page.getByPlaceholder(/Asunto del correo/).count()) === 0 &&
    (await page.getByText("Fotos del reporte").count()) === 0,
);
await page.screenshot({ path: `${SALIDA}/tipos.png` });
await fresh.close();

// 2) Alguien que ya tenia guardado un tipo que ya no existe
const old = await navegador.newContext({ viewport: { width: 1440, height: 950 } });
const page2 = await old.newPage();
page2.on("pageerror", (e) => informe.anotarError(`pageerror(viejo): ${e.message}`));
await page2.addInitScript(() => {
  localStorage.setItem(
    "paula:prefs",
    JSON.stringify({ lang: "es", targetLang: "en", tone: "academic", textType: "academic", signature: "" }),
  );
  localStorage.setItem(
    "paula:history",
    JSON.stringify([
      {
        id: "1",
        preview: "texto viejo",
        input: "texto viejo",
        output: "texto viejo",
        lang: "es",
        action: "correct",
        textType: "work",
        tone: "casual",
        createdAt: Date.now(),
      },
    ]),
  );
});
await page2.goto(URL_BASE, { waitUntil: "networkidle" });
await page2.waitForTimeout(400);

const selected = await page2.locator("select").nth(1).inputValue();
informe.comprobar("un tipo viejo se corrige solo", selected === "email", selected);
const toneValue = await page2.locator("select").nth(0).inputValue();
informe.comprobar("un tono viejo tambien", ["professional", "academic"].includes(toneValue), toneValue);
informe.comprobar("el historial viejo se sigue viendo", await page2.getByText("texto viejo").first().isVisible());

// Y procesa sin error del servidor
await page2.fill("#paula-input", "hola profe queria saber si puedo faltar manana");
await page2.getByRole("button", { name: "Corregir" }).first().click();
await page2.waitForFunction(
  () => {
    const el = document.querySelector('[role="status"]');
    return el && /Listo|Error/.test(el.textContent || "");
  },
  undefined,
  { timeout: 90000 },
);
const status = await page2.locator('[role="status"]').first().textContent();
informe.comprobar("procesa sin error tras la migracion", /Listo/.test(status || ""), status || "");

await navegador.close();
informe.terminar();
