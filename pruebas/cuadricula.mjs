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

// --- 0. Lo que viene puesto, y copiar y pegar sin saber atajos ---
const hoy = new Date();
const fechaDeHoy = `${String(hoy.getDate()).padStart(2, "0")}/${String(hoy.getMonth() + 1).padStart(2, "0")}/${hoy.getFullYear()}`;
informe.comprobar(
  "el crew chief ya viene puesto",
  (await page.getByLabel("Crew chief").inputValue()) === "Paula Andrea Ochoa",
  await page.getByLabel("Crew chief").inputValue(),
);
informe.comprobar(
  "y la fecha de hoy también",
  (await page.getByLabel("Fecha").inputValue()) === fechaDeHoy,
  await page.getByLabel("Fecha").inputValue(),
);

// Pegar sin haber tocado ninguna casilla: va a la tabla principal.
await page.evaluate(() => document.activeElement?.blur());
await page.evaluate(() => {
  const datos = new DataTransfer();
  datos.setData("text/plain", ["J. Pérez", "12:00", "N123AV"].join("\t"));
  document.body.dispatchEvent(new ClipboardEvent("paste", { clipboardData: datos, bubbles: true }));
});
await page.waitForTimeout(300);
informe.comprobar(
  "se puede pegar sin elegir casilla antes",
  (await celda(0, 0).innerText()) === "J. Pérez" && (await celda(0, 2).innerText()) === "N123AV",
  `${await celda(0, 0).innerText()} / ${await celda(0, 2).innerText()}`,
);

// Tocar una casilla que ya estaba elegida la abre para escribir...
await celda(1, 0).click();
await celda(1, 0).click();
await page.keyboard.type("M. Gómez");
await page.keyboard.press("Enter");
await page.waitForTimeout(200);
informe.comprobar(
  "un toque en la casilla elegida basta para escribir",
  (await celda(1, 0).innerText()) === "M. Gómez",
  await celda(1, 0).innerText(),
);

// ...y si en ese momento se pega una tabla, se reparte, no cae entera ahí.
await celda(2, 0).click();
await celda(2, 0).click();
await page.evaluate(
  (texto) => navigator.clipboard.writeText(texto),
  [["L. Ríos", "13:00", "N456AV"].join("\t"), ["A. Díaz", "13:30", "N789AV"].join("\t")].join("\n"),
);
await page.keyboard.press("Control+V");
await page.waitForTimeout(300);
informe.comprobar(
  "pegar una tabla con la casilla abierta la reparte por columnas",
  (await celda(2, 0).innerText()) === "L. Ríos" && (await celda(3, 2).innerText()) === "N789AV",
  `${await celda(2, 0).innerText()} / ${await celda(3, 2).innerText()}`,
);

// La barra de arriba escribe en la casilla elegida.
await celda(0, 4).click();
await page.getByPlaceholder("Toca una casilla y escribe aquí").fill("07:30");
await page.keyboard.press("Enter");
await page.waitForTimeout(200);
informe.comprobar(
  "la barra de arriba escribe en la casilla",
  (await celda(0, 4).innerText()) === "07:30",
  await celda(0, 4).innerText(),
);

// Copiar la tabla entera, con sus títulos.
await page.getByRole("button", { name: "Copiar tabla" }).first().click();
await page.waitForTimeout(300);
const tablaCopiada = (await page.evaluate(() => navigator.clipboard.readText())).split("\n");
informe.comprobar(
  "Copiar tabla lleva los títulos y las filas escritas",
  tablaCopiada[0].startsWith("EMPLEADO\tALMUERZO") &&
    tablaCopiada[1].startsWith("J. Pérez\t12:00\tN123AV") &&
    tablaCopiada.length === 5,
  `${tablaCopiada.length} líneas`,
);

// El botón Pegar.
await celda(5, 0).click();
await page.evaluate((texto) => navigator.clipboard.writeText(texto), "C. Rojas");
await page.getByRole("button", { name: "Pegar", exact: true }).first().click();
await page.waitForTimeout(300);
informe.comprobar(
  "el botón Pegar pega en la casilla elegida",
  (await celda(5, 0).innerText()) === "C. Rojas",
  await celda(5, 0).innerText(),
);

// Se deja la planilla como estaba para el resto de la prueba. Cambiar de
// plantilla ya no pregunta: la escrita queda en Guardadas.
await page.getByLabel("Plantilla").selectOption("hangar");
await page.waitForTimeout(300);
await page.getByLabel("Plantilla").selectOption("terminal");
await page.waitForTimeout(300);

// --- 1. Las cuatro plantillas ---
const selector = page.getByLabel("Plantilla");
const opciones = await selector.locator("option").allTextContents();
informe.comprobar(
  "están las cuatro plantillas",
  JSON.stringify(opciones) ===
    JSON.stringify(["Terminal", "Hangar", "Turnos nocturnos", "En blanco"]),
  opciones.join(" · "),
);

// Las columnas exactas de cada plantilla se comprueban en plantillas.mjs.
informe.comprobar(
  "Terminal trae sus cuatro asignaciones",
  (await encabezados()).length === 15 &&
    (await encabezados())[0] === "EMPLEADO" &&
    (await encabezados()).at(-1) === "NOTAS",
  `${(await encabezados()).length} columnas`,
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

// --- 4b. Pegar algo copiado de una pantalla, separado por espacios ---
await selector.selectOption("terminal");
await page.waitForTimeout(300);

// Las ocho primeras columnas de Terminal, alineadas con espacios como las
// deja una tabla copiada de una pantalla o de un PDF.
const ANCHOS = [12, 12, 10, 10, 16, 10, 10, 0];
const alinear = (celdas) =>
  celdas.map((c, i) => (ANCHOS[i] ? String(c).padEnd(ANCHOS[i]) : String(c))).join("").trimEnd();
const conEspacios = [
  alinear(["EMPLEADO", "ALMUERZO", "AVIÓN", "PUERTA", "HORA ASIGNADO", "AVIÓN 2", "PUERTA 2", "HORA ASIGNADO 2"]),
  alinear(["J. Pérez", "12:00", "N123AV", "B4", "07:30", "", "", "09:00"]),
  alinear(["M. Gómez", "12:30", "N789AV", "A1", "08:00", "N456AV", "C2", "09:30"]),
].join(String.fromCharCode(10));

await celda(0, 0).click();
await page.evaluate((texto) => navigator.clipboard.writeText(texto), conEspacios);
await page.keyboard.press("Control+V");
await page.waitForTimeout(400);

informe.comprobar(
  "lo copiado con espacios también se reparte por columnas",
  (await celda(0, 0).innerText()) === "J. Pérez" &&
    (await celda(0, 2).innerText()) === "N123AV",
  `${await celda(0, 0).innerText()} / ${await celda(0, 2).innerText()}`,
);
informe.comprobar(
  "la fila de encabezados pegada no cuenta como un empleado",
  (await celda(0, 0).innerText()) !== "EMPLEADO",
);
informe.comprobar(
  "las columnas vacías se respetan y el dato cae en su sitio",
  (await celda(0, 5).innerText()).trim() === "" &&
    (await celda(0, 6).innerText()).trim() === "" &&
    (await celda(0, 7).innerText()) === "09:00",
  `col5="${(await celda(0, 5).innerText()).trim()}" col7="${await celda(0, 7).innerText()}"`,
);
informe.comprobar(
  "y las que sí tienen dato también",
  (await celda(1, 5).innerText()) === "N456AV" && (await celda(1, 6).innerText()) === "C2",
  `${await celda(1, 5).innerText()} / ${await celda(1, 6).innerText()}`,
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

// --- 9b. Ratón: arrastrar para marcar, y Copiar/Pegar con el clic derecho ---
// El menú del navegador no se puede pulsar desde una prueba. Se comprueba lo
// que el menú necesita para ofrecer Copiar y Pegar (un campo escribible,
// enfocado y con lo marcado seleccionado bajo el ratón) y después se lanzan
// los mismos eventos que lanza el menú al elegir cada opción.
await celda(6, 0).click();
await page.evaluate(
  (texto) => navigator.clipboard.writeText(texto),
  ["R1", "S1", "T1"].join("\t") + "\n" + ["R2", "S2", "T2"].join("\t"),
);
await page.keyboard.press("Control+V");
await page.waitForTimeout(300);

const origen = await celda(6, 0).boundingBox();
const final = await celda(7, 2).boundingBox();
await page.mouse.move(origen.x + 20, origen.y + 10);
await page.mouse.down();
await page.mouse.move(final.x + 20, final.y + 10, { steps: 10 });
await page.mouse.up();
await page.waitForTimeout(150);
informe.comprobar(
  "arrastrar con el ratón marca un bloque",
  (await tabla().locator('td[aria-selected="true"]').count()) === 6,
  `${await tabla().locator('td[aria-selected="true"]').count()} casillas`,
);

await page.mouse.click(final.x + 20, final.y + 10, { button: "right" });
await page.waitForTimeout(150);
const bajoElRaton = await page.evaluate(([x, y]) => {
  const elemento = document.elementFromPoint(x, y);
  return {
    escribible: elemento?.tagName === "TEXTAREA" && document.activeElement === elemento,
    seleccionado:
      elemento?.tagName === "TEXTAREA"
        ? elemento.value.slice(elemento.selectionStart, elemento.selectionEnd)
        : "",
  };
}, [final.x + 20, final.y + 10]);
informe.comprobar(
  "con el clic derecho el menú ofrece Pegar (hay un campo bajo el ratón)",
  bajoElRaton.escribible,
);
informe.comprobar(
  "y ofrece Copiar, con lo marcado ya seleccionado",
  bajoElRaton.seleccionado.split("\n").length === 2,
  JSON.stringify(bajoElRaton.seleccionado),
);

await page.evaluate(() => document.execCommand("copy"));
await page.waitForTimeout(200);
informe.comprobar(
  "Copiar del menú copia el bloque marcado",
  (await page.evaluate(() => navigator.clipboard.readText())).replace(/\r/g, "") ===
    "R1\tS1\tT1\nR2\tS2\tT2",
);

const destino = await celda(8, 0).boundingBox();
await page.mouse.click(destino.x + 20, destino.y + 10, { button: "right" });
await page.waitForTimeout(150);
await page.evaluate(() => {
  const datos = new DataTransfer();
  datos.setData("text/plain", ["V. Gil", "14:00", "N999AV"].join("\t"));
  document.activeElement.dispatchEvent(
    new ClipboardEvent("paste", { clipboardData: datos, bubbles: true, cancelable: true }),
  );
});
await page.waitForTimeout(300);
informe.comprobar(
  "Pegar del menú pega en la casilla del clic derecho, repartido",
  (await celda(8, 0).innerText()) === "V. Gil" && (await celda(8, 2).innerText()) === "N999AV",
  `${await celda(8, 0).innerText()} / ${await celda(8, 2).innerText()}`,
);

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
