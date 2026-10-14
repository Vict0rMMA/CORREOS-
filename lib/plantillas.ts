import { FILAS_INICIALES, filaVacia, metaVacia } from "@/lib/planilla";
import type { SheetDoc, SheetTemplateId } from "@/types";

/**
 * Las plantillas de AVX, sacadas de MODELO_TABLAS_SALIDA_EN.xlsx.
 *
 * Cada una tiene sus propias columnas: la del hangar no es la del terminal, y
 * la de noches ademas lleva bloques aparte (personal del dia, horas extra y
 * vehiculos). Se escriben en espanol, que es como trabaja quien las llena; el
 * titulo en ingles es el que lleva el documento al exportarlo.
 */

export interface BloquePlantilla {
  /** Encabezado del bloque; vacio en la tabla principal. */
  title: string;
  columns: string[];
  /** Cuantas filas trae en blanco. */
  rows?: number;
  /**
   * Valores que vienen puestos de fabrica, por fila y columna.
   * Son los que no cambian de un turno a otro (la flota, la numeracion), no
   * asignaciones de nadie.
   */
  datos?: string[][];
}

export interface Plantilla {
  id: SheetTemplateId;
  /** Como se llama en el selector. */
  label: string;
  /** Una linea de ayuda bajo el nombre. */
  hint: string;
  /** Titulo del documento en ingles, tal y como aparece en el modelo. */
  title: string;
  sections: BloquePlantilla[];
}

/**
 * Las columnas de una asignacion, repetidas tantas veces como asignaciones
 * caben en el turno. La primera va sin numero y las demas con el suyo:
 * AVIÓN, PUERTA, HORA ASIGNADO, AVIÓN 2, PUERTA 2, HORA ASIGNADO 2...
 */
function asignaciones(campos: string[], veces: number): string[] {
  const columnas: string[] = [];
  for (let numero = 1; numero <= veces; numero += 1) {
    for (const campo of campos) {
      columnas.push(numero === 1 ? campo : `${campo} ${numero}`);
    }
  }
  return columnas;
}

/** Una columna numerada de 1 a N, con el resto de la fila en blanco. */
function numeradas(hasta: number, ancho: number): string[][] {
  return Array.from({ length: hasta }, (_, indice) => {
    const fila = filaVacia(ancho);
    fila[0] = String(indice + 1);
    return fila;
  });
}

/** La flota fija: unidad y tipo vienen puestos, el conductor se escribe. */
const VEHICULOS: Array<[string, string]> = [
  ["305142", "DUAL CB"],
  ["22534", "SINGLE"],
  ["22534", "SINGLE"],
  ["22532", "SINGLE"],
  ["21272", "RANGER"],
  ["23224", "RANGER"],
  ["27565", "DUAL CB"],
];

export const PLANTILLAS: Plantilla[] = [
  {
    id: "terminal",
    label: "Terminal",
    hint: "Asignación del día en terminal",
    title: "TERMINAL DAILY ASSIGNMENT",
    sections: [
      {
        title: "",
        columns: [
          "EMPLEADO",
          "ALMUERZO",
          ...asignaciones(["AVIÓN", "PUERTA", "HORA ASIGNADO"], 4),
          "NOTAS",
        ],
      },
    ],
  },
  {
    id: "hangar",
    label: "Hangar",
    hint: "Asignación del día en hangar",
    title: "HANGAR DAILY ASSIGNMENT",
    sections: [
      {
        title: "",
        columns: [
          "EMPLEADO",
          "ESTADO",
          ...asignaciones(["AVIÓN", "PUERTA", "HORA ASIGNADO", "HORA SALIDA"], 4),
          "NOTAS",
        ],
      },
    ],
  },
  {
    id: "nights",
    label: "Turnos nocturnos",
    hint: "Terminal de noche, con personal y vehículos",
    title: "TERMINAL NIGHT DAILY ASSIGNMENT",
    sections: [
      {
        title: "",
        columns: [
          "TIPO",
          "AVIÓN",
          "ESTACIÓN",
          "TRIPULACIÓN",
          "PUERTA",
          "FALLA DIFERIDA",
          "TÉCNICO AVX",
          "N.° EMPLEADO",
          "HORA ASIGNADO",
        ],
      },
      {
        title: "PERSONAL DEL DÍA",
        columns: ["#", "NOMBRE", "PRESENTE"],
        rows: 17,
        datos: numeradas(17, 3),
      },
      {
        title: "HORAS EXTRA Y DISPONIBLES",
        columns: ["#", "NOMBRE", "TIPO"],
        rows: 6,
        datos: numeradas(6, 3),
      },
      {
        title: "VEHÍCULOS",
        columns: ["UNIDAD", "CONDUCTOR", "TIPO"],
        rows: 7,
        datos: VEHICULOS.map(([unidad, tipo]) => [unidad, "", tipo]),
      },
    ],
  },
  {
    id: "custom",
    label: "En blanco",
    hint: "Tus propias columnas",
    title: "DAILY ASSIGNMENT",
    sections: [
      {
        title: "",
        columns: ["EMPLEADO", "AVIÓN", "PUERTA", "HORA ASIGNADO", "NOTAS"],
      },
    ],
  },
];

export function buscarPlantilla(id: SheetTemplateId): Plantilla {
  return PLANTILLAS.find((plantilla) => plantilla.id === id) ?? PLANTILLAS[0];
}

/**
 * Una planilla nueva a partir de una plantilla: con sus columnas, sus filas en
 * blanco y lo que viene de fabrica (la flota y la numeracion).
 *
 * Las filas de ejemplo del modelo NO se copian: son datos de muestra, no
 * asignaciones de nadie.
 */
export function crearPlanilla(id: SheetTemplateId): SheetDoc {
  const plantilla = buscarPlantilla(id);

  return {
    template: plantilla.id,
    title: plantilla.title,
    meta: metaVacia(),
    sections: plantilla.sections.map((bloque) => {
      const alto = bloque.rows ?? FILAS_INICIALES;
      const ancho = bloque.columns.length;
      const rows = Array.from({ length: alto }, (_, indice) => {
        const fija = bloque.datos?.[indice];
        if (!fija) return filaVacia(ancho);
        const copia = fija.slice(0, ancho);
        while (copia.length < ancho) copia.push("");
        return copia;
      });

      return { title: bloque.title, columns: [...bloque.columns], rows };
    }),
  };
}

/** true si la planilla sigue igual que recien creada, sin nada escrito. */
export function esPlantillaIntacta(doc: SheetDoc): boolean {
  return JSON.stringify(doc) === JSON.stringify(crearPlanilla(doc.template));
}
