import type { SignatureDrawing } from "@/types";

/**
 * Firma escaneada que trae la aplicacion de serie.
 *
 * La usa una sola persona, asi que su firma viene puesta: se guarda como
 * `public/firma.png` (una foto de la firma, sobre papel, sin recortar) y al
 * abrir la aplicacion se procesa igual que si se hubiera subido a mano
 * (recorte a la tinta y fondo transparente).
 *
 * Si el archivo no existe, sencillamente no hay firma de serie.
 */
const RUTA = "/firma.png";

export async function cargarFirmaPorDefecto(): Promise<SignatureDrawing | null> {
  try {
    const respuesta = await fetch(RUTA, { cache: "force-cache" });
    if (!respuesta.ok) return null;

    const archivo = new File([await respuesta.blob()], "firma.png", { type: "image/png" });
    const { prepareSignatureImage } = await import("@/lib/images");
    return await prepareSignatureImage(archivo);
  } catch (error) {
    console.error("[paula] no se pudo cargar la firma de serie:", error);
    return null;
  }
}
