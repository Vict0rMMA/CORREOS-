import { isTextType, isTone } from "@/lib/actions";
import { DEFAULT_SIGNATURE, HISTORY_LIMIT, STORAGE_KEYS } from "@/lib/config";
import type { HistoryItem, Prefs } from "@/types";

/**
 * Persistencia local. Todo va envuelto en try/catch porque localStorage
 * puede no estar disponible (modo privado, cookies bloqueadas, SSR).
 */

export const DEFAULT_PREFS: Prefs = {
  lang: "es",
  targetLang: "en",
  tone: "professional",
  textType: "email",
  signature: DEFAULT_SIGNATURE,
};

function read<T>(key: string): T | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

function write(key: string, value: unknown): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* sin espacio o sin permiso: la app sigue funcionando */
  }
}

export function loadPrefs(): Prefs {
  const stored = read<Partial<Prefs>>(STORAGE_KEYS.prefs);
  const merged = { ...DEFAULT_PREFS, ...(stored ?? {}) };

  // Lo guardado puede venir de una version anterior con otras opciones:
  // cualquier valor que ya no exista vuelve al predeterminado.
  return {
    ...merged,
    lang: merged.lang === "en" ? "en" : "es",
    targetLang: merged.targetLang === "es" ? "es" : "en",
    tone: isTone(merged.tone) ? merged.tone : DEFAULT_PREFS.tone,
    textType: isTextType(merged.textType) ? merged.textType : DEFAULT_PREFS.textType,
    // Una firma vacia guardada se entiende como "todavia no la he puesto".
    signature:
      typeof merged.signature === "string" && merged.signature.trim()
        ? merged.signature
        : DEFAULT_SIGNATURE,
  };
}

export function savePrefs(prefs: Prefs): void {
  write(STORAGE_KEYS.prefs, prefs);
}

export function loadDraft(): string {
  if (typeof window === "undefined") return "";
  try {
    return window.localStorage.getItem(STORAGE_KEYS.draft) ?? "";
  } catch {
    return "";
  }
}

export function saveDraft(text: string): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEYS.draft, text);
  } catch {
    /* ignorado */
  }
}

export function loadHistory(): HistoryItem[] {
  const stored = read<HistoryItem[]>(STORAGE_KEYS.history);
  if (!Array.isArray(stored)) return [];

  // Igual que las preferencias: normalizamos lo que venga de versiones viejas.
  return stored
    .filter((item) => item && typeof item.input === "string" && typeof item.output === "string")
    .map((item) => ({
      ...item,
      tone: isTone(item.tone) ? item.tone : DEFAULT_PREFS.tone,
      textType: isTextType(item.textType) ? item.textType : DEFAULT_PREFS.textType,
    }));
}

export function saveHistory(items: HistoryItem[]): HistoryItem[] {
  if (typeof window === "undefined") return items;

  let lista = items.slice(0, HISTORY_LIMIT);
  // Si el navegador se queda sin espacio, se sueltan los mas antiguos hasta
  // que quepa: es preferible perder lo viejo a no guardar lo nuevo.
  for (let intento = 0; intento < 8; intento += 1) {
    try {
      window.localStorage.setItem(STORAGE_KEYS.history, JSON.stringify(lista));
      return lista;
    } catch {
      if (lista.length <= 1) return lista;
      lista = lista.slice(0, Math.floor(lista.length / 2));
    }
  }
  return lista;
}

export function clearHistory(): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(STORAGE_KEYS.history);
  } catch {
    /* ignorado */
  }
}
