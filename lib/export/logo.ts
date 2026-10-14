/**
 * Logo de American Airlines para los documentos.
 *
 * Se lee una sola vez y se guarda en memoria: el mismo archivo sirve para el
 * Excel, el Word, el PDF y la impresion. Si no se puede leer, los documentos
 * salen igual pero sin logo (nunca se rompe la descarga por esto).
 */

export const LOGO_PATH = "/logo-american-airlines.png";

export interface Logo {
  /** PNG en data URL, para el PDF y la impresion. */
  dataUrl: string;
  /** Solo el base64, que es lo que piden Excel y Word. */
  base64: string;
  width: number;
  height: number;
}

let cache: Promise<Logo | null> | null = null;

async function leer(): Promise<Logo | null> {
  const respuesta = await fetch(LOGO_PATH, { cache: "force-cache" });
  if (!respuesta.ok) throw new Error(`logo ${respuesta.status}`);
  const blob = await respuesta.blob();

  const dataUrl = await new Promise<string>((listo, falla) => {
    const lector = new FileReader();
    lector.onload = () => listo(String(lector.result));
    lector.onerror = () => falla(new Error("no se pudo leer el logo"));
    lector.readAsDataURL(blob);
  });

  const medidas = await new Promise<{ width: number; height: number }>((listo, falla) => {
    const imagen = new Image();
    imagen.onload = () => listo({ width: imagen.naturalWidth, height: imagen.naturalHeight });
    imagen.onerror = () => falla(new Error("no se pudo medir el logo"));
    imagen.src = dataUrl;
  });

  return {
    dataUrl,
    base64: dataUrl.slice(dataUrl.indexOf(",") + 1),
    ...medidas,
  };
}

/** Devuelve el logo, o null si no esta disponible. */
export function cargarLogo(): Promise<Logo | null> {
  if (!cache) {
    cache = leer().catch((error) => {
      console.error("[paula] no se pudo cargar el logo:", error);
      // Se olvida el fallo para poder reintentarlo en la siguiente descarga.
      cache = null;
      return null;
    });
  }
  return cache;
}

/** Alto en pixeles del logo en los documentos, y el ancho que le corresponde. */
export function medidaLogo(logo: Logo, alto: number): { width: number; height: number } {
  return { width: Math.round((logo.width / logo.height) * alto), height: alto };
}
