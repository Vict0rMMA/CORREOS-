import { SALIDA, URL_BASE, abrirNavegador, crearInforme } from "./comun.mjs";

/**
 * La cuadricula de Planillas: escribir, moverse, pegar, anadir y quitar filas
 * y columnas, y deshacer. Es lo que hace que trabajar aqui se parezca a Excel.
 *
 * No usa la IA.
 */

const informe = crearInforme("Cuadrícula de planillas");

const navegador = await abrirNavegador();
const contexto = await navegador.newContext({
  viewport: { width: 1440, height: 1000 },
  permissions: ["clipboard-read", "clipboard-write"],
});
const page = await contexto.newPage();
page.on("pageerror", (error) => informe.anotarError(`error de página: ${error.message}`));
await page.goto(URL_BASE, { waitUntil: "domcontentloaded" });
await page.waitForTimeout(2000);

await page.getByRole("tab", { name: /Planillas/ }).click();
await page.waitForTimeout(400);

// La planilla de noches tiene cuatro cuadriculas: aqui se mira la principal.
const tabla = () => page.locator('[role="grid"]').first();
const celda = (fila, columna) => tabla().locator(`[data-celda="${fila}:${columna}"]`);
const encabezados = () => tabla().locator('[data-celda^="-1:"]').allTextContents();
const filas = () => tabla().locator("tbody tr").count();

/** Escribe en una celda como lo haría una persona. */
async function escribir(fila, columna, texto) {
  await celda(fila, columna).click();
  await page.keyboard.type(texto);
  await page.keyboard.press("Enter");
  await page.waitForTimeout(120);
}

// --- 1. Las cuatro plantillas ---
const selector = page.getByLabel("Plantilla");
const opciones = await selector.locator("option").allTextContents();
informe.comprobar(
  "están las cuatro plantillas",
  JSON.stringify(opciones) ===
    JSON.stringify(["Terminal", "Hangar", "Turnos nocturnos", "En blanco"]),
  opciones.join(" · "),
);

informe.comprobar(
  "Terminal trae sus columnas",
  (await encabezados()).join("|") ===
    "EMPLEADO|ALMUERZO|AVIÓN|PUERTA|HORA ASIGNADO|AVIÓN 2|PUERTA 2|NOTAS",
  (await encabezados()).join(" · "),
);

await selector.selectOption("hangar");
await page.waitForTimeout(300);
informe.comprobar(
  "Hangar tiene columnas distintas",
  (await encabezados()).includes("ESTADO") && (await encabezados()).includes("HORA SALIDA"),
  (await encabezados()).join(" · "),
);

await selector.selectOption("nights");
await page.waitForTimeout(300);
const bloques = await page.locator('[role="grid"]').count();
informe.comprobar("Turnos nocturnos trae sus cuatro bloques", bloques === 4, `${bloques}`);
informe.comprobar(
  "y el bloque de vehículos",
  await page.getByText("VEHÍCULOS", { exact: true }).isVisible(),
);
informe.comprobar(
  "las plantillas empiezan vacías",
  (await celda(0, 0).innerText()).trim() === "",
);

await selector.selectOption("terminal");
await page.waitForTimeout(300);

// --- 2. Escribir y moverse ---
await escribir(0, 0, "J. Pérez");
informe.comprobar("se escribe en una celda", (await celda(0, 0).innerText()) === "J. Pérez");

await celda(0, 0).click();
await page.keyboard.press("ArrowRight");
await page.keyboard.press("ArrowRight");
await page.keyboard.type("N123AV");
await page.keyboard.press("Enter");
await page.waitForTimeout(150);
informe.comprobar(
  "las flechas mueven la selección",
  (await celda(0, 2).innerText()) === "N123AV",
  await celda(0, 2).innerText(),
);

await celda(1, 0).click();
await page.keyboard.press("Tab");
await page.keyboard.type("12:00");
await page.keyboard.press("Enter");
await page.waitForTimeout(150);
informe.comprobar(
  "el tabulador pasa a la siguiente columna",
  (await celda(1, 1).innerText()) === "12:00",
  await celda(1, 1).innerText(),
);

// --- 3. Editar un encabezado ---
await celda(-1, 7).dblclick();
await page.keyboard.press("Control+A");
await page.keyboard.type("OBSERVACIONES");
await page.keyboard.press("Enter");
await page.waitForTimeout(200);
informe.comprobar(
  "los encabezados se pueden cambiar",
  (await encabezados())[7] === "OBSERVACIONES",
  (await encabezados())[7],
);

// --- 4. Pegar un bloque de Excel ---
const bloque = [
  "L. Ríos\t13:00\tN456AV\tC7\t09:15\t\t\tCambio de llanta",
  "A. Díaz\t13:30\tN321AV\tB6\t09:45\t\t\tInspección pendiente",
].join("\n");

await celda(2, 0).click();
await page.evaluate((texto) => navigator.clipboard.writeText(texto), bloque);
await page.keyboard.press("Control+V");
await page.waitForTimeout(400);

informe.comprobar(
  "pegar reparte las celdas por columnas",
  (await celda(2, 2).innerText()) === "N456AV" && (await celda(3, 4).innerText()) === "09:45",
  `${await celda(2, 2).innerText()} / ${await celda(3, 4).innerText()}`,
);
informe.comprobar(
  "y respeta los saltos de línea",
  (await celda(3, 0).innerText()) === "A. Díaz",
  await celda(3, 0).innerText(),
);

// --- 5. Pegar más filas de las que hay ---
const antesDePegar = await filas();
const largo = Array.from({ length: antesDePegar + 4 }, (_, i) => `Fila ${i + 1}`).join("\n");
await celda(0, 5).click();
await page.evaluate((texto) => navigator.clipboard.writeText(texto), largo);
await page.keyboard.press("Control+V");
await page.waitForTimeout(400);
const despuesDePegar = await filas();
informe.comprobar(
  "si no caben, la cuadrícula crece",
  despuesDePegar === antesDePegar + 4,
  `${antesDePegar} -> ${despuesDePegar}`,
);
informe.comprobar(
  "no se pierde ninguna fila al crecer",
  (await celda(despuesDePegar - 1, 5).innerText()) === `Fila ${despuesDePegar}`,
  await celda(despuesDePegar - 1, 5).innerText(),
);

// --- 6. Copiar ---
await celda(2, 0).click();
await page.keyboard.down("Shift");
await page.keyboard.press("ArrowRight");
await page.keyboard.up("Shift");
await page.keyboard.press("Control+C");
await page.waitForTimeout(300);
const copiado = await page.evaluate(() => navigator.clipboard.readText());
informe.comprobar(
  "Ctrl + C copia el rango con tabuladores",
  copiado === "L. Ríos\t13:00",
  JSON.stringify(copiado),
);

// --- 7. Borrar contenido sin romper la estructura ---
const filasAntesDeBorrar = await filas();
await celda(3, 0).click();
await page.keyboard.press("Delete");
await page.waitForTimeout(200);
informe.comprobar(
  "Supr vacía la celda y deja la fila",
  (await celda(3, 0).innerText()).trim() === "" && (await filas()) === filasAntesDeBorrar,
);

// --- 8. Deshacer y rehacer ---
await page.keyboard.press("Control+Z");
await page.waitForTimeout(250);
informe.comprobar(
  "Ctrl + Z deshace",
  (await celda(3, 0).innerText()) === "A. Díaz",
  await celda(3, 0).innerText(),
);
await page.keyboard.press("Control+Shift+Z");
await page.waitForTimeout(250);
informe.comprobar(
  "Ctrl + Shift + Z rehace",
  (await celda(3, 0).innerText()).trim() === "",
  JSON.stringify(await celda(3, 0).innerText()),
);

// --- 9. Filas y columnas ---
const filasAntes = await filas();
await page.getByRole("button", { name: "+ Fila" }).click();
await page.waitForTimeout(200);
informe.comprobar("se añade una fila", (await filas()) === filasAntes + 1);

await page.getByRole("button", { name: /^− Fila/ }).click();
await page.waitForTimeout(200);
informe.comprobar("se quita una fila", (await filas()) === filasAntes);

const columnasAntes = (await encabezados()).length;
await page.getByRole("button", { name: "+ Columna" }).click();
await page.waitForTimeout(200);
informe.comprobar(
  "se añade una columna",
  (await encabezados()).length === columnasAntes + 1,
  `${columnasAntes} -> ${(await encabezados()).length}`,
);

await page.getByRole("button", { name: /^− Columna/ }).click();
await page.waitForTimeout(200);
informe.comprobar("se quita una columna", (await encabezados()).length === columnasAntes);

// --- 10. Nada se sale de la pantalla en el celular ---
await page.setViewportSize({ width: 390, height: 844 });
await page.waitForTimeout(400);
const medida = await page.evaluate(() => [
  document.documentElement.scrollWidth,
  window.innerWidth,
]);
informe.comprobar(
  "en el celular la página no se desborda",
  medida[0] <= medida[1],
  `${medida[0]} / ${medida[1]}`,
);
await page.screenshot({ path: `${SALIDA}/cuadricula-movil.png` });

await navegador.close();
informe.terminar();
