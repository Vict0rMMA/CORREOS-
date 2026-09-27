import { HISTORY_LIMIT, STORAGE_KEYS } from "@/lib/config";
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
  signature: "",
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
  return { ...DEFAULT_PREFS, ...(stored ?? {}) };
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
  return Array.isArray(stored) ? stored : [];
}

export function saveHistory(items: HistoryItem[]): void {
  write(STORAGE_KEYS.history, items.slice(0, HISTORY_LIMIT));
}

export function clearHistory(): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(STORAGE_KEYS.history);
  } catch {
    /* ignorado */
  }
}
