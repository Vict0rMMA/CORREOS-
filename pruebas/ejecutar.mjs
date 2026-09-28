import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { URL_BASE } from "./comun.mjs";

/**
 * Ejecuta las pruebas contra la aplicacion.
 *
 *   npm test          las que no gastan cuota de la IA
 *   npm run test:todo todas, incluidas las que llaman a la IA
 *
 * La aplicacion tiene que estar levantada (npm run dev) o se indica otra
 * direccion con la variable PAULA_URL.
 */

/** `gasta` marca las que hacen peticiones a la IA. */
const PRUEBAS = [
  { archivo: "interfaz.mjs", nombre: "Interfaz y tamanos", gasta: false },
  { archivo: "guardados.mjs", nombre: "Guardados y buscador", gasta: false },
  { archivo: "celular.mjs", nombre: "Celular e instalacion", gasta: true },
  { archivo: "tipos.mjs", nombre: "Tipos de texto", gasta: true },
  { archivo: "traduccion.mjs", nombre: "Idiomas y traduccion", gasta: true },
  { archivo: "encadenado.mjs", nombre: "Encadenado de acciones", gasta: true },
  { archivo: "documentos.mjs", nombre: "Word y PDF", gasta: true },
  { archivo: "firma.mjs", nombre: "Firma escaneada", gasta: true },
  { archivo: "voz.mjs", nombre: "Dictado por voz", gasta: true },
];

const todo = process.argv.includes("--todo");
const seleccion = todo ? PRUEBAS : PRUEBAS.filter((prueba) => !prueba.gasta);

/** Comprueba que la aplicacion responde antes de empezar. */
async function aplicacionLevantada() {
  try {
    const respuesta = await fetch(URL_BASE, { signal: AbortSignal.timeout(4000) });
    return respuesta.ok;
  } catch {
    return false;
  }
}

if (!(await aplicacionLevantada())) {
  console.error(
    `\nNo hay nada respondiendo en ${URL_BASE}.\n` +
      "Levanta la aplicacion con `npm run dev` en otra terminal y vuelve a intentarlo.\n",
  );
  process.exit(1);
}

console.log(
  `Probando ${URL_BASE} · ${seleccion.length} de ${PRUEBAS.length} pruebas` +
    (todo ? " (todas, gastan cuota de la IA)" : " (sin gastar cuota; usa `npm run test:todo` para el resto)"),
);

const fallidas = [];
for (const prueba of seleccion) {
  const codigo = await new Promise((resolve) => {
    // fileURLToPath, no .pathname: en Windows .pathname devuelve "/C:/..."
    const ruta = fileURLToPath(new URL(prueba.archivo, import.meta.url));
    const hijo = spawn(process.execPath, [ruta], {
      stdio: "inherit",
    });
    hijo.on("close", resolve);
  });
  if (codigo !== 0) fallidas.push(prueba.nombre);
}

console.log("\n────────────────────────────────");
if (fallidas.length === 0) {
  console.log(`Todo correcto: ${seleccion.length} pruebas pasaron.`);
} else {
  console.log(`${fallidas.length} prueba(s) con fallos: ${fallidas.join(", ")}`);
  process.exit(1);
}
