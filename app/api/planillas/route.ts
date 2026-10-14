import { falloDeNube, sinNube, supabaseServidor } from "@/lib/supabase";

/**
 * La lista de planillas guardadas, de la mas reciente a la mas antigua.
 * Solo los datos para la lista: la planilla entera se pide al abrirla.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Cuantas se ensenan en la lista. */
const LIMITE = 60;

export async function GET(): Promise<Response> {
  const supabase = supabaseServidor();
  if (!supabase) return sinNube();

  const { data, error } = await supabase
    .from("planillas")
    .select("id, plantilla, titulo, fecha, turno, actualizada_en, salida")
    .is("borrado_en", null)
    .order("actualizada_en", { ascending: false })
    .limit(LIMITE);

  if (error) return falloDeNube(error, "leer las planillas");

  return Response.json({
    disponible: true,
    planillas: (data ?? []).map((fila) => ({
      id: fila.id,
      plantilla: fila.plantilla,
      titulo: fila.titulo,
      fecha: fila.fecha,
      turno: fila.turno,
      actualizadaEn: fila.actualizada_en,
      traducida: fila.salida !== null,
    })),
  });
}
