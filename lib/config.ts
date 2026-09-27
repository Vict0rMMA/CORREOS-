/**
 * Configuracion general de la aplicacion.
 * Cambia APP_NAME aqui y se actualiza en toda la interfaz.
 */
export const APP_NAME = "PAULA CORREOS";
export const APP_TAGLINE = "Write better. Translate naturally.";
export const APP_DESCRIPTION =
  "Redacta, corrige y traduce correos y textos entre español e inglés con calidad profesional.";

/** Limite de caracteres aceptado por el cliente (el servidor valida de nuevo). */
export const MAX_INPUT_CHARS = 12000;

/** Cuantos elementos guarda el historial local. */
export const HISTORY_LIMIT = 20;

/** Claves de localStorage. */
export const STORAGE_KEYS = {
  prefs: "paula:prefs",
  history: "paula:history",
  draft: "paula:draft",
  theme: "paula:theme",
} as const;
