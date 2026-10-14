import fs from "node:fs";
import zlib from "node:zlib";

/**
 * Lector de PDF minimo para las pruebas.
 *
 * jsPDF escribe el texto como `(cadena) Tj` dentro de flujos comprimidos. Aqui
 * se descomprimen y se saca lo que hay entre parentesis, que es suficiente
 * para comprobar en que idioma salio el documento.
 */

/** Texto visible de un PDF, todo seguido. */
export function textoDelPdf(ruta) {
  const datos = fs.readFileSync(ruta);
  const trozos = [];

  let desde = 0;
  for (;;) {
    const inicio = datos.indexOf("stream", desde);
    if (inicio < 0) break;
    const fin = datos.indexOf("endstream", inicio);
    if (fin < 0) break;

    // Tras "stream" viene un salto de linea (\n o \r\n) antes de los datos.
    let principio = inicio + "stream".length;
    if (datos[principio] === 0x0d) principio += 1;
    if (datos[principio] === 0x0a) principio += 1;

    const bruto = datos.subarray(principio, fin);
    try {
      trozos.push(zlib.inflateSync(bruto).toString("latin1"));
    } catch {
      trozos.push(bruto.toString("latin1"));
    }
    desde = fin + 1;
  }

  const contenido = trozos.join("\n");
  const texto = [];
  for (const encontrado of contenido.matchAll(/\(((?:\\.|[^\\()])*)\)\s*Tj/g)) {
    texto.push(
      encontrado[1]
        .replace(/\\(\d{3})/g, (_, octal) => String.fromCharCode(parseInt(octal, 8)))
        .replace(/\\([()\\])/g, "$1"),
    );
  }

  return texto.join(" ");
}
