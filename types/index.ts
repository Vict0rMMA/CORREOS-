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
 * Como tiene que venir la respuesta del modelo.
 * "table" solo lo usa la planilla: en vez de texto corrido devuelve el JSON
 * de la tabla, que es lo que luego se vuelca a Excel, Word o PDF.
 */
export type ResponseFormat = "text" | "table";

/** Datos de cabecera de una planilla (los que van sobre la tabla). */
export interface TableMeta {
  date?: string;
  shift?: string;
  supervisor?: string;
}

/** Una planilla ya resuelta: lo que se descarga como Excel. */
export interface TableData {
  title: string;
  meta: TableMeta;
  columns: string[];
  rows: string[][];
  notes?: string;
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
  /** Por defecto "text"; la planilla pide "table". */
  format?: ResponseFormat;
}

/** Respuesta de /api/process cuando se pidio una tabla. */
export interface TableResponse {
  table: TableData;
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
  /** Planilla resuelta, cuando el texto se proceso como tabla. */
  table?: TableData;
}

export interface Prefs {
  lang: Lang;
  /** Idioma al que traduce el boton Traducir. */
  targetLang: Lang;
  tone: Tone;
  textType: TextType;
  signature: string;
  /** Pone el logo de American Airlines en Excel, Word, PDF e impresion. */
  includeLogo: boolean;
}
