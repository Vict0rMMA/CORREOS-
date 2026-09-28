export type Lang = "es" | "en";

export type Tone =
  | "professional"
  | "formal"
  | "friendly"
  | "casual"
  | "academic"
  | "concise";

export type TextType = "email" | "report" | "message";

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
  lang: Lang;
  /** Idioma al que traduce el boton Traducir. */
  targetLang: Lang;
  tone: Tone;
  textType: TextType;
  signature: string;
}
