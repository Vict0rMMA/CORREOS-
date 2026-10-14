import { FILAS_INICIALES, metaVacia, seccionVacia } from "@/lib/planilla";
import type { SheetDoc, SheetTemplateId } from "@/types";

/**
 * Las plantillas de AVX, sacadas de MODELO_TABLAS_SALIDA_EN.xlsx.
 *
 * Cada una tiene sus propias columnas: la del hangar no es la del terminal, y
 * la de noches ademas lleva bloques aparte (personal del dia, horas extra y
 * vehiculos). Se escriben en espanol, que es como trabaja quien las llena; el
 * titulo en ingles es el que lleva el documento al exportarlo.
 */

export interface Plantilla {
  id: SheetTemplateId;
  /** Como se llama en el selector. */
  label: string;
  /** Una linea de ayuda bajo el nombre. */
  hint: string;
  /** Titulo del documento en ingles, tal y como aparece en el modelo. */
  title: string;
  /** Bloques de la planilla. El primero es la tabla principal. */
  sections: { title: string; columns: string[]; rows?: number }[];
}

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
          "AVIÓN",
          "PUERTA",
          "HORA ASIGNADO",
          "AVIÓN 2",
          "PUERTA 2",
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
          "AVIÓN",
          "PUERTA",
          "HORA ASIGNADO",
          "HORA SALIDA",
          "AVIÓN 2",
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
      { title: "PERSONAL DEL DÍA", columns: ["#", "NOMBRE", "PRESENTE"], rows: 5 },
      { title: "HORAS EXTRA Y DISPONIBLES", columns: ["#", "NOMBRE", "TIPO"], rows: 4 },
      { title: "VEHÍCULOS", columns: ["UNIDAD", "CONDUCTOR", "TIPO"], rows: 4 },
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
 * Una planilla nueva a partir de una plantilla: con sus columnas y sus filas
 * en blanco. Las filas de ejemplo del modelo NO se copian; son datos de
 * muestra, no asignaciones de nadie.
 */
export function crearPlanilla(id: SheetTemplateId): SheetDoc {
  const plantilla = buscarPlantilla(id);
  return {
    template: plantilla.id,
    title: plantilla.title,
    meta: metaVacia(),
    sections: plantilla.sections.map((seccion) => ({
      ...seccionVacia(seccion.columns, seccion.rows ?? FILAS_INICIALES),
      title: seccion.title,
    })),
  };
}
