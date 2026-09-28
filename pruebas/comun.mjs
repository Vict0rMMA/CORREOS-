import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { chromium } from "playwright-core";

/**
 * Utilidades compartidas por las pruebas.
 *
 * Las pruebas manejan un navegador de verdad contra la aplicacion levantada:
 * hacen lo mismo que haria una persona (escribir, tocar botones, descargar
 * archivos) y comprueban lo que sale.
 */

export const URL_BASE = process.env.PAULA_URL ?? "http://localhost:3000";

/** Carpeta donde se dejan capturas y descargas de las pruebas. */
export const SALIDA = path.join(os.tmpdir(), "paula-pruebas");
fs.mkdirSync(SALIDA, { recursive: true });

/** Busca el Chrome instalado; se puede forzar con PAULA_CHROME. */
export function buscarChrome() {
  if (process.env.PAULA_CHROME) return process.env.PAULA_CHROME;

  const candidatos = [
    "C:/Program Files/Google/Chrome/Application/chrome.exe",
    "C:/Program Files (x86)/Google/Chrome/Application/chrome.exe",
    `${process.env.LOCALAPPDATA ?? ""}/Google/Chrome/Application/chrome.exe`,
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    "/usr/bin/google-chrome",
    "/usr/bin/chromium",
    "/usr/bin/chromium-browser",
  ];

  const encontrado = candidatos.find((ruta) => ruta && fs.existsSync(ruta));
  if (!encontrado) {
    throw new Error(
      "No encontramos Chrome. Instalalo o indica la ruta con la variable PAULA_CHROME.",
    );
  }
  return encontrado;
}

export async function abrirNavegador(opciones = {}) {
  return chromium.launch({ executablePath: buscarChrome(), ...opciones });
}

/** Lleva la cuenta de lo que pasa y sale con error si algo falla. */
export function crearInforme(titulo) {
  const fallos = [];
  console.log(`\n── ${titulo} ──`);

  return {
    comprobar(etiqueta, correcto, extra = "") {
      console.log(
        `${correcto ? "  OK  " : "  FALLA"} ${etiqueta}${extra ? ` · ${extra}` : ""}`,
      );
      if (!correcto) fallos.push(etiqueta);
    },
    anotarError(mensaje) {
      fallos.push(mensaje);
    },
    get fallos() {
      return fallos;
    },
    terminar() {
      if (fallos.length > 0) {
        console.log(`  ${fallos.length} fallo(s): ${fallos.join(" | ")}`);
        process.exitCode = 1;
      }
      return fallos.length === 0;
    },
  };
}

/** Espera a que la aplicacion termine de procesar un texto. */
export async function esperarResultado(page, tiempo = 120000) {
  await page.waitForFunction(
    () => {
      const estado = document.querySelector('[role="status"]');
      return estado && /Listo|Error/.test(estado.textContent || "");
    },
    undefined,
    { timeout: tiempo },
  );
  await page.waitForTimeout(300);
}

/** Texto que muestra el panel de resultado. */
export async function leerResultado(page) {
  return (await page.locator("p.whitespace-pre-wrap").first().textContent()) ?? "";
}

/** Procesa un texto llamando directamente a la API. */
export async function procesar(cuerpo) {
  const respuesta = await fetch(`${URL_BASE}/api/process`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ tone: "professional", textType: "email", ...cuerpo }),
  });
  return (await respuesta.text()).trim();
}
