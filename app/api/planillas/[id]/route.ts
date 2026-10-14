import { esPlanillaValida } from "@/lib/planilla";
import { falloDeNube, sinNube, supabaseServidor } from "@/lib/supabase";

/**
 * Una planilla guardada: abrirla, guardarla (se crea si no existe) y
 * borrarla. Borrar solo la marca: se puede recuperar desde Supabase.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Contexto = { params: Promise<{ id: string }> };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Tope de lo que se acepta guardar: una planilla real ocupa unos pocos KB. */
const MAX_BYTES = 1_500_000;

function idValido(id: string): boolean {
  return UUID.test(id);
}

export async function GET(_request: Request, { params }: Contexto): Promise<Response> {
  const { id } = await params;
  if (!idValido(id)) return Response.json({ error: "Planilla no válida." }, { status: 400 });

  const supabase = supabaseServidor();
  if (!supabase) return sinNube();

  const { data, error } = await supabase
    .from("planillas")
    .select("id, entrada, salida, actualizada_en")
    .eq("id", id)
    .is("borrado_en", null)
    .maybeSingle();

  if (error) return falloDeNube(error, "abrir la planilla");
  if (!data) return Response.json({ error: "Esa planilla ya no existe." }, { status: 404 });

  return Response.json({
    disponible: true,
    id: data.id,
    entrada: data.entrada,
    salida: data.salida,
    actualizadaEn: data.actualizada_en,
  });
}

export async function PUT(request: Request, { params }: Contexto): Promise<Response> {
  const { id } = await params;
  if (!idValido(id)) return Response.json({ error: "Planilla no válida." }, { status: 400 });

  const supabase = supabaseServidor();
  if (!supabase) return sinNube();

  const texto = await request.text();
  if (texto.length > MAX_BYTES) {
    return Response.json({ error: "La planilla es demasiado grande." }, { status: 413 });
  }

  let cuerpo: { entrada?: unknown; salida?: unknown };
  try {
    cuerpo = JSON.parse(texto);
  } catch {
    return Response.json({ error: "Petición inválida." }, { status: 400 });
  }

  if (!esPlanillaValida(cuerpo.entrada)) {
    return Response.json({ error: "La planilla no tiene la forma esperada." }, { status: 400 });
  }
  const salida = cuerpo.salida ?? null;
  if (salida !== null && !esPlanillaValida(salida)) {
    return Response.json({ error: "El resultado no tiene la forma esperada." }, { status: 400 });
  }

  const entrada = cuerpo.entrada;
  const ahora = new Date().toISOString();

  const { error } = await supabase.from("planillas").upsert(
    {
      id,
      plantilla: entrada.template,
      titulo: entrada.title,
      fecha: entrada.meta.date,
      turno: entrada.meta.shift,
      supervisor: entrada.meta.supervisor,
      entrada,
      salida,
      actualizada_en: ahora,
      borrado_en: null,
    },
    { onConflict: "id" },
  );

  if (error) return falloDeNube(error, "guardar la planilla");
  return Response.json({ disponible: true, guardadaEn: ahora });
}

export async function DELETE(_request: Request, { params }: Contexto): Promise<Response> {
  const { id } = await params;
  if (!idValido(id)) return Response.json({ error: "Planilla no válida." }, { status: 400 });

  const supabase = supabaseServidor();
  if (!supabase) return sinNube();

  const { error } = await supabase
    .from("planillas")
    .update({ borrado_en: new Date().toISOString() })
    .eq("id", id);

  if (error) return falloDeNube(error, "borrar la planilla");
  return Response.json({ disponible: true });
}
