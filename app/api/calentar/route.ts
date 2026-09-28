import { AI_MODEL } from "@/lib/ai";

export const runtime = "nodejs";

/**
 * Despierta la funcion antes de que haga falta.
 *
 * En Vercel cada ruta se apaga cuando no se usa, y la primera peticion
 * despues de un rato paga el arranque: cargar Node, el codigo y la libreria
 * de la IA. Como la pagina llama aqui nada mas abrirse, cuando la persona
 * pulsa un boton la funcion ya esta caliente.
 *
 * Importar AI_MODEL obliga a cargar tambien lib/ai, que es lo que mas tarda.
 */
export function GET(): Response {
  return Response.json(
    { listo: true, modelo: AI_MODEL },
    { headers: { "Cache-Control": "no-store" } },
  );
}
