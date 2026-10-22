import { URL_BASE, abrirNavegador, crearInforme } from "./comun.mjs";

/**
 * La misma aplicacion en dos equipos (el computador y el celular), contra la
 * nube de verdad.
 *
 * 1. En el computador se hace una planilla SIN nube (se corta la conexion
 *    con ella), asi que queda solo en ese equipo.
 * 2. Vuelve la nube: al abrir la aplicacion, la planilla sube sola y con su
 *    hora de verdad, no con la hora de subirla.
 * 3. En el celular aparece en Guardadas y se abre con lo escrito.
 * 4. Se borra en el celular, y el computador no la vuelve a subir.
 * 5. Lo mismo con un correo guardado: borrado en un equipo, no revive desde
 *    la copia del otro.
 *
 * Si la nube no esta configurada, se omite. No usa la IA. Lo que crea lo
 * deja marcado como borrado.
 */

const informe = crearInforme("Sincronizar equipos");

const estado = await fetch(`${URL_BASE}/api/planillas`).then((respuesta) => respuesta.status);
if (estado !== 200) {
  console.log("  (la nube no está configurada: se omite)");
  informe.terminar();
  process.exit(0);
}

const MARCA = `SYNC ${Date.now()}`;
const navegador = await abrirNavegador({ nube: true });

// --- 1. El computador, sin nube ---
let cortada = true;
const computador = await navegador.newContext({
  viewport: { width: 1280, height: 950 },
  permissions: ["clipboard-read", "clipboard-write"],
});
await computador.route(/\/api\/(planillas|guardados)/, (ruta) =>
  cortada
    ? ruta.fulfill({ status: 503, contentType: "application/json", body: '{"disponible":false}' })
    : ruta.continue(),
);
const pc = await computador.newPage();
pc.on("pageerror", (error) => informe.anotarError(`computador: ${error.message}`));
await pc.goto(URL_BASE, { waitUntil: "domcontentloaded" });
await pc.waitForTimeout(2000);
await pc.getByRole("tab", { name: /^Planillas/ }).click();
await pc.waitForTimeout(400);
await pc.getByLabel("Turno").fill("Noche");
const celdaPc = (fila, columna) =>
  pc.locator('[role="grid"]').first().locator(`[data-celda="${fila}:${columna}"]`);
await celdaPc(0, 0).dblclick();
await pc.keyboard.type(MARCA);
await pc.keyboard.press("Enter");
await pc.waitForTimeout(800);
// Se empieza otra: la de la prueba queda en Guardadas, no abierta.
await pc.getByRole("button", { name: "Nueva planilla" }).click();
await pc.waitForTimeout(800);

const archivada = await pc.evaluate((marca) => {
  const lista = JSON.parse(localStorage.getItem("paula:planillas-guardadas") ?? "[]");
  return lista.find((item) => JSON.stringify(item.entrada).includes(marca)) ?? null;
}, MARCA);
informe.comprobar("sin nube, la planilla queda en el computador", archivada !== null);
const id = archivada?.id;

// --- 2. Vuelve la nube: sube sola, con su hora ---
await pc.waitForTimeout(6000); // que la hora de subirla sea claramente otra
cortada = false;
await pc.reload({ waitUntil: "domcontentloaded" });
await pc.waitForTimeout(5000);

const enNube = await fetch(`${URL_BASE}/api/planillas/${id}`).then((respuesta) =>
  respuesta.ok ? respuesta.json() : null,
);
informe.comprobar(
  "al volver la nube, sube sola",
  JSON.stringify(enNube?.entrada ?? {}).includes(MARCA),
);
const diferencia = Math.abs(new Date(enNube?.actualizadaEn ?? 0).getTime() - archivada.actualizadaEn);
informe.comprobar(
  "con la hora en que se modificó de verdad",
  diferencia < 2000,
  `${Math.round(diferencia / 1000)} s de diferencia`,
);

// --- 3. El celular la ve y la abre ---
const celular = await navegador.newContext({
  viewport: { width: 390, height: 844 },
  isMobile: true,
  hasTouch: true,
});
const movil = await celular.newPage();
movil.on("pageerror", (error) => informe.anotarError(`celular: ${error.message}`));
await movil.goto(URL_BASE, { waitUntil: "domcontentloaded" });
await movil.waitForTimeout(3000);
await movil.getByRole("tab", { name: /^Guardadas/ }).tap();
await movil.waitForTimeout(800);
const tarjeta = movil.locator(`li[data-planilla="${id}"]`);
informe.comprobar(
  "en el celular aparece en Guardadas, como de la nube",
  (await tarjeta.count()) === 1 && (await tarjeta.innerText()).includes("En la nube"),
);
informe.comprobar(
  "con el turno y la hora",
  (await tarjeta.innerText()).includes("Turno Noche") &&
    /Última modificación\s*hoy, \d{1,2}:\d{2}/.test(await tarjeta.innerText()),
);
await tarjeta.getByRole("button", { name: /Abrir y modificar|Seguir editando/ }).tap();
await movil.waitForTimeout(1500);
informe.comprobar(
  "y se abre con lo escrito en el computador",
  (await movil.locator('[role="grid"]').first().locator('[data-celda="0:0"]').innerText()) === MARCA,
);

// --- 4. Se borra en el celular y no revive desde el computador ---
await movil.getByRole("tab", { name: /^Guardadas/ }).tap();
await movil.waitForTimeout(500);
movil.once("dialog", (dialogo) => void dialogo.accept());
await movil.locator(`li[data-planilla="${id}"]`).getByRole("button", { name: "Borrar esta planilla" }).tap();
await movil.waitForTimeout(1500);

await pc.reload({ waitUntil: "domcontentloaded" });
await pc.waitForTimeout(5000);
const sigueEnPc = await pc.evaluate(
  (idBuscado) =>
    JSON.parse(localStorage.getItem("paula:planillas-guardadas") ?? "[]").some(
      (item) => item.id === idBuscado,
    ),
  id,
);
const revivio = await fetch(`${URL_BASE}/api/planillas/${id}`).then((respuesta) => respuesta.ok);
informe.comprobar("borrada en el celular, desaparece también del computador", !sigueEnPc);
informe.comprobar("y no vuelve a subir a la nube", !revivio);

// --- 5. Un correo borrado en otro equipo no revive ---
const ID_CORREO = `prueba-sync-${Date.now()}`;
const correo = {
  id: ID_CORREO,
  preview: "Prueba de sincronizar",
  input: "prueba de sincronizar",
  output: "Prueba de sincronizar.",
  lang: "es",
  action: "correct",
  textType: "email",
  tone: "professional",
  createdAt: Date.now(),
};
await fetch(`${URL_BASE}/api/guardados`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ items: [correo] }),
});
await fetch(`${URL_BASE}/api/guardados/${ID_CORREO}`, { method: "DELETE" });

await pc.evaluate((item) => {
  const lista = JSON.parse(localStorage.getItem("paula:history") ?? "[]");
  localStorage.setItem("paula:history", JSON.stringify([item, ...lista]));
}, correo);
await pc.reload({ waitUntil: "domcontentloaded" });
await pc.waitForTimeout(4000);
const correoEnPc = await pc.evaluate(
  (idBuscado) =>
    JSON.parse(localStorage.getItem("paula:history") ?? "[]").some((item) => item.id === idBuscado),
  ID_CORREO,
);
const correosNube = await fetch(`${URL_BASE}/api/guardados`).then((respuesta) => respuesta.json());
informe.comprobar(
  "un correo borrado en otro equipo se va de este y no revive",
  !correoEnPc && !correosNube.guardados.some((item) => item.id === ID_CORREO),
);

await navegador.close();
informe.terminar();
