import type { Action, TextType, Tone } from "@/types";

export interface ActionMeta {
  id: Action;
  label: string;
  hint: string;
}

/** Acciones principales (debajo del editor). */
export const MAIN_ACTIONS: ActionMeta[] = [
  { id: "correct", label: "Corregir", hint: "Ortografía, gramática y puntuación" },
  { id: "translate", label: "Traducir", hint: "Cambia al otro idioma de forma natural" },
  { id: "improve", label: "Mejorar", hint: "Mejora la redacción sin cambiar la intención" },
  { id: "generate_email", label: "Generar correo", hint: "Convierte una idea en un correo completo" },
];

/** Acciones rápidas (un clic). */
export const QUICK_ACTIONS: ActionMeta[] = [
  { id: "correct", label: "Corregir", hint: "Corrige el texto" },
  { id: "to_english", label: "Traducir al inglés", hint: "Traducción natural al inglés" },
  { id: "to_spanish", label: "Traducir al español", hint: "Traducción natural al español" },
  { id: "more_professional", label: "Más profesional", hint: "Sube el registro" },
  { id: "shorter", label: "Más corto", hint: "Reduce sin perder información" },
  { id: "friendlier", label: "Más amable", hint: "Tono más cálido" },
  { id: "more_direct", label: "Más directo", hint: "Va al punto" },
  { id: "generate_email", label: "Generar correo", hint: "Idea a correo completo" },
];

export const ACTION_LABELS: Record<Action, string> = {
  correct: "Corregir",
  translate: "Traducir",
  improve: "Mejorar",
  generate_email: "Generar correo",
  to_english: "Traducir al inglés",
  to_spanish: "Traducir al español",
  more_professional: "Más profesional",
  shorter: "Más corto",
  friendlier: "Más amable",
  more_direct: "Más directo",
};

export const TONES: { id: Tone; label: string }[] = [
  { id: "professional", label: "Profesional" },
  { id: "formal", label: "Formal" },
  { id: "friendly", label: "Amable" },
  { id: "casual", label: "Casual" },
  { id: "academic", label: "Académico" },
  { id: "concise", label: "Corto y directo" },
];

export const TEXT_TYPES: { id: TextType; label: string }[] = [
  { id: "email", label: "Correo" },
  { id: "report", label: "Reporte" },
  { id: "message", label: "Mensaje" },
  { id: "academic", label: "Texto académico" },
  { id: "work", label: "Trabajo" },
  { id: "request", label: "Solicitud" },
  { id: "reply", label: "Respuesta" },
  { id: "general", label: "General" },
];

export const ALL_ACTIONS = Object.keys(ACTION_LABELS) as Action[];

export function isAction(value: unknown): value is Action {
  return typeof value === "string" && (ALL_ACTIONS as string[]).includes(value);
}

export function isTone(value: unknown): value is Tone {
  return typeof value === "string" && TONES.some((t) => t.id === value);
}

export function isTextType(value: unknown): value is TextType {
  return typeof value === "string" && TEXT_TYPES.some((t) => t.id === value);
}
