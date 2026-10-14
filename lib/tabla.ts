import { labels } from "@/lib/export/i18n";
import type { Lang, TableData, TableMeta } from "@/types";

/**
 * Planillas: leer una tabla pegada, traducir sus encabezados sin IA y
 * comprobar que lo que devuelve el modelo sigue siendo el mismo dato.
 *
 * La regla de la casa: una matricula, una hora o un numero no se traducen
 * NUNCA. Se copian tal cual y despues se comprueba que siguen ahi. Si algo no
 * cuadra se avisa; no se entrega una planilla con los datos cambiados.
 */

/** Quita acentos y deja el texto comparable. */
function simple(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim();
}

/** Clave con la que se busca un encabezado en el mapa. */
function clave(value: string): string {
  return simple(value)
    .replace(/[^a-z0-9@/#]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Encabezados de la plantilla de AVX, traducidos sin pasar por la IA.
 * Son los nombres que usa el equipo; cualquier otra columna la traduce el
 * modelo.
 */
const ENCABEZADOS: Array<[string, string]> = [
  ["empleado", "EMPLOYEE"],
  ["almuerzo", "LUNCH"],
  ["estado", "STATUS"],
  ["avion", "A/C"],
  ["aeronave", "A/C"],
  ["puerta", "GATE"],
  ["hora asignado", "ASSGN @"],
  ["hora asignada", "ASSGN @"],
  ["hora salida", "ETD"],
  ["hora de salida", "ETD"],
  ["estacion", "STA"],
  ["tripulacion", "CRW"],
  ["tecnico avx", "AVX TECH"],
  ["falla diferida", "MEL/NEF"],
  ["fecha", "DATE"],
  ["turno", "SHIFT"],
  ["supervisor", "SUPERVISOR"],
  ["notas", "NOTES"],
];

const A_INGLES = new Map(ENCABEZADOS);
/** El mismo mapa al reves, para cuando la planilla sale en espanol. */
const A_ESPANOL = new Map(
  ENCABEZADOS.map(([es, en]) => [clave(en), es.toUpperCase()] as [string, string]),
);

/**
 * Traduce un encabezado conocido. Devuelve null si no esta en la plantilla:
 * esos los traduce el modelo.
 */
export function traducirEncabezado(nombre: string, destino: Lang): string | null {
  const llave = clave(nombre);
  if (!llave) return null;

  if (destino === "en") {
    const directo = A_INGLES.get(llave);
    if (directo) return directo;
    // Ya venia en ingles: se deja como esta.
    return A_ESPANOL.has(llave) ? nombre.toUpperCase() : null;
  }

  const directo = A_ESPANOL.get(llave);
  if (directo) return directo;
  return A_INGLES.has(llave) ? nombre.toUpperCase() : null;
}

// ---------------------------------------------------------------------------
// Celdas: que es dato y que es texto
// ---------------------------------------------------------------------------

const HORA = /^\d{1,2}:\d{2}(?::\d{2})?$/;
const NUMERO = /^[+-]?\d+(?:[.,]\d+)*\s*%?$/;
const FECHA = /^\d{1,2}[/.-]\d{1,2}(?:[/.-]\d{2,4})?$/;
/** Codigo: sin minusculas (N123AV, B4, MEL-21, P-0, A/C). */
const CODIGO = /^[A-Z0-9][A-Z0-9@#/.-]*$/;

/** true si la celda es un dato que se copia tal cual, sin pasar por la IA. */
export function esDato(valor: string): boolean {
  const texto = valor.trim();
  if (!texto) return true;
  return HORA.test(texto) || NUMERO.test(texto) || FECHA.test(texto) || CODIGO.test(texto);
}

/**
 * true si la celda parece un nombre de persona ("J. Perez", "Paula Ochoa").
 * Los nombres tampoco se traducen: se copian con sus tildes.
 */
export function pareceNombre(valor: string): boolean {
  const palabras = valor.trim().split(/\s+/).filter(Boolean);
  if (palabras.length === 0 || palabras.length > 3) return false;
  return palabras.every((palabra) => /^\p{Lu}[\p{L}'’-]*\.?$/u.test(palabra));
}

/** true si la celda tiene texto de verdad y hay que traducirla. */
export function necesitaTraduccion(valor: string): boolean {
  return !esDato(valor) && !pareceNombre(valor);
}

// ---------------------------------------------------------------------------
// Leer una tabla pegada desde Excel (celdas separadas por tabuladores)
// ---------------------------------------------------------------------------

export interface TablaLeida {
  /** Primera linea suelta sobre la tabla, si la hay. */
  title: string;
  meta: TableMeta;
  columns: string[];
  rows: string[][];
  /** Lineas sueltas bajo la tabla, que acaban como notas. */
  notes: string;
}

/** true si el texto trae una tabla pegada (al menos dos filas con tabulador). */
export function pareceTabla(texto: string): boolean {
  const conTabulador = texto
    .split(/\r?\n/)
    .filter((linea) => linea.includes("\t") && linea.trim());
  return conTabulador.length >= 2;
}

/** Datos de cabecera sueltos sobre la tabla: "FECHA: 12/03/2026". */
const META: Array<[RegExp, keyof TableMeta]> = [
  [/^(fecha|date)$/, "date"],
  [/^(turno|shift)$/, "shift"],
  [/^(supervisor|jefe de turno)$/, "supervisor"],
];

function leerMeta(linea: string, meta: TableMeta): boolean {
  const corte = linea.indexOf(":");
  if (corte < 1) return false;
  const nombre = simple(linea.slice(0, corte));
  const valor = linea.slice(corte + 1).trim();
  if (!valor) return false;

  for (const [patron, campo] of META) {
    if (patron.test(nombre)) {
      meta[campo] = valor;
      return true;
    }
  }
  return false;
}

/**
 * Lee una tabla pegada. La primera fila con tabuladores son los encabezados;
 * lo de arriba se mira por si trae fecha, turno o supervisor, y lo de abajo
 * sin tabuladores se guarda como notas.
 */
export function leerTsv(texto: string): TablaLeida | null {
  const lineas = texto.replace(/\r\n/g, "\n").split("\n");
  const meta: TableMeta = {};
  const notas: string[] = [];

  let title = "";
  let columns: string[] | null = null;
  const rows: string[][] = [];

  for (const linea of lineas) {
    if (!linea.trim()) continue;

    if (linea.includes("\t")) {
      const celdas = linea.split("\t").map((celda) => celda.trim());
      if (celdas.every((celda) => !celda)) continue;
      if (!columns) columns = celdas;
      else rows.push(celdas);
      continue;
    }

    // Fuera de la tabla: dato de cabecera, titulo o nota.
    if (leerMeta(linea, meta)) continue;
    if (!columns && !title) title = linea.trim();
    else notas.push(linea.trim());
  }

  if (!columns || rows.length === 0) return null;

  // Las filas se cuadran al numero de columnas: al copiar desde Excel sobran
  // o faltan celdas vacias al final.
  const ancho = columns.length;
  const cuadradas = rows.map((fila) => {
    const copia = fila.slice(0, ancho);
    while (copia.length < ancho) copia.push("");
    return copia;
  });

  return { title, meta, columns, rows: cuadradas, notes: notas.join(" ") };
}

// ---------------------------------------------------------------------------
// Validacion de lo que devuelve el modelo
// ---------------------------------------------------------------------------

/**
 * Tokens que tienen que sobrevivir intactos: horas, codigos y numeros.
 * Son los que no se pueden "traducir" sin romper el documento.
 */
export function tokensCriticos(texto: string): string[] {
  const tokens = new Set<string>();
  const recoger = (patron: RegExp) => {
    for (const encontrado of texto.matchAll(patron)) tokens.add(encontrado[0]);
  };

  recoger(/\b\d{1,2}:\d{2}(?::\d{2})?\b/g);
  recoger(/\b[A-Z]{1,3}-?\d+[A-Z0-9]*\b/g);
  recoger(/\b\d+(?:[.,]\d+)*\b/g);

  return [...tokens];
}

/** Quita los separadores de miles, para comparar 1.250.000 con 1,250,000. */
function sinSeparadores(texto: string): string {
  return texto.replace(/[.,](?=\d)/g, "");
}

/** Tokens del origen que ya no estan en el resultado. */
export function tokensPerdidos(origen: string, salida: string): string[] {
  const plano = sinSeparadores(salida);
  return tokensCriticos(origen).filter(
    (token) => !salida.includes(token) && !plano.includes(sinSeparadores(token)),
  );
}

/**
 * Palabras en espanol que delatan una traduccion a medias.
 *
 * Son palabras funcionales y del oficio que no existen en ingles; un nombre
 * propio o una matricula nunca cae aqui, asi que no hay avisos falsos por
 * "J. Perez" o "N123AV".
 */
const PALABRAS_ES = new Set([
  "de", "del", "la", "el", "los", "las", "una", "unos", "unas", "al", "que", "se",
  "con", "sin", "para", "por", "es", "son", "esta", "este", "estos", "estas", "mas",
  "pero", "como", "muy", "ya", "tambien", "desde", "cuando", "donde", "porque",
  "sus", "nos", "les", "hay", "fue", "ser", "hacer", "segun", "asi", "aunque",
  "entre", "hasta", "durante", "cada", "todo", "toda", "todos", "todas", "otro",
  "otra", "pendiente", "pendientes", "realizo", "realiza", "realizado", "revision",
  "revisiones", "falla", "fallas", "fallo", "turno", "puerta", "avion", "aviones",
  "aeronave", "almuerzo", "empleado", "empleados", "notas", "novedad", "novedades",
  "matricula", "tecnico", "tecnicos", "inspeccion", "mantenimiento", "completada",
  "completado", "diferida", "diferido", "pieza", "piezas", "llegada", "salida",
  "solicita", "solicito", "informa", "informo", "requiere", "aprobada", "aprobado",
  "cambio", "reemplazo", "trabajo", "trabajos", "estacion", "tripulacion",
  "noche", "dia", "dias", "manana", "tarde", "madrugada", "semana", "mes",
]);

/**
 * Lista de lo que quedo en espanol dentro de un resultado que deberia estar en
 * ingles. Vacia significa que la traduccion esta completa.
 *
 * Aqui no se usa detectLanguage a proposito: cuenta tildes, y una planilla es
 * casi toda codigos y apellidos ("J. Perez", "N123AV"), asi que daba por
 * espanola una tabla perfectamente traducida. Estas dos reglas miran palabras
 * concretas y no se equivocan con un nombre propio.
 */
export function restosEnEspanol(salida: string, destino: Lang): string[] {
  if (destino !== "en") return [];

  const restos = new Set<string>();
  const palabras = salida.match(/[\p{L}'’]+/gu) ?? [];

  for (const palabra of palabras) {
    if (PALABRAS_ES.has(simple(palabra))) {
      restos.add(palabra);
      continue;
    }
    // Una palabra con tilde que empieza en minuscula es un nombre comun: en
    // ingles no existe. Las que empiezan en mayuscula pueden ser apellidos.
    if (/^\p{Ll}/u.test(palabra) && /[áéíóúñü]/i.test(palabra)) {
      restos.add(palabra);
    }
  }

  return [...restos];
}

// ---------------------------------------------------------------------------
// Forma de la tabla
// ---------------------------------------------------------------------------

export interface RevisionTabla {
  table: TableData | null;
  /** Lo que no cuadra, en palabras que se le pueden ensenar a la persona. */
  problemas: string[];
}

/** Comprueba y cuadra lo que devolvio el modelo. */
export function normalizarTabla(crudo: unknown): RevisionTabla {
  const problemas: string[] = [];
  if (typeof crudo !== "object" || crudo === null) {
    return { table: null, problemas: ["la respuesta no es una tabla"] };
  }

  const datos = crudo as Record<string, unknown>;
  const columns = Array.isArray(datos.columns)
    ? datos.columns.map((columna) => String(columna ?? "").trim()).filter(Boolean)
    : [];
  if (columns.length === 0) {
    return { table: null, problemas: ["la tabla llego sin columnas"] };
  }

  const filas = Array.isArray(datos.rows) ? datos.rows : [];
  const rows: string[][] = [];
  filas.forEach((fila, indice) => {
    if (!Array.isArray(fila)) {
      problemas.push(`la fila ${indice + 1} no es una fila`);
      return;
    }
    const celdas = fila.map((celda) => String(celda ?? ""));
    if (celdas.length > columns.length) {
      problemas.push(
        `la fila ${indice + 1} trae ${celdas.length} celdas y hay ${columns.length} columnas`,
      );
      return;
    }
    while (celdas.length < columns.length) celdas.push("");
    rows.push(celdas);
  });

  const meta = (
    typeof datos.meta === "object" && datos.meta !== null ? datos.meta : {}
  ) as Record<string, unknown>;

  const texto = (valor: unknown) => {
    const limpio = typeof valor === "string" ? valor.trim() : "";
    return limpio || undefined;
  };

  return {
    table: {
      title: typeof datos.title === "string" ? datos.title.trim() : "",
      meta: {
        date: texto(meta.date),
        shift: texto(meta.shift),
        supervisor: texto(meta.supervisor),
      },
      columns,
      rows,
      notes: texto(datos.notes),
    },
    problemas,
  };
}

/** Nombre de hoja valido para Excel: sin : \ / ? * [ ] y hasta 31 caracteres. */
export function nombreDeHoja(titulo: string, porDefecto = "Sheet"): string {
  const limpio = titulo
    .replace(/[:\\/?*[\]]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 31)
    .trim();
  return limpio || porDefecto;
}

/**
 * La tabla en texto plano, separada por tabuladores.
 * Es lo que se copia al portapapeles: asi se pega en Excel o en el correo y
 * sigue siendo una tabla.
 */
export function tablaATexto(table: TableData, lang: Lang = "es"): string {
  const textos = labels(lang);
  const partes: string[] = [];
  if (table.title) partes.push(table.title);

  // Con la etiqueta delante, el texto se vuelve a leer como tabla si se
  // encadena otra accion encima del resultado.
  if (table.meta.date) partes.push(`${textos.date}: ${table.meta.date}`);
  if (table.meta.shift) partes.push(`${textos.shift}: ${table.meta.shift}`);
  if (table.meta.supervisor) partes.push(`${textos.supervisor}: ${table.meta.supervisor}`);
  if (partes.length > 0) partes.push("");

  partes.push(table.columns.join("\t"));
  for (const fila of table.rows) partes.push(fila.join("\t"));
  if (table.notes) {
    partes.push("");
    partes.push(table.notes);
  }

  return partes.join("\n");
}

/**
 * Convierte un texto en la tabla minima "#, Descripcion": un parrafo por fila.
 *
 * Es lo que permite bajar un reporte a Excel sin volver a llamar a la IA: el
 * texto ya esta escrito, aqui solo se numera.
 */
export function tablaDeParrafos(
  cuerpo: string,
  lang: Lang,
  titulo: string,
): TableData | null {
  const parrafos = cuerpo
    .replace(/\r\n/g, "\n")
    .split(/\n\s*\n|\n/)
    .map((parrafo) => parrafo.trim())
    .filter(Boolean);

  if (parrafos.length === 0) return null;

  const textos = labels(lang);
  return {
    title: titulo,
    meta: {},
    columns: [textos.number, textos.description],
    rows: parrafos.map((parrafo, indice) => [String(indice + 1), parrafo]),
  };
}
