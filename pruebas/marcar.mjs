import { URL_BASE, abrirNavegador, crearInforme } from "./comun.mjs";

/**
 * Marcar y copiar varias casillas, en el celular, la tableta y el computador.
 *
 * En el celular la primera columna (el empleado) se quedaba fija al moverse
 * de lado: ocupaba media pantalla, las demas pasaban por debajo y no se podia
 * marcar bien lo de al lado. Y con el dedo no habia forma de marcar varias
 * casillas: tocar una la abria para escribir. Sin IA.
 */

const informe = crearInforme("Marcar y copiar en cualquier pantalla");
const navegador = await abrirNavegador();

const FILAS = [
  ["J. Pérez", "12:00", "N123AV", "B4", "07:30"],
  ["M. Gómez", "12:30", "N789AV", "A1", "08:00"],
  ["L. Ríos", "13:00", "N456AV", "C7", "09:15"],
];

const EQUIPOS = [
  { nombre: "celular", viewport: { width: 390, height: 844 }, tactil: true, fijaDeEntrada: false },
  { nombre: "tableta", viewport: { width: 820, height: 1180 }, tactil: true, fijaDeEntrada: false },
  { nombre: "computador", viewport: { width: 1440, height: 950 }, tactil: false, fijaDeEntrada: true },
];

for (const equipo of EQUIPOS) {
  const contexto = await navegador.newContext({
    viewport: equipo.viewport,
    isMobile: equipo.tactil && equipo.viewport.width < 600,
    hasTouch: equipo.tactil,
    permissions: ["clipboard-read", "clipboard-write"],
  });
  const page = await contexto.newPage();
  page.on("pageerror", (error) => informe.anotarError(`${equipo.nombre}: ${error.message}`));
  const tocar = (localizador) => (equipo.tactil ? localizador.tap() : localizador.click());
  const nombre = equipo.nombre;

  // La planilla con datos, como si ya estuviera escrita.
  await page.goto(URL_BASE, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(1800);
  await page.evaluate((filas) => {
    const copia = JSON.parse(localStorage.getItem("paula:planilla"));
    filas.forEach((fila, indice) => {
      fila.forEach((valor, columna) => {
        copia.entrada.sections[0].rows[indice][columna] = valor;
      });
    });
    localStorage.setItem("paula:planilla", JSON.stringify(copia));
    const prefs = JSON.parse(localStorage.getItem("paula:prefs") ?? "{}");
    localStorage.setItem("paula:prefs", JSON.stringify({ ...prefs, seccion: "planillas" }));
  }, FILAS);
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.waitForTimeout(2000);

  const rejilla = page.locator('[role="grid"]').first();
  const celda = (fila, columna) => rejilla.locator(`[data-celda="${fila}:${columna}"]`);
  const fijar = page.getByRole("button", { name: /Fijar 1\.ª columna/ });
  const marcar = page.getByRole("button", { name: /Marcar varias|Marcando/ });
  const copiar = page.getByRole("button", { name: "Copiar", exact: true });
  // Windows termina las lineas con CR LF; para comparar da igual.
  const portapapeles = () =>
    page.evaluate(async () => (await navigator.clipboard.readText()).replace(/\r\n/g, "\n"));

  /** Donde queda la primera columna despues de moverse de lado. */
  const primeraTrasDesplazar = async () => {
    await rejilla.evaluate((nodo) => {
      nodo.scrollLeft = 500;
    });
    await page.waitForTimeout(200);
    const caja = await celda(0, 0).boundingBox();
    const caja2 = await rejilla.boundingBox();
    await rejilla.evaluate((nodo) => {
      nodo.scrollLeft = 0;
    });
    return Math.round(caja.x - caja2.x);
  };

  // --- La primera columna ---
  informe.comprobar(
    `${nombre}: la primera columna ${equipo.fijaDeEntrada ? "viene fija" : "no viene fija"}`,
    (await fijar.getAttribute("aria-pressed")) === String(equipo.fijaDeEntrada),
  );
  const sinFijar = equipo.fijaDeEntrada ? null : await primeraTrasDesplazar();
  if (sinFijar !== null) {
    informe.comprobar(
      `${nombre}: al moverse de lado, el empleado se va con las demás y deja sitio`,
      sinFijar < 0,
      `${sinFijar}px`,
    );
  }
  if (!equipo.fijaDeEntrada) await tocar(fijar);
  const fija = await primeraTrasDesplazar();
  informe.comprobar(
    `${nombre}: con "Fijar 1.ª columna" se queda a la vista`,
    fija >= 40 && fija <= 46,
    `${fija}px`,
  );
  if (!equipo.fijaDeEntrada) await tocar(fijar);

  // --- Marcar varias con toques ---
  await tocar(marcar);
  await page.waitForTimeout(200);
  await tocar(celda(0, 1));
  await tocar(celda(2, 3));
  await page.waitForTimeout(200);
  informe.comprobar(
    `${nombre}: marcando, tocar no abre la casilla para escribir`,
    (await rejilla.locator("input").count()) === 0,
  );
  informe.comprobar(
    `${nombre}: dice cuántas hay marcadas`,
    await page.getByText("Marcadas: 3 filas × 3 columnas.").isVisible(),
  );
  await tocar(copiar);
  await page.waitForTimeout(300);
  const rango = FILAS.map((fila) => fila.slice(1, 4).join("\t")).join("\n");
  informe.comprobar(
    `${nombre}: Copiar copia justo lo marcado, por columnas`,
    (await portapapeles()) === rango,
    JSON.stringify(await portapapeles()),
  );

  // Un titulo marca la columna entera; otro, hasta esa.
  await tocar(celda(-1, 2));
  await tocar(celda(-1, 3));
  await tocar(copiar);
  await page.waitForTimeout(300);
  const columnas = (await portapapeles()).split("\n");
  informe.comprobar(
    `${nombre}: tocando dos títulos se copian esas columnas enteras`,
    columnas[0] === "N123AV\tB4" && columnas[2] === "N456AV\tC7",
    columnas.slice(0, 3).join(" | "),
  );
  await tocar(marcar);

  // El numero marca la fila entera.
  await tocar(rejilla.locator("tbody th").nth(1));
  await tocar(copiar);
  await page.waitForTimeout(300);
  informe.comprobar(
    `${nombre}: tocar el número de la fila la copia entera`,
    (await portapapeles()).startsWith(FILAS[1].join("\t")),
    JSON.stringify((await portapapeles()).slice(0, 40)),
  );

  // Y fuera del modo marcar, tocar sigue sirviendo para escribir.
  if (equipo.tactil) {
    await tocar(celda(4, 0));
    await page.waitForTimeout(200);
    informe.comprobar(
      `${nombre}: sin marcar, tocar abre la casilla para escribir`,
      (await rejilla.locator("input").count()) === 1,
    );
  } else {
    // Con raton: arrastrar marca, y Mayus en los numeros marca varias filas.
    await celda(0, 0).hover();
    await page.mouse.down();
    await celda(1, 1).hover();
    await page.mouse.up();
    await page.keyboard.press("Control+C");
    await page.waitForTimeout(300);
    informe.comprobar(
      `${nombre}: arrastrar con el ratón marca y Ctrl + C copia`,
      (await portapapeles()) === "J. Pérez\t12:00\nM. Gómez\t12:30",
      JSON.stringify(await portapapeles()),
    );
    await rejilla.locator("tbody th").nth(0).click();
    await rejilla.locator("tbody th").nth(2).click({ modifiers: ["Shift"] });
    await page.keyboard.press("Control+C");
    await page.waitForTimeout(300);
    informe.comprobar(
      `${nombre}: Mayús en los números marca varias filas enteras`,
      (await portapapeles()).split("\n").length === 3 &&
        (await portapapeles()).split("\n")[2].startsWith("L. Ríos\t13:00\tN456AV"),
    );
  }

  await contexto.close();
}

await navegador.close();
informe.terminar();
