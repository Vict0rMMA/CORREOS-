export type Lang = "es" | "en";

export type Tone =
  | "professional"
  | "formal"
  | "friendly"
  | "casual"
  | "academic"
  | "concise";

export type TextType = "email" | "report" | "message" | "sheet";

/**
 * Las dos mitades de la aplicacion, cada una con su pestana.
 * Los correos y las planillas no se mezclan: cada seccion tiene su borrador,
 * su resultado y sus guardados.
 */
export type Seccion = "correos" | "planillas" | "guardadas";

/** Datos de cabecera de una planilla (los que van sobre la tabla). */
export interface SheetMeta {
  date: string;
  shift: string;
  supervisor: string;
}

/**
 * Un bloque de la planilla. Casi todas tienen uno solo; la de turnos
 * nocturnos lleva ademas el personal del dia, las horas extra y los vehiculos.
 */
export interface SheetSection {
  /** Encabezado del bloque; vacio en la tabla principal. */
  title: string;
  columns: string[];
  rows: string[][];
}

export type SheetTemplateId = "terminal" | "hangar" | "nights" | "custom";

/** Una planilla entera: lo que se edita en la cuadricula y lo que se exporta. */
export interface SheetDoc {
  template: SheetTemplateId;
  title: string;
  meta: SheetMeta;
  sections: SheetSection[];
  /** Notas libres bajo la tabla. */
  notes?: string;
}

/** Celda suelta que se manda a traducir, con su identificador estable. */
export interface SheetCell {
  id: string;
  text: string;
}

/** Firma escaneada, recortada y con el fondo quitado. */
export interface SignatureDrawing {
  /** PNG transparente en data URL. */
  dataUrl: string;
  width: number;
  height: number;
  /** true si vino del archivo que trae la aplicacion, no de una subida. */
  deSerie?: boolean;
}

/** Foto adjunta a un reporte, ya normalizada a JPEG. */
export interface ReportImage {
  id: string;
  name: string;
  /** JPEG en data URL, listo para Word, PDF e impresion. */
  dataUrl: string;
  width: number;
  height: number;
  caption: string;
}

export type Action =
  | "correct"
  | "translate"
  | "improve"
  | "generate_email"
  | "to_english"
  | "to_spanish"
  | "more_professional"
  | "shorter"
  | "friendlier"
  | "more_direct";

/** Cuerpo de la peticion a /api/process. */
export interface ProcessRequest {
  action: Action;
  text: string;
  lang: Lang;
  tone: Tone;
  textType: TextType;
  subject?: string;
  signature?: string;
}

/** Cuerpo de la peticion a /api/subject. */
export interface SubjectRequest {
  text: string;
  lang: Lang;
  tone: Tone;
}

export interface SubjectResponse {
  subjects: string[];
}

export type Status = "idle" | "empty" | "loading" | "done" | "error" | "copied";

export interface HistoryItem {
  id: string;
  preview: string;
  input: string;
  output: string;
  subject?: string;
  lang: Lang;
  action: Action;
  textType: TextType;
  tone: Tone;
  createdAt: number;
}

export interface Prefs {
  /** Pestana en la que se abre la aplicacion. */
  seccion: Seccion;
  lang: Lang;
  /** Idioma al que traduce el boton Traducir. */
  targetLang: Lang;
  tone: Tone;
  textType: TextType;
  signature: string;
  /** Pone el logo de American Airlines en Excel, Word, PDF e impresion. */
  includeLogo: boolean;
}
