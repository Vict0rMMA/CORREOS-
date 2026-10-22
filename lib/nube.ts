import type { HistoryItem, SheetDoc, SheetTemplateId } from "@/types";

/**
 * Lo que el navegador le pide a la nube, siempre a traves de /api.
 *
 * Todo devuelve `null` si la nube no esta disponible (sin configurar, sin
 * internet, o el proyecto gratuito de Supabase en pausa): la aplicacion sigue
 * funcionando con lo que tiene en el navegador y no se cae nada.
 */

export interface PlanillaResumen {
  id: string;
  plantilla: SheetTemplateId;
  titulo: string;
  fecha: string;
  turno: string;
  /** El campo "Crew chief" (en la base se llama supervisor). */
  crewChief: string;
  creadaEn: string;
  actualizadaEn: string;
  traducida: boolean;
}

export interface PlanillaGuardada {
  id: string;
  entrada: SheetDoc;
  salida: SheetDoc | null;
  creadaEn?: string;
  actualizadaEn: string;
}

async function pedir<T>(ruta: string, opciones?: RequestInit): Promise<T | null> {
  try {
    const respuesta = await fetch(ruta, {
      ...opciones,
      headers: { "Content-Type": "application/json", ...(opciones?.headers ?? {}) },
      cache: "no-store",
    });
    if (!respuesta.ok) return null;
    const datos = (await respuesta.json()) as T & { disponible?: boolean };
    return datos.disponible === false ? null : datos;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Planillas
// ---------------------------------------------------------------------------

export async function listarPlanillas(): Promise<PlanillaResumen[] | null> {
  const datos = await pedir<{ planillas: PlanillaResumen[] }>("/api/planillas");
  return datos?.planillas ?? null;
}

export async function abrirPlanilla(id: string): Promise<PlanillaGuardada | null> {
  return pedir<PlanillaGuardada>(`/api/planillas/${id}`);
}

/** Guarda la planilla. Devuelve la hora a la que quedo guardada, o null. */
export async function guardarPlanilla(
  id: string,
  entrada: SheetDoc,
  salida: SheetDoc | null,
): Promise<string | null> {
  const datos = await pedir<{ guardadaEn: string }>(`/api/planillas/${id}`, {
    method: "PUT",
    body: JSON.stringify({ entrada, salida }),
  });
  return datos?.guardadaEn ?? null;
}

export async function borrarPlanilla(id: string): Promise<boolean> {
  return (await pedir(`/api/planillas/${id}`, { method: "DELETE" })) !== null;
}

// ---------------------------------------------------------------------------
// Correos guardados
// ---------------------------------------------------------------------------

export async function listarGuardados(): Promise<HistoryItem[] | null> {
  const datos = await pedir<{ guardados: HistoryItem[] }>("/api/guardados");
  return datos?.guardados ?? null;
}

export async function subirGuardados(items: HistoryItem[]): Promise<boolean> {
  if (items.length === 0) return true;
  return (
    (await pedir("/api/guardados", { method: "POST", body: JSON.stringify({ items }) })) !== null
  );
}

export async function borrarGuardado(id: string): Promise<boolean> {
  return (
    (await pedir(`/api/guardados/${encodeURIComponent(id)}`, { method: "DELETE" })) !== null
  );
}

export async function borrarTodosLosGuardados(): Promise<boolean> {
  return (await pedir("/api/guardados", { method: "DELETE" })) !== null;
}

/** Un identificador nuevo para una planilla. */
export function nuevoId(): string {
  // randomUUID solo existe en paginas seguras (https o localhost): abriendo
  // la aplicacion en el celular por la red de la casa, no estaria.
  if (typeof crypto.randomUUID === "function") return crypto.randomUUID();
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = [...bytes].map((byte) => byte.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
