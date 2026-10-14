import { type SupabaseClient, createClient } from "@supabase/supabase-js";

/**
 * Conexion con Supabase. Solo se usa en el servidor.
 *
 * La aplicacion no tiene inicio de sesion, asi que el navegador no habla con
 * la base: lo hacen las rutas de /api con la clave SECRETA, que nunca sale
 * del servidor (por eso las variables no llevan el prefijo NEXT_PUBLIC_, que
 * es el que Next manda al navegador).
 *
 * Sin las variables, la aplicacion sigue funcionando como antes: las rutas
 * contestan que la nube no esta disponible y todo se queda en el navegador.
 */

if (typeof window !== "undefined") {
  // Una clave secreta en el navegador seria entregarle la base a cualquiera.
  throw new Error("lib/supabase solo se puede usar en el servidor");
}

let cliente: SupabaseClient | null = null;

function configuracion(): { url: string; clave: string } | null {
  const url = process.env.SUPABASE_URL?.trim();
  const clave = process.env.SUPABASE_SECRET_KEY?.trim();
  if (!url || !clave) return null;
  return { url, clave };
}

/** true si estan puestas la direccion y la clave secreta. */
export function nubeConfigurada(): boolean {
  return configuracion() !== null;
}

/** El cliente con la clave secreta, o null si falta configurarlo. */
export function supabaseServidor(): SupabaseClient | null {
  const datos = configuracion();
  if (!datos) return null;
  if (!cliente) {
    cliente = createClient(datos.url, datos.clave, {
      // En el servidor no hay sesion que guardar ni que renovar.
      auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false,
      },
    });
  }
  return cliente;
}

/** Respuesta comun cuando la nube no esta configurada o no responde. */
export function sinNube(motivo = "La nube no está configurada."): Response {
  return Response.json({ disponible: false, error: motivo }, { status: 503 });
}

/** Traduce un fallo de Supabase sin filtrar detalles al navegador. */
export function falloDeNube(error: unknown, accion: string): Response {
  console.error(`[paula] Supabase no pudo ${accion}:`, error);
  // Un proyecto gratuito se pausa tras una semana sin uso: se avisa claro.
  return Response.json(
    {
      disponible: false,
      error: "No pudimos guardar en la nube. Lo guardado sigue en este equipo.",
    },
    { status: 503 },
  );
}
