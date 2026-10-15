import { URL_BASE, abrirNavegador, crearInforme } from "./comun.mjs";

/**
 * La nube (Supabase), de punta a punta y desde el navegador, como Paula:
 * escribe una planilla, espera a que diga "Guardada", recarga la pagina y la
 * planilla sigue ahi, con sus tildes. Y los correos que estaban solo en el
 * navegador se suben solos.
 *
 * Si la nube no esta configurada (falta SUPABASE_SECRET_KEY), se omite.
 * No usa la IA. Lo que crea lo deja marcado como borrado al terminar.
 */

const informe = crearInforme("Guardado en la nube");

const estado = await fetch(`${URL_BASE}/api/planillas`).then((respuesta) => respuesta.status);
if (estado !== 200) {
  console.log("  (la nube no está configurada: se omite)");
  informe.terminar();
  process.exit(0);
}

const MARCA = `PRUEBA ${Date.now()}`;
const ID_GUARDADO = `prueba-nube-${Date.now()}`;

const navegador = await abrirNavegador({ nube: true });
const contexto = await navegador.newContext({ viewport: { width: 1440, height: 1000 } });
const page = await contexto.newPage();
page.on("pageerror", (error) => informe.anotarError(`error de página: ${error.message}`));

// Un correo que solo existe en este navegador, como los de antes.
await page.addInitScript(
  ([id]) => {
    if (sessionStorage.getItem("sembrado")) return;
    sessionStorage.setItem("sembrado", "1");
    localStorage.setItem(
      "paula:history",
      JSON.stringify([
        {
          id,
          preview: "Revisión del tren de aterrizaje",
          input: "Revisión del tren de aterrizaje del avión N123AV",
          output: "Landing gear inspection on aircraft N123AV",
          lang: "en",
          action: "to_english",
          textType: "email",
          tone: "professional",
          createdAt: Date.now(),
        },
      ]),
    );
  },
  [ID_GUARDADO],
);

await page.goto(URL_BASE, { waitUntil: "domcontentloaded" });
await page.waitForTimeout(3000);

// --- Los correos del navegador suben solos ---
const enNube = await fetch(`${URL_BASE}/api/guardados`).then((respuesta) => respuesta.json());
const subido = enNube.guardados?.find((item) => item.id === ID_GUARDADO);
informe.comprobar("los correos que estaban en el navegador se suben", Boolean(subido));
informe.comprobar(
  "con sus tildes intactas",
  subido?.input === "Revisión del tren de aterrizaje del avión N123AV",
  subido?.input ?? "",
);

// --- Una planilla se guarda sola ---
await page.getByRole("tab", { name: /Planillas/ }).click();
await page.waitForTimeout(500);
await page.getByRole("button", { name: /Nueva/ }).click();
await page.waitForTimeout(400);

const celda = (fila, columna) =>
  page.locator('[role="grid"]').first().locator(`[data-celda="${fila}:${columna}"]`);

await page.getByLabel("Turno").fill("Día");
await celda(0, 0).click();
await page.keyboard.type("J. Pérez");
await page.keyboard.press("Enter");
await celda(0, 14).click();
await page.keyboard.type(MARCA);
await page.keyboard.press("Enter");

await page.waitForFunction(
  () => document.querySelector('[data-estado-nube="guardada"]') !== null,
  undefined,
  { timeout: 20000 },
);
informe.comprobar(
  "dice Guardada sin tener que pulsar nada",
  await page.locator('[data-estado-nube="guardada"]').isVisible(),
  await page.locator("[data-estado-nube]").innerText(),
);

// --- Se cierra y se vuelve: sigue ahí ---
await page.reload({ waitUntil: "domcontentloaded" });
await page.waitForTimeout(3500);
await page.getByRole("tab", { name: /Planillas/ }).click();
await page.waitForTimeout(800);

informe.comprobar(
  "al volver, la planilla de hoy sigue donde estaba",
  (await celda(0, 14).innerText()) === MARCA,
  await celda(0, 14).innerText(),
);
informe.comprobar(
  "con las tildes intactas",
  (await celda(0, 0).innerText()) === "J. Pérez" &&
    (await page.getByLabel("Turno").inputValue()) === "Día",
  `${await celda(0, 0).innerText()} · ${await page.getByLabel("Turno").inputValue()}`,
);
informe.comprobar(
  "y la supervisora tambien",
  (await page.getByLabel("Supervisor").inputValue()) === "Paula Andrea Ochoa",
);

const lista = page.locator("section:has-text('Mis planillas') li");
informe.comprobar("aparece en Mis planillas", (await lista.count()) > 0, `${await lista.count()}`);

// --- Se borra (y solo se marca) ---
// La de esta prueba es la que esta abierta (marcada "Abierta" en la lista).
const fila = lista.filter({ hasText: "Abierta" });
informe.comprobar("la planilla abierta está marcada en la lista", (await fila.count()) === 1);

const planillas = await fetch(`${URL_BASE}/api/planillas`).then((respuesta) => respuesta.json());
const antes = planillas.planillas.length;

page.once("dialog", (dialogo) => void dialogo.accept());
await fila.getByRole("button", { name: "Borrar esta planilla" }).click();
await page.waitForTimeout(1500);

const despues = await fetch(`${URL_BASE}/api/planillas`).then((respuesta) => respuesta.json());
informe.comprobar(
  "borrar la quita de la lista",
  despues.planillas.length === antes - 1,
  `${antes} -> ${despues.planillas.length}`,
);

// Limpieza del correo de prueba: tambien solo se marca.
await fetch(`${URL_BASE}/api/guardados/${ID_GUARDADO}`, { method: "DELETE" });

await navegador.close();
informe.terminar();
