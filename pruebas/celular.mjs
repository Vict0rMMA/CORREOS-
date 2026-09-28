import { SALIDA, URL_BASE, abrirNavegador, crearInforme, esperarResultado } from "./comun.mjs";

/**
 * La vista de celular: pestanas, tamano de los botones para el dedo y la
 * instalacion como aplicacion.
 *
 * La parte de las pestanas usa la IA una vez.
 */

const informe = crearInforme("Celular");
const navegador = await abrirNavegador();
const contexto = await navegador.newContext({
  viewport: { width: 390, height: 844 },
  deviceScaleFactor: 3,
  isMobile: true,
  hasTouch: true,
});
const page = await contexto.newPage();
page.on("pageerror", (error) => informe.anotarError(`error de página: ${error.message}`));
await page.goto(URL_BASE, { waitUntil: "networkidle" });

const alto = await page.evaluate(() => document.documentElement.scrollHeight);
informe.comprobar("la página cabe en pocas pantallas", alto < 1600, `${alto}px`);

informe.comprobar(
  "hay pestañas Tu texto / Resultado",
  await page.getByRole("tab", { name: /Tu texto/ }).isVisible(),
);
informe.comprobar(
  "las acciones rápidas empiezan plegadas",
  (await page.getByRole("button", { name: "Traducir al inglés" }).count()) === 0,
);

// Todo lo que se toca debe ser lo bastante grande
const pequenos = await page.evaluate(() => {
  const lista = [];
  for (const boton of document.querySelectorAll("main button")) {
    const caja = boton.getBoundingClientRect();
    if (caja.width > 0 && caja.height > 0 && caja.height < 35.5) {
      const nombre = (boton.textContent || boton.getAttribute("aria-label") || "?").trim();
      lista.push(`${nombre.slice(0, 20)}=${Math.round(caja.height)}px`);
    }
  }
  return lista;
});
informe.comprobar("los botones se pueden tocar con el dedo", pequenos.length === 0, pequenos.join(", "));

// Flujo completo tocando con el dedo
await page.fill("#paula-input", "hola profe como esta queria saber si puedo faltar el viernes");
await page.getByRole("button", { name: /^Corregir/ }).first().tap();
await esperarResultado(page);

informe.comprobar(
  "al terminar salta solo a la pestaña Resultado",
  (await page.getByRole("tab", { name: /Resultado/ }).getAttribute("aria-selected")) === "true",
);
await page.screenshot({ path: `${SALIDA}/celular.png`, fullPage: true });

await page.getByRole("tab", { name: /Tu texto/ }).tap();
await page.waitForTimeout(300);
informe.comprobar("se puede volver a Tu texto", await page.locator("#paula-input").isVisible());

await page.getByRole("button", { name: /Acciones rápidas/ }).tap();
await page.waitForTimeout(300);
informe.comprobar(
  "las acciones rápidas se abren al tocar",
  await page.getByRole("button", { name: "Traducir al inglés" }).isVisible(),
);

// --- Instalable como aplicacion ---
const manifest = await page.evaluate(async () => {
  const enlace = document.querySelector('link[rel="manifest"]');
  if (!enlace) return null;
  return (await fetch(enlace.href)).json();
});
informe.comprobar("se puede instalar en el teléfono", manifest?.display === "standalone");
informe.comprobar(
  "tiene los iconos que pide Android",
  (manifest?.icons ?? []).some((icono) => icono.sizes === "512x512") &&
    (manifest?.icons ?? []).some((icono) => icono.purpose === "maskable"),
);

const iphone = await page.evaluate(() => ({
  capaz: document.querySelector('meta[name="apple-mobile-web-app-capable"]')?.content,
  icono: document.querySelector('link[rel="apple-touch-icon"]')?.href,
}));
informe.comprobar("en iPhone se abre a pantalla completa", iphone.capaz === "yes");
informe.comprobar("en iPhone tiene su icono", Boolean(iphone.icono));

await navegador.close();
informe.terminar();
