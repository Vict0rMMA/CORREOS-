import type { SheetDoc, SheetMeta, SheetSection } from "@/types";

/**
 * El modelo de una planilla y las operaciones de la cuadricula.
 *
 * Todo son funciones puras que reciben una planilla y devuelven otra: asi el
 * deshacer y el rehacer son simplemente guardar la anterior, y las pruebas
 * pueden comprobar cada operacion sin abrir el navegador.
 */

/** Filas vacias con las que arranca una planilla nueva. */
export const FILAS_INICIALES = 8;

export function filaVacia(ancho: number): string[] {
  return Array.from({ length: ancho }, () => "");
}

export function seccionVacia(columns: string[], filas = FILAS_INICIALES): SheetSection {
  return {
    title: "",
    columns: [...columns],
    rows: Array.from({ length: filas }, () => filaVacia(columns.length)),
  };
}

export function metaVacia(): SheetMeta {
  return { date: "", shift: "", supervisor: "" };
}

/** true si la planilla no tiene ni un dato escrito. */
export function estaVacia(doc: SheetDoc): boolean {
  return doc.sections.every((seccion) =>
    seccion.rows.every((fila) => fila.every((celda) => !celda.trim())),
  );
}

/** Quita las filas del final que no tienen nada: no se exportan en blanco. */
export function sinFilasVacias(seccion: SheetSection): SheetSection {
  const rows = [...seccion.rows];
  while (rows.length > 0 && rows[rows.length - 1].every((celda) => !celda.trim())) {
    rows.pop();
  }
  return { ...seccion, rows };
}

/**
 * La planilla lista para exportar: sin las filas en blanco del final.
 *
 * Los bloques se quedan aunque no tengan ni una fila escrita. Llegaron a
 * descartarse, y entonces una planilla de noches con la tabla principal todavia
 * vacia se traducia sin ella: desaparecia la tabla de arriba y solo bajaban el
 * personal y los vehiculos.
 */
export function paraExportar(doc: SheetDoc): SheetDoc {
  return { ...doc, sections: doc.sections.map(sinFilasVacias) };
}

// ---------------------------------------------------------------------------
// Operaciones sobre una seccion
// ---------------------------------------------------------------------------

/** Cambia una celda. Si la fila o la columna no existen, la planilla crece. */
export function escribirCelda(
  seccion: SheetSection,
  fila: number,
  columna: number,
  valor: string,
): SheetSection {
  const ancho = Math.max(seccion.columns.length, columna + 1);
  const columns = ajustarAncho(seccion.columns, ancho);
  const rows = seccion.rows.map((linea) => ajustarAncho(linea, ancho));
  while (rows.length <= fila) rows.push(filaVacia(ancho));

  rows[fila] = [...rows[fila]];
  rows[fila][columna] = valor;
  return { ...seccion, columns, rows };
}

/** Cambia el nombre de una columna. */
export function escribirEncabezado(
  seccion: SheetSection,
  columna: number,
  valor: string,
): SheetSection {
  const columns = [...seccion.columns];
  columns[columna] = valor;
  return { ...seccion, columns };
}

/** Rellena o recorta una fila para que tenga el ancho pedido. */
function ajustarAncho(fila: string[], ancho: number): string[] {
  if (fila.length === ancho) return fila;
  const copia = fila.slice(0, ancho);
  while (copia.length < ancho) copia.push("");
  return copia;
}

export function insertarFila(seccion: SheetSection, antesDe: number): SheetSection {
  const rows = [...seccion.rows];
  const posicion = Math.max(0, Math.min(antesDe, rows.length));
  rows.splice(posicion, 0, filaVacia(seccion.columns.length));
  return { ...seccion, rows };
}

/** Borra las filas indicadas. Nunca deja la planilla sin ninguna. */
export function borrarFilas(seccion: SheetSection, desde: number, hasta: number): SheetSection {
  const inicio = Math.max(0, Math.min(desde, hasta));
  const fin = Math.min(seccion.rows.length - 1, Math.max(desde, hasta));
  const rows = seccion.rows.filter((_, indice) => indice < inicio || indice > fin);
  if (rows.length === 0) rows.push(filaVacia(seccion.columns.length));
  return { ...seccion, rows };
}

export function insertarColumna(
  seccion: SheetSection,
  antesDe: number,
  nombre = "",
): SheetSection {
  const posicion = Math.max(0, Math.min(antesDe, seccion.columns.length));
  const columns = [...seccion.columns];
  columns.splice(posicion, 0, nombre);
  const rows = seccion.rows.map((fila) => {
    const copia = [...fila];
    copia.splice(posicion, 0, "");
    return copia;
  });
  return { ...seccion, columns, rows };
}

/** Borra las columnas indicadas. Nunca deja la planilla sin ninguna. */
export function borrarColumnas(
  seccion: SheetSection,
  desde: number,
  hasta: number,
): SheetSection {
  const inicio = Math.max(0, Math.min(desde, hasta));
  const fin = Math.min(seccion.columns.length - 1, Math.max(desde, hasta));
  if (fin - inicio + 1 >= seccion.columns.length) return seccion;

  const fuera = (indice: number) => indice < inicio || indice > fin;
  return {
    ...seccion,
    columns: seccion.columns.filter((_, indice) => fuera(indice)),
    rows: seccion.rows.map((fila) => fila.filter((_, indice) => fuera(indice))),
  };
}

/** Vacia el contenido de un rango sin tocar la estructura. */
export function limpiarRango(
  seccion: SheetSection,
  rango: { fila1: number; col1: number; fila2: number; col2: number },
): SheetSection {
  const { fila1, col1, fila2, col2 } = ordenar(rango);
  const rows = seccion.rows.map((fila, indiceFila) => {
    if (indiceFila < fila1 || indiceFila > fila2) return fila;
    return fila.map((celda, indiceColumna) =>
      indiceColumna >= col1 && indiceColumna <= col2 ? "" : celda,
    );
  });
  return { ...seccion, rows };
}

export function ordenar(rango: {
  fila1: number;
  col1: number;
  fila2: number;
  col2: number;
}): { fila1: number; col1: number; fila2: number; col2: number } {
  return {
    fila1: Math.min(rango.fila1, rango.fila2),
    fila2: Math.max(rango.fila1, rango.fila2),
    col1: Math.min(rango.col1, rango.col2),
    col2: Math.max(rango.col1, rango.col2),
  };
}

// ---------------------------------------------------------------------------
// Copiar y pegar
// ---------------------------------------------------------------------------

/** El rango seleccionado como texto con tabuladores, listo para Excel. */
export function rangoATexto(
  seccion: SheetSection,
  rango: { fila1: number; col1: number; fila2: number; col2: number },
): string {
  const { fila1, col1, fila2, col2 } = ordenar(rango);
  const lineas: string[] = [];
  for (let fila = fila1; fila <= fila2; fila += 1) {
    const celdas: string[] = [];
    for (let columna = col1; columna <= col2; columna += 1) {
      celdas.push(seccion.rows[fila]?.[columna] ?? "");
    }
    lineas.push(celdas.join("\t"));
  }
  return lineas.join("\n");
}

/**
 * Convierte lo pegado en una rejilla de celdas.
 *
 * Lo copiado de Excel viene con tabuladores. Pero lo copiado de un PDF, de un
 * correo o de una pantalla trae las columnas separadas por varios espacios:
 * sin esto, la fila entera caia dentro de una sola celda.
 */
export function texto2D(texto: string): string[][] {
  const limpio = texto.replace(/\r\n/g, "\n").replace(/\n+$/, "");
  if (!limpio) return [];

  const lineas = limpio.split("\n");
  if (lineas.some((linea) => linea.includes("\t"))) {
    return lineas.map((linea) => linea.split("\t"));
  }

  // Sin un solo tabulador: se separa por dos o mas espacios, y solo si eso
  // produce de verdad varias columnas en mas de una linea.
  const porEspacios = lineas.map((linea) => linea.trim().split(/ {2,}/));
  const conVarias = porEspacios.filter((linea) => linea.length > 1).length;
  if (conVarias >= Math.min(2, lineas.length)) return porEspacios;

  return lineas.map((linea) => [linea]);
}

/**
 * Reparte una linea segun donde empieza cada columna en la cabecera.
 *
 * Es lo que salva las celdas vacias: al separar por espacios, "B4" seguido de
 * dos columnas en blanco y una nota se convertia en "B4" y la nota pegada
 * detras, y la nota acababa en la columna equivocada. Mirando en que posicion
 * arranca cada trozo se sabe a que columna va.
 */
function repartirPorPosicion(linea: string, inicios: number[]): string[] {
  const celdas: string[][] = inicios.map(() => []);

  for (const trozo of linea.matchAll(/\S+(?: (?!\s)\S+)*/g)) {
    const posicion = trozo.index ?? 0;
    let destino = 0;
    let distancia = Number.POSITIVE_INFINITY;
    inicios.forEach((inicio, indice) => {
      const separacion = Math.abs(posicion - inicio);
      if (separacion < distancia) {
        distancia = separacion;
        destino = indice;
      }
    });
    celdas[destino].push(trozo[0]);
  }

  return celdas.map((partes) => partes.join(" "));
}

/** En que posicion empieza cada columna de una linea de encabezados. */
function iniciosDeColumna(cabecera: string): number[] {
  const inicios: number[] = [];
  for (const trozo of cabecera.matchAll(/\S+(?: (?!\s)\S+)*/g)) {
    inicios.push(trozo.index ?? 0);
  }
  return inicios;
}

/**
 * Interpreta lo que se acaba de pegar, ya listo para entrar en la cuadricula.
 *
 * Lo copiado de Excel trae tabuladores y es exacto. Lo copiado de un PDF, de
 * un correo o de una pantalla viene alineado con espacios: si trae la fila de
 * encabezados se usa para saber donde empieza cada columna, y esa fila se
 * descarta para que no acabe como un empleado llamado "EMPLEADO".
 */
export function interpretarPegado(texto: string, columns: string[]): string[][] {
  const bruto = texto.replace(/\r\n/g, "\n").replace(/\n+$/, "");
  if (!bruto) return [];

  const lineas = bruto.split("\n");
  if (lineas.some((linea) => linea.includes("\t"))) {
    return sinEncabezadoRepetido(
      lineas.map((linea) => linea.split("\t")),
      columns,
    );
  }

  // Alineado con espacios y con cabecera: cada trozo va a la columna que le
  // toca por posicion, aunque por el camino haya celdas vacias.
  const porEspacios = texto2D(bruto);
  if (porEspacios.length > 1 && esFilaDeEncabezados(porEspacios[0], columns)) {
    const inicios = iniciosDeColumna(lineas[0]);
    if (inicios.length >= 2) {
      return lineas.slice(1).map((linea) => repartirPorPosicion(linea, inicios));
    }
  }

  return sinEncabezadoRepetido(porEspacios, columns);
}

/** Compara dos encabezados sin fijarse en tildes, mayusculas ni espacios. */
function mismoEncabezado(uno: string, otro: string): boolean {
  const llano = (valor: string) =>
    valor
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .toLowerCase()
      .replace(/\s+/g, " ")
      .trim();
  return llano(uno) === llano(otro);
}

/**
 * Quita del bloque pegado la fila de encabezados, si la trae.
 *
 * Al copiar desde Excel casi siempre se arrastra la primera fila con los
 * nombres de las columnas; sin esto acababa como un empleado llamado
 * "EMPLEADO".
 */
export function sinEncabezadoRepetido(bloque: string[][], columns: string[]): string[][] {
  if (bloque.length < 2) return bloque;
  return esFilaDeEncabezados(bloque[0], columns) ? bloque.slice(1) : bloque;
}

/** true si esa fila son los nombres de las columnas, no datos. */
function esFilaDeEncabezados(fila: string[], columns: string[]): boolean {
  const conTexto = fila.filter((celda) => celda.trim()).length;
  if (conTexto < 2) return false;

  const coinciden = fila.filter((celda, indice) =>
    celda.trim() && columns[indice] ? mismoEncabezado(celda, columns[indice]) : false,
  ).length;

  // Basta con que coincida la mayoria: puede faltar alguna columna del final.
  return coinciden >= Math.ceil(conTexto / 2);
}

/**
 * Pega un bloque a partir de una celda.
 *
 * La cuadricula crece si hace falta: pegar 30 filas en una planilla de 8 no
 * puede perder las 22 de abajo. Devuelve tambien hasta donde llego, para dejar
 * seleccionado lo que se acaba de pegar.
 */
export function pegarEn(
  seccion: SheetSection,
  fila: number,
  columna: number,
  bloque: string[][],
): { seccion: SheetSection; hasta: { fila: number; columna: number } } {
  if (bloque.length === 0) {
    return { seccion, hasta: { fila, columna } };
  }

  const anchoBloque = Math.max(...bloque.map((linea) => linea.length));
  const ancho = Math.max(seccion.columns.length, columna + anchoBloque);
  const alto = Math.max(seccion.rows.length, fila + bloque.length);

  const columns = ajustarAncho(seccion.columns, ancho);
  const rows: string[][] = [];
  for (let indice = 0; indice < alto; indice += 1) {
    rows.push(ajustarAncho(seccion.rows[indice] ?? filaVacia(ancho), ancho));
  }

  bloque.forEach((linea, desplazamientoFila) => {
    const destino = [...rows[fila + desplazamientoFila]];
    linea.forEach((celda, desplazamientoColumna) => {
      destino[columna + desplazamientoColumna] = celda;
    });
    rows[fila + desplazamientoFila] = destino;
  });

  return {
    seccion: { ...seccion, columns, rows },
    hasta: {
      fila: fila + bloque.length - 1,
      columna: columna + anchoBloque - 1,
    },
  };
}

// ---------------------------------------------------------------------------
// Historial (deshacer y rehacer)
// ---------------------------------------------------------------------------

export interface Historial<T> {
  presente: T;
  pasado: T[];
  futuro: T[];
}

/** Cuantos pasos atras se pueden deshacer. */
const PASOS = 60;

export function iniciarHistorial<T>(presente: T): Historial<T> {
  return { presente, pasado: [], futuro: [] };
}

export function cambiar<T>(historial: Historial<T>, siguiente: T): Historial<T> {
  if (siguiente === historial.presente) return historial;
  return {
    presente: siguiente,
    pasado: [...historial.pasado, historial.presente].slice(-PASOS),
    futuro: [],
  };
}

export function deshacer<T>(historial: Historial<T>): Historial<T> {
  if (historial.pasado.length === 0) return historial;
  const anterior = historial.pasado[historial.pasado.length - 1];
  return {
    presente: anterior,
    pasado: historial.pasado.slice(0, -1),
    futuro: [historial.presente, ...historial.futuro].slice(0, PASOS),
  };
}

export function rehacer<T>(historial: Historial<T>): Historial<T> {
  if (historial.futuro.length === 0) return historial;
  const siguiente = historial.futuro[0];
  return {
    presente: siguiente,
    pasado: [...historial.pasado, historial.presente].slice(-PASOS),
    futuro: historial.futuro.slice(1),
  };
}

/** Reemplaza una seccion dentro de la planilla. */
export function conSeccion(
  doc: SheetDoc,
  indice: number,
  seccion: SheetSection,
): SheetDoc {
  const sections = [...doc.sections];
  sections[indice] = seccion;
  return { ...doc, sections };
}
