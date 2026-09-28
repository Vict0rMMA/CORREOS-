import {
  SALIDA,
  URL_BASE,
  abrirNavegador,
  crearInforme,
} from "./comun.mjs";

/**
 * La interfaz en todos los tamanos: que nada se salga de la pantalla, que la
 * pagina se pueda desplazar y que siempre se vea oscura.
 *
 * No usa la IA: no consume cuota.
 */

const informe = crearInforme("Interfaz y tamanos de pantalla");
const navegador = await abrirNavegador();

const PANTALLAS = [
  { nombre: "celular pequeno", ancho: 320, alto: 740 },
  { nombre: "celular", ancho: 390, alto: 844 },
  { nombre: "tablet", ancho: 820, alto: 1180 },
  { nombre: "portatil", ancho: 1280, alto: 620 },
  { nombre: "escritorio", ancho: 1440, alto: 900 },
];

for (const pantalla of PANTALLAS) {
  const contexto = await navegador.newContext({
    viewport: { width: pantalla.ancho, height: pantalla.alto },
  });
  const page = await contexto.newPage();
  page.on("pageerror", (error) => informe.anotarError(`error de página: ${error.message}`));
  await page.goto(URL_BASE, { waitUntil: "networkidle" });
  await page.fill("#paula-input", "texto de prueba para que haya contenido en la pagina");
  await page.waitForTimeout(300);

  const medidas = await page.evaluate(() => ({
    ancho: document.documentElement.scrollWidth,
    visible: document.documentElement.clientWidth,
    alto: document.documentElement.scrollHeight,
  }));
  informe.comprobar(
    `${pantalla.nombre} (${pantalla.ancho}px): nada se sale de la pantalla`,
    medidas.ancho === medidas.visible,
    `${medidas.ancho}/${medidas.visible}`,
  );

  // La rueda del raton tiene que mover la pagina
  if (medidas.alto > pantalla.alto) {
    await page.mouse.move(pantalla.ancho / 2, pantalla.alto / 2);
    await page.mouse.wheel(0, 400);
    await page.waitForTimeout(300);
    const desplazado = await page.evaluate(() => window.scrollY);
    informe.comprobar(`${pantalla.nombre}: la página se desplaza`, desplazado > 0, `${desplazado}px`);
  }

  await contexto.close();
}

// Siempre oscura, aunque el sistema este en tema claro
for (const esquema of ["light", "dark"]) {
  const contexto = await navegador.newContext({
    viewport: { width: 1280, height: 850 },
    colorScheme: esquema,
  });
  const page = await contexto.newPage();
  await page.goto(URL_BASE, { waitUntil: "networkidle" });

  const fondo = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
  const numeros = fondo.match(/\d+/g) ?? [];
  const esOscuro = Number(numeros[0]) + Number(numeros[1]) + Number(numeros[2]) < 120;
  informe.comprobar(`sistema en ${esquema}: la web sigue oscura`, esOscuro, fondo);

  // Al imprimir, el documento va en blanco
  await page.emulateMedia({ media: "print" });
  await page.waitForTimeout(200);
  const fondoImpresion = await page.evaluate(
    () => getComputedStyle(document.body).backgroundColor,
  );
  informe.comprobar(
    `sistema en ${esquema}: al imprimir el fondo es blanco`,
    /255,\s*255,\s*255/.test(fondoImpresion),
    fondoImpresion,
  );
  if (esquema === "dark") {
    await page.emulateMedia({ media: "screen" });
    await page.screenshot({ path: `${SALIDA}/interfaz.png` });
  }
  await contexto.close();
}

await navegador.close();
informe.terminar();
