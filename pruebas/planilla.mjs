import fs from "node:fs";
import path from "node:path";
import ExcelJSModulo from "exceljs";
import { SALIDA, URL_BASE, abrirNavegador, crearInforme } from "./comun.mjs";

/**
 * El flujo entero de una planilla: se escribe en espanol, se traduce al
 * ingles, se corrige el resultado a mano y se descarga el Excel.
 *
 * Es la prueba manual del encargo, hecha de verdad. Usa la IA.
 */

const ExcelJS = ExcelJSModulo.default ?? ExcelJSModulo;
const informe = crearInforme("Planilla de principio a fin");
const DIR = path.join(SALIDA, "planilla");
fs.rmSync(DIR, { recursive: true, force: true });
fs.mkdirSync(DIR, { recursive: true });

/** Las quince columnas de la plantilla Terminal, ya en inglés. */
const COLUMNAS = [
  "EMPLOYEE", "LUNCH",
  "A/C", "GATE", "ASSGN @",
  "A/C 2", "GATE 2", "ASSGN @ 2",
  "A/C 3", "GATE 3", "ASSGN @ 3",
  "A/C 4", "GATE 4", "ASSGN @ 4",
  "NOTES",
];
/** Las notas son la última columna. */
const NOTAS = COLUMNAS.length - 1;

/** Una fila del turno: solo la primera asignación y la nota. */
function fila(nombre, almuerzo, avion, puerta, hora, nota) {
  const celdas = new Array(COLUMNAS.length).fill("");
  celdas[0] = nombre;
  celdas[1] = almuerzo;
  celdas[2] = avion;
  celdas[3] = puerta;
  celdas[4] = hora;
  celdas[NOTAS] = nota;
  return celdas.join("\t");
}

/** La tabla del encargo, tal y como se copia desde Excel. */
const TABLA = [
  fila("J. Pérez", "12:00", "N123AV", "B4", "07:30", "Falla diferida MEL-21 pendiente"),
  fila("M. Gómez", "12:30", "N789AV", "A1", "08:00", "Revisión completada sin novedades"),
].join("\n");

// ---------------------------------------------------------------------------
// 0. Notas difíciles: palabras sueltas que parecen nombres, y frases cortas
// ---------------------------------------------------------------------------

/**
 * "Puntual" y "Ninguna" se quedaban en español porque, al empezar en
 * mayúscula, pasaban por apellidos. Y "PRESENTE" levantaba un aviso falso.
 */
const NOTAS_DIFICILES = [
  ["Carlos Gómez", "PRESENTE", "IB-6501", "Puntual"],
  ["Ana Martínez", "PRESENTE", "AA-1204", "Cambio de turno tarde"],
  ["Luis Torres", "VACACIONES", "CM-402", "Ninguna"],
  ["Sofía Ramírez", "PRESENTE", "DL-9920", "Apoyo sala VIP"],
  ["Pedro Ruiz", "INCAPACIDAD", "", "Pendiente revisar frenos"],
  ["Marta León", "PRESENTE", "LA-4405", "Listo"],
  ["Jorge Díaz", "PRESENTE", "UA-5541", "Sin novedad"],
  ["Elena Soto", "DESCANSO", "", "Llega tarde, avisó al supervisor"],
];

const respuestaNotas = await fetch(`${URL_BASE}/api/planilla`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    target: "en",
    doc: {
      template: "hangar",
      title: "HANGAR DAILY ASSIGNMENT",
      meta: { date: "05/10/2026", shift: "Tarde", supervisor: "Paula Andrea Ochoa" },
      sections: [
        { title: "", columns: ["EMPLEADO", "ESTADO", "AVIÓN", "NOTAS"], rows: NOTAS_DIFICILES },
      ],
    },
  }),
});
const notas = await respuestaNotas.json();

informe.comprobar(
  "las notas difíciles se traducen sin avisos",
  respuestaNotas.ok && !notas.avisos,
  notas.avisos ? notas.avisos.map((aviso) => aviso.message).join(" | ") : "sin avisos",
);

if (notas.doc) {
  const filas = notas.doc.sections[0].rows;
  console.log("\n--- notas difíciles ---");
  filas.forEach((fila, indice) => console.log(`  ${NOTAS_DIFICILES[indice][3].padEnd(34)} -> ${fila[3]}`));

  /** Palabras que delatan una nota sin traducir. */
  const ESPANOL = /\b(puntual|ninguna|pendiente|listo|novedad|revisar|frenos|tarde|cambio|turno|sala|apoyo|llega|avis[oó]|sin)\b/i;
  const sinTraducir = filas.filter((fila) => ESPANOL.test(fila[3]));
  informe.comprobar(
    "todas las notas quedan en inglés",
    sinTraducir.length === 0,
    sinTraducir.map((fila) => fila[3]).join(" | ") || "8 de 8",
  );
  informe.comprobar(
    "ninguna nota vuelve igual que en español",
    filas.every((fila, indice) => fila[3] !== NOTAS_DIFICILES[indice][3]),
  );
  informe.comprobar(
    "los estados salen de la tabla fija",
    filas.map((fila) => fila[1]).join("|") ===
      "PRESENT|PRESENT|VACATION|PRESENT|SICK LEAVE|PRESENT|PRESENT|DAY OFF",
    filas.map((fila) => fila[1]).join(" · "),
  );
  informe.comprobar(
    "los nombres no se tocan",
    filas.every((fila, indice) => fila[0] === NOTAS_DIFICILES[indice][0]),
  );
  informe.comprobar(
    "el turno y la fecha pasan al inglés",
    notas.doc.meta.shift === "AFTERNOON" && notas.doc.meta.date === "10/05/2026",
    `${notas.doc.meta.shift} · ${notas.doc.meta.date}`,
  );
}

const navegador = await abrirNavegador();
const contexto = await navegador.newContext({
  viewport: { width: 1440, height: 1000 },
  acceptDownloads: true,
  permissions: ["clipboard-read", "clipboard-write"],
});
const page = await contexto.newPage();
page.on("pageerror", (error) => informe.anotarError(`error de página: ${error.message}`));
await page.goto(URL_BASE, { waitUntil: "domcontentloaded" });
await page.waitForTimeout(2000);

await page.getByRole("tab", { name: /Planillas/ }).click();
await page.waitForTimeout(400);

const tabla = () => page.locator('[role="grid"]').first();
const celda = (fila, columna) => tabla().locator(`[data-celda="${fila}:${columna}"]`);
const encabezados = () => tabla().locator('[data-celda^="-1:"]').allTextContents();
const filasConDatos = async () => {
  const todas = await tabla().locator("tbody tr").count();
  let llenas = 0;
  for (let fila = 0; fila < todas; fila += 1) {
    if ((await celda(fila, 0).innerText()).trim()) llenas += 1;
  }
  return llenas;
};

// --- 1. Se escribe la planilla en español ---
await page.getByLabel("Fecha").fill("14/10/2026");
await page.getByLabel("Turno").fill("Día");
await page.getByLabel("Supervisor").fill("Paula Andrea Ochoa");

await celda(0, 0).click();
await page.evaluate((texto) => navigator.clipboard.writeText(texto), TABLA);
await page.keyboard.press("Control+V");
await page.waitForTimeout(400);

informe.comprobar(
  "la tabla pegada se puede editar antes de traducir",
  (await celda(0, 0).innerText()) === "J. Pérez" &&
    (await celda(1, NOTAS).innerText()) === "Revisión completada sin novedades",
);

// Se corrige una celda a mano, como haría cualquiera antes de traducir.
await celda(0, 3).dblclick();
await page.keyboard.press("Control+A");
await page.keyboard.type("B4");
await page.keyboard.press("Enter");
await page.waitForTimeout(200);

// --- 2. Traducir ---
await page.getByRole("button", { name: /Traducir y generar Excel/ }).click();
// Hay dos juegos de pestañas: la de secciones y la de idioma.
await page.waitForFunction(
  () =>
    [...document.querySelectorAll('[role="tab"][aria-selected="true"]')].some((pestana) =>
      pestana.textContent?.includes("inglés"),
    ),
  undefined,
  { timeout: 120000 },
);
await page.waitForTimeout(600);

const columnas = await encabezados();
console.log(`  encabezados: ${columnas.join(" · ")}`);
informe.comprobar(
  "los encabezados salen en el inglés de la plantilla",
  columnas.join("|") === COLUMNAS.join("|"),
  columnas.join(" · "),
);

const resultado = await tabla().innerText();
console.log(`\n--- resultado ---\n${resultado}\n`);

informe.comprobar("no se añadieron filas", (await filasConDatos()) === 2, `${await filasConDatos()}`);
informe.comprobar("los nombres no se tocan", (await celda(0, 0).innerText()) === "J. Pérez");
informe.comprobar("y el segundo tampoco", (await celda(1, 0).innerText()) === "M. Gómez");
informe.comprobar("la matrícula es idéntica", (await celda(0, 2).innerText()) === "N123AV");
informe.comprobar("la puerta es idéntica", (await celda(0, 3).innerText()) === "B4");
informe.comprobar("la hora es idéntica", (await celda(0, 4).innerText()) === "07:30");
informe.comprobar("el almuerzo es idéntico", (await celda(0, 1).innerText()) === "12:00");
informe.comprobar(
  "las celdas vacías siguen vacías",
  (await celda(0, 5).innerText()).trim() === "" && (await celda(0, 6).innerText()).trim() === "",
);
informe.comprobar("MEL-21 se conserva", (await celda(0, NOTAS).innerText()).includes("MEL-21"));
informe.comprobar(
  "las notas están traducidas",
  !/pendiente|Revisi.n|novedades|completada/i.test(resultado),
);
informe.comprobar(
  "el turno también se traduce",
  (await page.getByLabel("Turno").inputValue()) === "DAY",
  await page.getByLabel("Turno").inputValue(),
);

// --- 3. Corregir el resultado a mano ---
await celda(1, NOTAS).dblclick();
await page.keyboard.press("Control+A");
await page.keyboard.type("Inspection completed with no findings");
await page.keyboard.press("Enter");
await page.waitForTimeout(300);
informe.comprobar(
  "el resultado en inglés también se puede corregir",
  (await celda(1, NOTAS).innerText()) === "Inspection completed with no findings",
  await celda(1, NOTAS).innerText(),
);

// --- 4. Descargar el Excel ---
const [descarga] = await Promise.all([
  page.waitForEvent("download", { timeout: 60000 }),
  page.getByRole("button", { name: "Descargar Excel" }).click(),
]);
const archivo = path.join(DIR, descarga.suggestedFilename());
await descarga.saveAs(archivo);
console.log(
  `  archivo: ${descarga.suggestedFilename()} · ${(fs.statSync(archivo).size / 1024).toFixed(0)} KB`,
);

informe.comprobar(
  "el archivo lleva el título y la fecha",
  /^[a-z0-9-]+-\d{4}-\d{2}-\d{2}\.xlsx$/.test(descarga.suggestedFilename()),
  descarga.suggestedFilename(),
);

const libro = new ExcelJS.Workbook();
await libro.xlsx.readFile(archivo);
const hoja = libro.worksheets[0];

informe.comprobar(
  "el nombre de la hoja es válido",
  hoja.name.length <= 31 && !/[:\\/?*[\]]/.test(hoja.name),
  hoja.name,
);
informe.comprobar("el Excel lleva el logo", (libro.model.media ?? []).length > 0);

let filaEncabezado = 0;
hoja.eachRow((fila, numero) => {
  if (!filaEncabezado && String(fila.getCell(1).value ?? "") === "EMPLOYEE") filaEncabezado = numero;
});
informe.comprobar("hay fila de encabezado", filaEncabezado > 0, `fila ${filaEncabezado}`);

if (filaEncabezado > 0) {
  const leidos = COLUMNAS.map((_, indice) =>
    String(hoja.getRow(filaEncabezado).getCell(indice + 1).value ?? ""),
  );
  informe.comprobar(
    "los encabezados del Excel coinciden",
    leidos.join("|") === COLUMNAS.join("|"),
    leidos.join(" · "),
  );

  const primera = hoja.getRow(filaEncabezado + 1);
  const segunda = hoja.getRow(filaEncabezado + 2);

  informe.comprobar("la matrícula queda como texto", primera.getCell(3).value === "N123AV");
  informe.comprobar("la puerta queda como texto", primera.getCell(4).value === "B4");
  informe.comprobar("el nombre conserva la tilde", primera.getCell(1).value === "J. Pérez");

  const hora = primera.getCell(5);
  const fraccion =
    hora.value instanceof Date
      ? (hora.value.getTime() - Date.UTC(1899, 11, 30)) / 86400000
      : Number(hora.value);
  informe.comprobar(
    "la hora es una hora de verdad",
    Math.abs(fraccion - 7.5 / 24) < 1e-6 && hora.numFmt === "hh:mm",
    `${fraccion} · ${hora.numFmt}`,
  );

  informe.comprobar(
    "el Excel trae la corrección hecha a mano",
    String(segunda.getCell(NOTAS + 1).value ?? "") === "Inspection completed with no findings",
    String(segunda.getCell(NOTAS + 1).value ?? ""),
  );
  informe.comprobar(
    "MEL-21 sigue en el Excel",
    String(primera.getCell(NOTAS + 1).value ?? "").includes("MEL-21"),
    String(primera.getCell(NOTAS + 1).value ?? ""),
  );
  informe.comprobar(
    "no hay una tercera fila inventada",
    !String(hoja.getRow(filaEncabezado + 3).getCell(1).value ?? "").trim(),
  );
}

informe.comprobar("se imprime en horizontal", hoja.pageSetup?.orientation === "landscape");
informe.comprobar("se ajusta a una página de ancho", hoja.pageSetup?.fitToWidth === 1);
informe.comprobar(
  "repite el encabezado al imprimir",
  Boolean(hoja.pageSetup?.printTitlesRow),
  String(hoja.pageSetup?.printTitlesRow),
);
informe.comprobar(
  "el pie lleva la numeración",
  /Page &P of &N/.test(hoja.headerFooter?.oddFooter ?? ""),
  hoja.headerFooter?.oddFooter ?? "",
);
informe.comprobar("hay autofiltro", Boolean(hoja.autoFilter));
informe.comprobar("el panel queda fijo", hoja.views?.[0]?.ySplit === filaEncabezado);

// --- 5. Si se cambia la entrada, el resultado queda marcado ---
await page.getByRole("tab", { name: "Entrada en español" }).click();
await page.waitForTimeout(300);
await celda(0, NOTAS).dblclick();
await page.keyboard.press("Control+A");
await page.keyboard.type("Falla diferida MEL-21 y cambio de pieza");
await page.keyboard.press("Enter");
await page.waitForTimeout(300);
await page.getByRole("tab", { name: "Resultado en inglés" }).click();
await page.waitForTimeout(300);

informe.comprobar(
  "avisa de que el resultado quedó desactualizado",
  await page.getByText(/vuelve a traducir/i).isVisible(),
);

await page.screenshot({ path: `${SALIDA}/planilla-resultado.png` });
await navegador.close();
informe.terminar();
