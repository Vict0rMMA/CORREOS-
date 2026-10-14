import { isAction, isTextType, isTone } from "@/lib/actions";
import { HISTORY_LIMIT } from "@/lib/config";
import { falloDeNube, sinNube, supabaseServidor } from "@/lib/supabase";
import type { HistoryItem } from "@/types";

/**
 * Los correos guardados, en la nube.
 *
 * Hasta ahora vivian solo en el navegador de Paula: si se limpiaba, se
 * perdian. Aqui se leen, se suben (tambien los que ya estaban en el
 * navegador) y se borran. Borrar solo los marca.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Tope de largo de un texto guardado. */
const MAX_TEXTO = 20_000;

interface Fila {
  id: string;
  creado_en: string;
  entrada: string;
  resultado: string;
  asunto: string | null;
  idioma: "es" | "en";
  accion: string;
  tipo: string;
  tono: string;
}

/** Comprueba que lo que llega tiene forma de correo guardado. */
function esGuardado(valor: unknown): valor is HistoryItem {
  if (typeof valor !== "object" || valor === null) return false;
  const item = valor as Record<string, unknown>;
  return (
    typeof item.id === "string" &&
    item.id.length > 0 &&
    item.id.length <= 80 &&
    typeof item.input === "string" &&
    item.input.length <= MAX_TEXTO &&
    typeof item.output === "string" &&
    item.output.length <= MAX_TEXTO &&
    (item.subject === undefined || (typeof item.subject === "string" && item.subject.length <= 300)) &&
    (item.lang === "es" || item.lang === "en") &&
    isAction(item.action) &&
    isTextType(item.textType) &&
    isTone(item.tone) &&
    typeof item.createdAt === "number" &&
    Number.isFinite(item.createdAt)
  );
}

function aFila(item: HistoryItem): Omit<Fila, "creado_en"> & { creado_en: string; borrado_en: null } {
  return {
    id: item.id,
    creado_en: new Date(item.createdAt).toISOString(),
    entrada: item.input,
    resultado: item.output,
    asunto: item.subject?.trim() ? item.subject : null,
    idioma: item.lang,
    accion: item.action,
    tipo: item.textType,
    tono: item.tone,
    borrado_en: null,
  };
}

function aGuardado(fila: Fila): HistoryItem {
  return {
    id: fila.id,
    preview: fila.entrada.slice(0, 90),
    input: fila.entrada,
    output: fila.resultado,
    subject: fila.asunto ?? undefined,
    lang: fila.idioma,
    action: fila.accion as HistoryItem["action"],
    textType: fila.tipo as HistoryItem["textType"],
    tone: fila.tono as HistoryItem["tone"],
    createdAt: new Date(fila.creado_en).getTime(),
  };
}

export async function GET(): Promise<Response> {
  const supabase = supabaseServidor();
  if (!supabase) return sinNube();

  const { data, error } = await supabase
    .from("guardados")
    .select("id, creado_en, entrada, resultado, asunto, idioma, accion, tipo, tono")
    .is("borrado_en", null)
    .order("creado_en", { ascending: false })
    .limit(HISTORY_LIMIT);

  if (error) return falloDeNube(error, "leer los guardados");
  return Response.json({
    disponible: true,
    guardados: ((data ?? []) as Fila[]).map(aGuardado),
  });
}

/** Sube uno o varios correos. Si ya estaban, no se duplican. */
export async function POST(request: Request): Promise<Response> {
  const supabase = supabaseServidor();
  if (!supabase) return sinNube();

  let cuerpo: { items?: unknown };
  try {
    cuerpo = await request.json();
  } catch {
    return Response.json({ error: "Petición inválida." }, { status: 400 });
  }

  const items = Array.isArray(cuerpo.items) ? cuerpo.items : [];
  if (items.length === 0 || items.length > HISTORY_LIMIT) {
    return Response.json({ error: "No hay nada que guardar." }, { status: 400 });
  }

  // Lo que viene de versiones viejas del navegador puede traer algun correo
  // con otra forma: se suben los buenos y ese se salta, en vez de rechazar
  // la subida entera.
  const validos = items.filter(esGuardado);
  if (validos.length === 0) {
    return Response.json({ error: "Ningún correo tiene la forma esperada." }, { status: 400 });
  }

  const { error } = await supabase
    .from("guardados")
    .upsert(validos.map(aFila), { onConflict: "id" });

  if (error) return falloDeNube(error, "guardar los correos");
  return Response.json({
    disponible: true,
    guardados: validos.length,
    descartados: items.length - validos.length,
  });
}

/** "Borrar todo": se marcan todos, no se pierde nada de verdad. */
export async function DELETE(): Promise<Response> {
  const supabase = supabaseServidor();
  if (!supabase) return sinNube();

  const { error } = await supabase
    .from("guardados")
    .update({ borrado_en: new Date().toISOString() })
    .is("borrado_en", null);

  if (error) return falloDeNube(error, "borrar los guardados");
  return Response.json({ disponible: true });
}
