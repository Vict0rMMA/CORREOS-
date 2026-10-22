import { falloDeNube, sinNube, supabaseServidor } from "@/lib/supabase";

/**
 * La lista de planillas guardadas, de la mas reciente a la mas antigua.
 * Solo los datos para la lista: la planilla entera se pide al abrirla.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Cuantas se ensenan en la lista. */
const LIMITE = 200;

/** Cuantas borradas se avisan. */
const LIMITE_BORRADAS = 500;

export async function GET(): Promise<Response> {
  const supabase = supabaseServidor();
  if (!supabase) return sinNube();

  const { data, error } = await supabase
    .from("planillas")
    .select("id, plantilla, titulo, fecha, turno, supervisor, creada_en, actualizada_en, salida")
    .is("borrado_en", null)
    .order("actualizada_en", { ascending: false })
    .limit(LIMITE);

  if (error) return falloDeNube(error, "leer las planillas");

  // Las borradas desde otro equipo: el navegador las quita de su copia en
  // vez de volver a subirlas.
  const { data: borradas } = await supabase
    .from("planillas")
    .select("id")
    .not("borrado_en", "is", null)
    .order("borrado_en", { ascending: false })
    .limit(LIMITE_BORRADAS);

  return Response.json({
    disponible: true,
    planillas: (data ?? []).map((fila) => ({
      id: fila.id,
      plantilla: fila.plantilla,
      titulo: fila.titulo,
      fecha: fila.fecha,
      turno: fila.turno,
      crewChief: fila.supervisor,
      creadaEn: fila.creada_en,
      actualizadaEn: fila.actualizada_en,
      traducida: fila.salida !== null,
    })),
    borradas: (borradas ?? []).map((fila) => fila.id),
  });
}
