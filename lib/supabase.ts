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

/**
 * Busca una variable por como termina su nombre: la integracion de Vercel con
 * Supabase deja ponerles un prefijo (CORREOS_SUPABASE_URL, STORAGE_...), y
 * asi vale cualquiera. Las NEXT_PUBLIC_ solo sirven para la direccion, que no
 * es secreta; una clave con ese prefijo se ignora.
 */
function variable(terminaciones: string[], publicaVale: boolean): string | undefined {
  for (const terminacion of terminaciones) {
    const exacta = process.env[terminacion]?.trim();
    if (exacta) return exacta;
  }
  for (const [nombre, valor] of Object.entries(process.env)) {
    if (!valor?.trim()) continue;
    if (!publicaVale && nombre.startsWith("NEXT_PUBLIC_")) continue;
    if (terminaciones.some((terminacion) => nombre.endsWith(`_${terminacion}`))) {
      return valor.trim();
    }
  }
  return undefined;
}

/**
 * La direccion y la clave del servidor.
 *
 * Se aceptan tambien los nombres que pone la integracion de Vercel con
 * Supabase (el proyecto se creo desde Vercel): asi la version publicada
 * funciona sin anadir nada a mano.
 */
function leerVariables(): { url?: string; clave?: string } {
  return {
    url: variable(["SUPABASE_URL"], true),
    clave: variable(["SUPABASE_SECRET_KEY", "SUPABASE_SERVICE_ROLE_KEY"], false),
  };
}

function configuracion(): { url: string; clave: string } | null {
  const { url, clave } = leerVariables();
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
export function sinNube(motivo = motivoSinNube()): Response {
  return Response.json({ disponible: false, error: motivo }, { status: 503 });
}

/** Que falta, por su nombre (nunca su valor), para saber que poner en Vercel. */
function motivoSinNube(): string {
  const { url, clave } = leerVariables();
  if (!url && !clave) return "La nube no está configurada: faltan SUPABASE_URL y SUPABASE_SECRET_KEY.";
  if (!url) return "La nube no está configurada: falta SUPABASE_URL.";
  if (!clave) return "La nube no está configurada: falta SUPABASE_SECRET_KEY.";
  return "La nube no está configurada.";
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
