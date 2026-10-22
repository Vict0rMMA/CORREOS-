import { SALIDA, URL_BASE, abrirNavegador, crearInforme } from "./comun.mjs";

/**
 * Todo en el celular, sin gastar IA: las tres pestanas en telefonos chicos,
 * normales y grandes (y uno de lado), tocando con el dedo.
 *
 * En cada una se comprueba que nada se sale de la pantalla, que los botones
 * se pueden tocar, que ningun campo hace zoom al escribir (iOS lo hace con
 * letra de menos de 16 px), y que se puede llenar una planilla, dejarla en
 * Guardadas y volver a abrirla.
 */

const informe = crearInforme("Todo en el celular");
const navegador = await abrirNavegador();

const TELEFONOS = [
  { nombre: "Android pequeño", width: 360, height: 740 },
  { nombre: "iPhone", width: 390, height: 844 },
  { nombre: "teléfono grande", width: 430, height: 932 },
  { nombre: "iPhone de lado", width: 844, height: 390 },
];

/** Lo que se sale por la derecha, fuera de las tablas que se desplazan solas. */
async function seSale(page) {
  return page.evaluate(() => {
    const ancho = document.documentElement.clientWidth;
    const fuera = [];
    if (document.documentElement.scrollWidth > ancho + 1) {
      fuera.push(`página ${document.documentElement.scrollWidth}px > ${ancho}px`);
    }
    for (const elemento of document.querySelectorAll("main *")) {
      const caja = elemento.getBoundingClientRect();
      if (caja.width === 0 || caja.right <= ancho + 1) continue;
      // Dentro de algo que se desplaza (la cuadricula, los filtros) es normal.
      let padre = elemento.parentElement;
      let dentroDeScroll = false;
      while (padre && padre !== document.body) {
        const estilo = getComputedStyle(padre);
        if (/(auto|scroll|hidden|clip)/.test(estilo.overflowX)) {
          dentroDeScroll = true;
          break;
        }
        padre = padre.parentElement;
      }
      if (!dentroDeScroll) {
        const nombre = (elemento.getAttribute("aria-label") || elemento.textContent || elemento.tagName)
          .trim()
          .slice(0, 24);
        fuera.push(`${nombre} (${Math.round(caja.right)}px)`);
      }
    }
    return fuera.slice(0, 6);
  });
}

/** Botones visibles demasiado pequenos para el dedo. */
async function botonesPequenos(page) {
  return page.evaluate(() => {
    const lista = [];
    for (const boton of document.querySelectorAll("main button, main [role=tab], main select")) {
      const caja = boton.getBoundingClientRect();
      if (caja.width === 0 || caja.height === 0) continue;
      if (boton.closest('[role="grid"]')) continue; // las casillas tienen su propio tamano
      if (caja.height < 35.5 || caja.width < 32) {
        const nombre = (boton.getAttribute("aria-label") || boton.textContent || "?").trim();
        lista.push(`${nombre.slice(0, 18)}=${Math.round(caja.width)}x${Math.round(caja.height)}`);
      }
    }
    return lista.slice(0, 8);
  });
}

/** Campos visibles con letra de menos de 16 px (iOS hace zoom al tocarlos). */
async function camposConZoom(page) {
  return page.evaluate(() => {
    const lista = [];
    for (const campo of document.querySelectorAll("input, textarea, select")) {
      const caja = campo.getBoundingClientRect();
      if (caja.width === 0 || caja.height === 0) continue;
      if (getComputedStyle(campo).opacity === "0") continue;
      const letra = parseFloat(getComputedStyle(campo).fontSize);
      if (letra < 16) {
        lista.push(`${campo.getAttribute("aria-label") || campo.id || campo.tagName}=${letra}px`);
      }
    }
    return lista;
  });
}

for (const telefono of TELEFONOS) {
  const contexto = await navegador.newContext({
    viewport: { width: telefono.width, height: telefono.height },
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true,
    permissions: ["clipboard-read", "clipboard-write"],
  });
  const page = await contexto.newPage();
  const errores = [];
  page.on("pageerror", (error) => errores.push(error.message));
  page.on("console", (mensaje) => {
    if (mensaje.type() === "error" && !/Failed to load resource|503/.test(mensaje.text())) {
      errores.push(mensaje.text());
    }
  });

  await page.goto(URL_BASE, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(2200);
  const nombre = `${telefono.nombre} (${telefono.width}px)`;
  const archivo = telefono.nombre.replace(/\W+/g, "-");

  const tocarPestana = async (pestana) => {
    await page.getByRole("tab", { name: pestana }).first().tap();
    await page.waitForTimeout(500);
  };

  // --- Las tres pestanas caben ---
  const pestanas = await page.evaluate(() =>
    [...document.querySelectorAll('[aria-label="Secciones"] [role=tab]')].map((boton) => ({
      texto: boton.textContent?.trim() ?? "",
      corta: boton.scrollWidth > boton.clientWidth + 1,
    })),
  );
  informe.comprobar(
    `${nombre}: se ven las tres pestañas enteras`,
    pestanas.length === 3 && pestanas.every((pestana) => !pestana.corta),
    pestanas.map((pestana) => pestana.texto.slice(0, 10)).join(" | "),
  );

  for (const [pestana, clave] of [
    [/^Correos/, "correos"],
    [/^Planillas/, "planillas"],
    [/^Guardadas/, "guardadas"],
  ]) {
    await tocarPestana(pestana);
    const fuera = await seSale(page);
    informe.comprobar(`${nombre}, ${clave}: nada se sale de la pantalla`, fuera.length === 0, fuera.join(", "));
    const pequenos = await botonesPequenos(page);
    informe.comprobar(`${nombre}, ${clave}: los botones se tocan bien`, pequenos.length === 0, pequenos.join(", "));
    const zoom = await camposConZoom(page);
    informe.comprobar(`${nombre}, ${clave}: ningún campo hace zoom`, zoom.length === 0, zoom.join(", "));
  }

  // --- Llenar una planilla con el dedo ---
  await tocarPestana(/^Planillas/);
  const celda = (fila, columna) =>
    page.locator('[role="grid"]').first().locator(`[data-celda="${fila}:${columna}"]`);
  await celda(0, 0).tap();
  await page.waitForTimeout(300);
  await page.keyboard.type("J. Pérez");
  await page.keyboard.press("Enter");
  await page.waitForTimeout(300);
  await celda(0, 2).tap();
  await page.waitForTimeout(300);
  await page.keyboard.type("N123AV");
  await page.keyboard.press("Enter");
  await page.waitForTimeout(800);
  informe.comprobar(
    `${nombre}: se escribe en la planilla tocando la casilla`,
    (await celda(0, 0).innerText()) === "J. Pérez" && (await celda(0, 2).innerText()) === "N123AV",
    `${await celda(0, 0).innerText()} / ${await celda(0, 2).innerText()}`,
  );
  const fueraConDatos = await seSale(page);
  informe.comprobar(
    `${nombre}: con datos, la planilla sigue cabiendo`,
    fueraConDatos.length === 0,
    fueraConDatos.join(", "),
  );
  await page.screenshot({ path: `${SALIDA}/movil-${archivo}-planilla.png` });

  // --- Guardadas, y volver a abrirla ---
  await page.getByRole("button", { name: /Nueva/ }).first().tap();
  await page.waitForTimeout(500);
  await tocarPestana(/^Guardadas/);
  const tarjeta = page.locator("li[data-planilla]").first();
  informe.comprobar(
    `${nombre}: la planilla aparece en Guardadas`,
    (await page.locator("li[data-planilla]").count()) === 1 &&
      (await tarjeta.innerText()).includes("J. Pérez"),
  );
  const fueraGuardadas = await seSale(page);
  informe.comprobar(
    `${nombre}: la tarjeta cabe en la pantalla`,
    fueraGuardadas.length === 0,
    fueraGuardadas.join(", "),
  );
  await page.screenshot({ path: `${SALIDA}/movil-${archivo}-guardadas.png`, fullPage: true });

  await tarjeta.getByRole("button", { name: "Abrir y modificar" }).tap();
  await page.waitForTimeout(700);
  informe.comprobar(
    `${nombre}: tocar "Abrir y modificar" la abre para seguir`,
    (await page.getByRole("tab", { name: /^Planillas/ }).getAttribute("aria-selected")) === "true" &&
      (await celda(0, 2).innerText()) === "N123AV",
  );
  const arriba = await page.evaluate(() => window.scrollY);
  informe.comprobar(`${nombre}: y se ve desde arriba`, arriba < 80, `${arriba}px`);

  await tocarPestana(/^Correos/);
  await page.screenshot({ path: `${SALIDA}/movil-${archivo}-correos.png` });

  informe.comprobar(`${nombre}: sin errores en la consola`, errores.length === 0, errores.slice(0, 3).join(" | "));
  await contexto.close();
}

await navegador.close();
informe.terminar();
