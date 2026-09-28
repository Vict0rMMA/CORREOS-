import fs from "node:fs";
import zlib from "node:zlib";

/**
 * Lector minimo de archivos ZIP.
 *
 * Un .docx es un ZIP, y hace falta mirar dentro para comprobar lo que lleva.
 * Se hace aqui en Node y no con el comando `unzip` porque en Windows no viene
 * instalado.
 */

/** Lista los archivos que contiene el ZIP. */
export function listarZip(ruta) {
  const datos = fs.readFileSync(ruta);
  const nombres = [];
  let posicion = 0;

  while (posicion < datos.length - 4) {
    if (datos.readUInt32LE(posicion) !== 0x04034b50) {
      posicion += 1;
      continue;
    }
    const largoNombre = datos.readUInt16LE(posicion + 26);
    const largoExtra = datos.readUInt16LE(posicion + 28);
    nombres.push(datos.toString("utf8", posicion + 30, posicion + 30 + largoNombre));
    posicion += 30 + largoNombre + largoExtra;
  }

  return nombres;
}

/** Devuelve el contenido de un archivo de dentro del ZIP. */
export function leerDelZip(ruta, nombreBuscado) {
  const datos = fs.readFileSync(ruta);
  let posicion = 0;

  while (posicion < datos.length - 4) {
    if (datos.readUInt32LE(posicion) !== 0x04034b50) {
      posicion += 1;
      continue;
    }

    const compresion = datos.readUInt16LE(posicion + 8);
    let comprimido = datos.readUInt32LE(posicion + 18);
    let sinComprimir = datos.readUInt32LE(posicion + 22);
    const largoNombre = datos.readUInt16LE(posicion + 26);
    const largoExtra = datos.readUInt16LE(posicion + 28);
    const nombre = datos.toString("utf8", posicion + 30, posicion + 30 + largoNombre);
    const inicioDatos = posicion + 30 + largoNombre + largoExtra;

    if (nombre === nombreBuscado) {
      // Algunos escritores dejan los tamanos en cero y los ponen despues del
      // contenido: en ese caso se descomprime hasta donde llegue.
      const trozo =
        comprimido > 0
          ? datos.subarray(inicioDatos, inicioDatos + comprimido)
          : datos.subarray(inicioDatos);
      return compresion === 0
        ? trozo.subarray(0, sinComprimir || trozo.length)
        : zlib.inflateRawSync(trozo, { finishFlush: zlib.constants.Z_SYNC_FLUSH });
    }

    posicion = comprimido > 0 ? inicioDatos + comprimido : inicioDatos + 1;
  }

  throw new Error(`No encontramos "${nombreBuscado}" dentro de ${ruta}`);
}
