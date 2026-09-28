/**
 * Configuracion general de la aplicacion.
 * Cambia APP_NAME aqui y se actualiza en toda la interfaz.
 */
export const APP_NAME = "PAULA CORREOS";
export const APP_TAGLINE = "Write better. Translate naturally.";
export const APP_DESCRIPTION =
  "Redacta, corrige y traduce correos y textos entre español e inglés con calidad profesional.";

/**
 * Firma que se usa mientras no se escriba otra.
 * La aplicacion es de una sola persona: viene puesta para no tener que
 * escribirla, y se puede cambiar desde el campo "Tu firma".
 */
export const DEFAULT_SIGNATURE = "Paula Andrea Ochoa";

/** Limite de caracteres aceptado por el cliente (el servidor valida de nuevo). */
export const MAX_INPUT_CHARS = 12000;

/**
 * Cuantos textos guarda el historial.
 * Es todo lo que cabe comodamente en el navegador: si se llenara, se van
 * soltando los mas antiguos (ver saveHistory).
 */
export const HISTORY_LIMIT = 400;

/** Claves de localStorage. */
export const STORAGE_KEYS = {
  prefs: "paula:prefs",
  history: "paula:history",
  draft: "paula:draft",
  // La firma escaneada va aparte: pesa mucho mas que el resto de ajustes.
  signatureImage: "paula:firma-imagen",
} as const;
