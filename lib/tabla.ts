import { labels } from "@/lib/export/i18n";
import { paraExportar } from "@/lib/planilla";
import type { Lang, SheetDoc, SheetSection } from "@/types";

/**
 * Lo que hace falta para pasar una planilla al ingles sin estropear los datos.
 *
 * La regla de la casa: una matricula, una hora o un numero no se traducen
 * NUNCA. Se copian tal cual y despues se comprueba que siguen ahi. Si algo no
 * cuadra se avisa senalando la celda; no se entrega una planilla con los datos
 * cambiados.
 */

/** Quita acentos y deja el texto comparable. */
function simple(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim();
}

/** Clave con la que se busca en los mapas. */
function clave(value: string): string {
  return simple(value)
    .replace(/[^a-z0-9@/#]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

// ---------------------------------------------------------------------------
// Encabezados: traduccion fija, sin IA
// ---------------------------------------------------------------------------

/**
 * Encabezados de las plantillas de AVX, tal y como aparecen en el modelo.
 *
 * El orden importa: el primero de cada grupo es el nombre canonico, el que
 * usan las plantillas. Los siguientes son sinonimos que se entienden al leer
 * pero que nunca se escriben. Cualquier columna que no este aqui la traduce el
 * modelo.
 */
const ENCABEZADOS: Array<[string, string]> = [
  ["EMPLEADO", "EMPLOYEE"],
  ["ALMUERZO", "LUNCH"],
  ["ESTADO", "STATUS"],
  ["AVIÓN", "A/C"],
  ["AERONAVE", "A/C"],
  ["PUERTA", "GATE"],
  ["HORA ASIGNADO", "ASSGN @"],
  ["HORA ASIGNADA", "ASSGN @"],
  ["HORA SALIDA", "ETD"],
  ["HORA DE SALIDA", "ETD"],
  ["ESTACIÓN", "STA"],
  ["TRIPULACIÓN", "CREW"],
  ["TÉCNICO AVX", "AVX TECH"],
  ["FALLA DIFERIDA", "MEL/NEF"],
  ["N.° EMPLEADO", "EMP #"],
  ["NÚMERO DE EMPLEADO", "EMP #"],
  ["FECHA", "DATE"],
  ["TURNO", "SHIFT"],
  ["SUPERVISOR", "SUPERVISOR"],
  ["CREW CHIEF", "CREW CHIEF"],
  ["JEFE DE CUADRILLA", "CREW CHIEF"],
  ["NOTAS", "NOTES"],
  ["TIPO", "TYPE"],
  ["NOMBRE", "NAME"],
  ["PRESENTE", "PRESENT"],
  ["UNIDAD", "UNIT"],
  ["CONDUCTOR", "DRIVER"],
  ["PERSONAL DEL DÍA", "DAILY MANNING"],
  ["HORAS EXTRA Y DISPONIBLES", "O/T & STANDBY"],
  ["VEHÍCULOS", "VEHICLE LIST"],
];

/**
 * Los dos mapas, con una regla clara: gana el PRIMERO de cada grupo.
 *
 * Al invertir la lista sin mas, el ultimo sinonimo pisaba al canonico y "A/C"
 * volvia como AERONAVE en vez de AVIÓN, o "EMP #" como NÚMERO DE EMPLEADO en
 * vez de N.° EMPLEADO. Con `primeroGana` el ingles vuelve al nombre que de
 * verdad lleva la plantilla.
 */
function primeroGana(pares: Array<[string, string]>): Map<string, string> {
  const mapa = new Map<string, string>();
  for (const [llave, valor] of pares) {
    if (!mapa.has(llave)) mapa.set(llave, valor);
  }
  return mapa;
}

const A_INGLES = primeroGana(ENCABEZADOS.map(([es, en]) => [clave(es), en]));
const A_ESPANOL = primeroGana(ENCABEZADOS.map(([es, en]) => [clave(en), es]));

/** Columnas repetidas de la plantilla: "AVIÓN 2", "HORA ASIGNADO 3". */
const NUMERADA = /^(.*\S)\s+(\d+)$/;

/**
 * Traduce un encabezado conocido. Devuelve null si no esta en la plantilla:
 * esos los traduce el modelo.
 */
export function traducirEncabezado(nombre: string, destino: Lang): string | null {
  const texto = nombre.trim();
  const llave = clave(texto);
  if (!llave) return null;

  const directo = destino === "en" ? A_INGLES.get(llave) : A_ESPANOL.get(llave);
  if (directo) return directo;

  // Ya venia en el idioma de destino: se deja como esta.
  const alReves = destino === "en" ? A_ESPANOL.get(llave) : A_INGLES.get(llave);
  if (alReves) return texto.toUpperCase();

  // "AVIÓN 2" se traduce por su base y se le devuelve el numero.
  const numerada = NUMERADA.exec(texto);
  if (numerada) {
    const base = traducirEncabezado(numerada[1], destino);
    if (base) return `${base} ${numerada[2]}`;
  }

  return null;
}

/**
 * Valores de siempre: estados, tipos y respuestas que se repiten en cada
 * planilla. Tambien se resuelven sin IA, asi son iguales todos los dias.
 */
const VALORES: Array<[string, string]> = [
  ["presente", "PRESENT"],
  ["ausente", "ABSENT"],
  ["vacaciones", "VACATION"],
  ["incapacidad", "SICK LEAVE"],
  ["descanso", "DAY OFF"],
  ["permiso", "LEAVE"],
  ["capacitacion", "TRAINING"],
  ["entrenamiento", "TRAINING"],
  ["si", "YES"],
  ["no", "NO"],
  ["hora extra", "OVERTIME"],
  ["horas extra", "OVERTIME"],
  ["disponible", "STANDBY"],
  ["dia", "DAY"],
  ["noche", "NIGHT"],
  ["tarde", "AFTERNOON"],
  ["manana", "MORNING"],
  ["madrugada", "EARLY MORNING"],
  ["fin de semana", "WEEKEND"],
  ["entrada", "INBOUND"],
  ["llegada", "INBOUND"],
  ["salida", "OUTBOUND"],
  ["doble cabina", "DUAL CB"],
  ["sencillo", "SINGLE"],
];

const VALOR_A_INGLES = new Map(VALORES);
const VALOR_A_ESPANOL = new Map(
  VALORES.map(([es, en]) => [clave(en), es.toUpperCase()] as [string, string]),
);

/** Traduce un valor de los de siempre. null si no es uno de ellos. */
export function traducirValor(valor: string, destino: Lang): string | null {
  const llave = clave(valor);
  if (!llave) return null;

  if (destino === "en") {
    const directo = VALOR_A_INGLES.get(llave);
    if (directo) return directo;
    return VALOR_A_ESPANOL.has(llave) ? valor.toUpperCase() : null;
  }

  const directo = VALOR_A_ESPANOL.get(llave);
  if (directo) return directo;
  return VALOR_A_INGLES.has(llave) ? valor.toUpperCase() : null;
}

/**
 * La fecha de la cabecera, en el orden que se lee en cada idioma.
 *
 * En espanol es dia/mes (14/10/2026) y en Estados Unidos mes/dia
 * (10/14/2026), que es como la trae el modelo de AVX. Dejarla igual parece
 * inofensivo hasta que llega el 5 de octubre: "05/10/2026" en ingles es el 10
 * de mayo. Si la fecha no tiene esa forma, o no cuadra, se deja como esta.
 */
export function fechaParaIdioma(fecha: string, destino: Lang): string {
  const partes = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(fecha.trim());
  if (!partes) return fecha;
  const [, primero, segundo, anio] = partes;
  // Al ir al ingles el mes es el segundo numero; al volver, el primero.
  const mes = Number(destino === "en" ? segundo : primero);
  const dia = Number(destino === "en" ? primero : segundo);
  if (mes < 1 || mes > 12 || dia < 1 || dia > 31) return fecha;
  return `${segundo.padStart(2, "0")}/${primero.padStart(2, "0")}/${anio}`;
}

// ---------------------------------------------------------------------------
// Celdas: que es dato y que es texto
// ---------------------------------------------------------------------------

const HORA = /^\d{1,2}:\d{2}(?::\d{2})?$/;
const NUMERO = /^[+-]?\d+(?:[.,]\d+)*\s*%?$/;
const FECHA = /^\d{1,2}[/.-]\d{1,2}(?:[/.-]\d{2,4})?$/;

/**
 * Codigo operativo: en mayusculas y, ademas, con alguna marca de codigo
 * (lleva un numero, un separador, o es una sigla corta).
 *
 * Sin esa segunda condicion una palabra como PRESENTE o VACACIONES pasaria
 * por codigo y se quedaria en espanol dentro de una planilla en ingles.
 */
export function esCodigo(valor: string): boolean {
  const texto = valor.trim();
  if (!texto || /[a-zà-ÿ]/.test(texto)) return false;
  // Los dos puntos entran para que un rango de horas ("12:30 - 13:30") cuente
  // como dato y no acabe en la IA.
  if (!/^[A-Z0-9][A-Z0-9@#/.:\- ]*$/.test(texto)) return false;
  return /\d/.test(texto) || /[/\-#@]/.test(texto) || texto.replace(/\s/g, "").length <= 4;
}

/** true si la celda es un dato que se copia tal cual, sin pasar por la IA. */
export function esDato(valor: string): boolean {
  const texto = valor.trim();
  if (!texto) return true;
  return HORA.test(texto) || NUMERO.test(texto) || FECHA.test(texto) || esCodigo(texto);
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

/**
 * true si la celda tiene texto de verdad y hay que mandarla al modelo.
 * Antes se mira si es un dato, un nombre o uno de los valores de siempre.
 */
export function necesitaTraduccion(valor: string, destino: Lang, columna = ""): boolean {
  if (traducirValor(valor, destino)) return false;
  return !seCopiaTalCual(valor, columna);
}

/**
 * Columnas donde van nombres de persona.
 *
 * Solo en ellas una palabra con mayuscula se toma por un nombre. Mirando la
 * palabra sola no se puede saber: "Pérez" es un apellido, pero "Puntual",
 * "Ninguna" o "PRESENTE" tambien empiezan en mayuscula, y se quedaban sin
 * traducir por parecer apellidos.
 */
const COLUMNAS_DE_NOMBRES = new Set([
  "empleado",
  "nombre",
  "tecnico",
  "tecnico avx",
  "conductor",
  "supervisor",
  "crew chief",
  "jefe de cuadrilla",
  "responsable",
  "employee",
  "name",
  "avx tech",
  "driver",
]);

export function esColumnaDeNombres(columna: string): boolean {
  return COLUMNAS_DE_NOMBRES.has(clave(columna).replace(/\s+\d+$/, ""));
}

/**
 * true si la celda se copia tal cual, sin pasar por la IA: un dato
 * (matricula, hora, codigo, numero) en cualquier columna, o un nombre en una
 * columna de nombres.
 */
export function seCopiaTalCual(valor: string, columna: string): boolean {
  if (esDato(valor)) return true;
  return esColumnaDeNombres(columna) && pareceNombre(valor);
}

// ---------------------------------------------------------------------------
// Validacion
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
  "presente", "ausente", "vacaciones", "incapacidad", "descanso", "permiso",
  "programado", "programada", "vehiculo", "vehiculos", "conductor", "unidad",
  // Lo que se escribe en las notas del turno, a veces en una sola palabra.
  "ninguna", "ninguno", "ningun", "nada", "puntual", "temprano", "listo", "lista",
  "completo", "completa", "falta", "faltan", "revisar", "revisado", "revisada",
  "enfermo", "enferma", "retraso", "retrasado", "retrasada", "demora", "cancelado",
  "cancelada", "reparado", "reparada", "cambiar", "llanta", "llantas", "freno",
  "frenos", "aceite", "combustible", "rueda", "ruedas", "luz", "luces", "asiento",
  "asientos", "limpieza", "equipaje", "pasajeros", "vuelo", "vuelos", "si", "bien",
  "hoy", "ayer", "ahora", "despues", "antes", "siempre", "nunca", "alguno",
  "alguna", "apoyo", "sala", "salas", "atrasado", "atrasada", "entregado",
  "entregada", "asignado", "asignada", "disponible", "ocupado", "ocupada",
]);

/**
 * Lo que quedo en espanol dentro de un texto que deberia estar en ingles.
 * Vacio significa que la traduccion esta completa.
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

/** Un problema concreto, con la celda a la que hay que ir. */
export interface Aviso {
  /** Indice del bloque dentro de la planilla. */
  section: number;
  /** Fila de datos, o -1 si el problema esta en el encabezado. */
  row: number;
  column: number;
  /** Nombre de la columna, para poder decirlo con palabras. */
  columnLabel: string;
  message: string;
}

/**
 * Revisa la planilla traducida contra la original, celda por celda.
 *
 * Comprueba la estructura (mismas filas, mismas columnas, celdas en su sitio),
 * los datos protegidos (que no haya desaparecido ningun codigo, hora o
 * numero) y que no quede espanol donde deberia haber ingles.
 */
export function revisarPlanilla(
  origen: SheetDoc,
  salida: SheetDoc,
  destino: Lang,
): Aviso[] {
  const avisos: Aviso[] = [];

  if (origen.sections.length !== salida.sections.length) {
    avisos.push({
      section: 0,
      row: -1,
      column: 0,
      columnLabel: "",
      message: `la planilla tenía ${origen.sections.length} bloque(s) y volvió con ${salida.sections.length}`,
    });
    return avisos;
  }

  origen.sections.forEach((bloque, indiceBloque) => {
    const traducido = salida.sections[indiceBloque];
    const nombre = (columna: number) =>
      traducido.columns[columna] ?? bloque.columns[columna] ?? `columna ${columna + 1}`;

    if (traducido.columns.length !== bloque.columns.length) {
      avisos.push({
        section: indiceBloque,
        row: -1,
        column: 0,
        columnLabel: "",
        message: `el bloque tenía ${bloque.columns.length} columnas y volvió con ${traducido.columns.length}`,
      });
      return;
    }

    if (traducido.rows.length !== bloque.rows.length) {
      avisos.push({
        section: indiceBloque,
        row: -1,
        column: 0,
        columnLabel: "",
        message: `el bloque tenía ${bloque.rows.length} filas y volvió con ${traducido.rows.length}`,
      });
      return;
    }

    traducido.columns.forEach((columna, indiceColumna) => {
      // Un encabezado de la plantilla es correcto por construccion.
      if (traducirEncabezado(columna, destino) === columna.trim().toUpperCase()) return;
      const restos = restosEnEspanol(columna, destino);
      if (restos.length > 0) {
        avisos.push({
          section: indiceBloque,
          row: -1,
          column: indiceColumna,
          columnLabel: columna,
          message: `el título de la columna sigue en español: ${restos.join(", ")}`,
        });
      }
    });

    bloque.rows.forEach((fila, indiceFila) => {
      const filaTraducida = traducido.rows[indiceFila] ?? [];

      fila.forEach((celda, indiceColumna) => {
        const original = celda.trim();
        const salida = (filaTraducida[indiceColumna] ?? "").trim();

        const avisar = (message: string) => {
          avisos.push({
            section: indiceBloque,
            row: indiceFila,
            column: indiceColumna,
            columnLabel: nombre(indiceColumna),
            message,
          });
        };

        if (!original && salida) {
          avisar(`aquí no habías escrito nada y ahora dice «${salida}»`);
          return;
        }

        if (original && !salida) {
          avisar(`se perdió «${original}»`);
          return;
        }

        if (!original) return;

        // Los valores de siempre tienen su traduccion fija.
        const fijo = traducirValor(original, destino);
        if (fijo) {
          if (salida !== fijo) {
            avisar(`dice «${salida}» y debería decir «${fijo}»`);
          }
          return;
        }

        // Una matricula, una hora, un codigo, o un nombre en su columna, no
        // se traducen: la unica forma correcta de volver es identicos. Y no se
        // les mira el idioma, porque un codigo como "LA-4316" lleva dentro la
        // palabra "LA" sin tener nada de espanol.
        if (seCopiaTalCual(original, bloque.columns[indiceColumna] ?? "")) {
          if (original !== salida) {
            avisar(`dice «${salida}» y en tu planilla dice «${original}»`);
          }
          return;
        }


        // Lo que queda es texto que si paso por la IA.
        const perdidos = tokensPerdidos(original, salida);
        if (perdidos.length > 0) {
          avisar(`falta ${perdidos.map((dato) => `«${dato}»`).join(", ")}`);
          return;
        }

        const restos = restosEnEspanol(salida, destino);
        if (restos.length > 0) {
          avisar(`sigue en español: ${restos.map((palabra) => `«${palabra}»`).join(", ")}`);
        }
      });
    });
  });

  return avisos;
}

// ---------------------------------------------------------------------------
// Utilidades de salida
// ---------------------------------------------------------------------------

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
 * La planilla en texto plano, separada por tabuladores.
 * Es lo que se copia al portapapeles: asi se pega en Excel o en el correo y
 * sigue siendo una tabla.
 */
export function planillaATexto(doc: SheetDoc, lang: Lang): string {
  const textos = labels(lang);
  const partes: string[] = [];
  if (doc.title) partes.push(doc.title);
  if (doc.meta.date) partes.push(`${textos.date}: ${doc.meta.date}`);
  if (doc.meta.shift) partes.push(`${textos.shift}: ${doc.meta.shift}`);
  if (doc.meta.supervisor) partes.push(`${textos.supervisor}: ${doc.meta.supervisor}`);

  for (const bloque of paraExportar(doc).sections) {
    partes.push("");
    if (bloque.title) partes.push(bloque.title);
    partes.push(bloque.columns.join("\t"));
    for (const fila of bloque.rows) partes.push(fila.join("\t"));
  }

  if (doc.notes) {
    partes.push("");
    partes.push(doc.notes);
  }

  return partes.join("\n").trim();
}

/**
 * Convierte un texto en una planilla de dos columnas, "#" y "Descripcion",
 * con un parrafo por fila. Es lo que permite bajar un reporte a Excel sin
 * volver a llamar a la IA.
 */
export function planillaDeParrafos(
  cuerpo: string,
  lang: Lang,
  titulo: string,
): SheetDoc | null {
  const parrafos = cuerpo
    .replace(/\r\n/g, "\n")
    .split(/\n\s*\n|\n/)
    .map((parrafo) => parrafo.trim())
    .filter(Boolean);

  if (parrafos.length === 0) return null;

  const textos = labels(lang);
  const seccion: SheetSection = {
    title: "",
    columns: [textos.number, textos.description],
    rows: parrafos.map((parrafo, indice) => [String(indice + 1), parrafo]),
  };

  return {
    template: "custom",
    title: titulo,
    meta: { date: "", shift: "", supervisor: "" },
    sections: [seccion],
  };
}
