import { SALIDA, URL_BASE, abrirNavegador, crearInforme, esperarResultado, leerResultado } from "./comun.mjs";

/**
 * Busqueda, paginado y borrado de los textos guardados.
 * No usa la IA: no consume cuota.
 */

const informe = crearInforme("Guardados y buscador");

const navegador = await abrirNavegador();
const context = await navegador.newContext({ viewport: { width: 1440, height: 950 } });
const page = await context.newPage();
page.on("pageerror", (e) => informe.anotarError(`pageerror: ${e.message}`));

// Sembramos 120 textos guardados, como despues de meses de uso
await page.addInitScript(() => {
  if (localStorage.getItem('sembrado')) return;
  localStorage.setItem('sembrado', '1');
  const temas = [
    "inspección del tren de aterrizaje del avión HK-4721",
    "cambio de aceite del motor izquierdo",
    "solicitud de repuestos para el flap derecho",
    "reporte de vibración en la turbina",
    "certificado de aeronavegabilidad",
  ];
  const items = [];
  for (let i = 0; i < 120; i += 1) {
    const tema = temas[i % temas.length];
    items.push({
      id: `seed-${i}`,
      preview: `Informe ${i + 1}: ${tema}`,
      input: `Texto original sobre ${tema}, número ${i + 1}`,
      output: `Estimado supervisor: le informo sobre ${tema}. Referencia ${i + 1}.`,
      lang: "es",
      action: "generate_email",
      textType: "email",
      tone: "professional",
      createdAt: Date.now() - i * 3600000,
    });
  }
  localStorage.setItem("paula:history", JSON.stringify(items));
});

await page.goto(URL_BASE, { waitUntil: "networkidle" });
await page.waitForTimeout(600);

informe.comprobar("guarda los 120 textos", await page.getByText("120", { exact: true }).first().isVisible());
informe.comprobar("hay buscador", await page.getByPlaceholder(/Buscar en lo guardado/).isVisible());

const visibles = () => page.locator("section:has-text('GUARDADOS') li").count();
informe.comprobar("muestra los primeros 8", (await visibles()) === 8, `${await visibles()}`);

// Buscar sin tildes debe encontrar con tildes
await page.getByPlaceholder(/Buscar en lo guardado/).fill("vibracion en la turbina");
await page.waitForTimeout(400);
const resultados = await visibles();
console.log(`  resultados de "vibracion en la turbina": ${resultados} (mostrados)`);
informe.comprobar("encuentra aunque se escriba sin tildes", resultados > 0);
informe.comprobar(
  "el contador de resultados aparece",
  await page.getByText(/\d+ resultados?/).isVisible(),
);

// Buscar por matrícula del avión
await page.getByPlaceholder(/Buscar en lo guardado/).fill("HK-4721");
await page.waitForTimeout(400);
informe.comprobar("busca por matrícula", (await visibles()) > 0);
await page.screenshot({ path: `${SALIDA}/guardados.png` });

// Búsqueda sin resultados
await page.getByPlaceholder(/Buscar en lo guardado/).fill("zzzz");
await page.waitForTimeout(400);
informe.comprobar("avisa cuando no hay coincidencias", await page.getByText(/Nada coincide/).isVisible());

// Limpiar y ver más
await page.getByRole("button", { name: /Limpiar la búsqueda/ }).click();
await page.waitForTimeout(300);
await page.getByRole("button", { name: /Ver más/ }).click();
await page.waitForTimeout(300);
informe.comprobar("Ver más muestra 24", (await visibles()) === 24, `${await visibles()}`);

// Borrar uno suelto
await page.locator("section:has-text('GUARDADOS') li").first().getByRole("button", { name: "Borrar este texto" }).click();
await page.waitForTimeout(500);
const quedan = await page.evaluate(() => JSON.parse(localStorage.getItem("paula:history") || "[]").length);
informe.comprobar("borra un texto suelto", quedan === 119, `${quedan}`);

// Sobrevive a recargar
await page.reload({ waitUntil: "networkidle" });
await page.waitForTimeout(600);
const trasRecargar = await page.evaluate(() => JSON.parse(localStorage.getItem("paula:history") || "[]").length);
informe.comprobar("sigue ahí tras recargar", trasRecargar === 119, `${trasRecargar}`);

await navegador.close();
informe.terminar();
