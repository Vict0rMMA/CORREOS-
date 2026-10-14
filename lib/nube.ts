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
  actualizadaEn: string;
  traducida: boolean;
}

export interface PlanillaGuardada {
  id: string;
  entrada: SheetDoc;
  salida: SheetDoc | null;
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
  return crypto.randomUUID();
}
