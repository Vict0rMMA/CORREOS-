import { falloDeNube, sinNube, supabaseServidor } from "@/lib/supabase";

/** Borra un correo guardado. Solo lo marca: se puede recuperar. */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Contexto = { params: Promise<{ id: string }> };

export async function DELETE(_request: Request, { params }: Contexto): Promise<Response> {
  const { id } = await params;
  if (!id || id.length > 80) {
    return Response.json({ error: "Correo no válido." }, { status: 400 });
  }

  const supabase = supabaseServidor();
  if (!supabase) return sinNube();

  const { error } = await supabase
    .from("guardados")
    .update({ borrado_en: new Date().toISOString() })
    .eq("id", id);

  if (error) return falloDeNube(error, "borrar el correo");
  return Response.json({ disponible: true });
}
