import type { ReportImage } from "@/types";

/**
 * Preparacion de fotos para los reportes.
 *
 * Todo se normaliza a JPEG con un ancho maximo: asi el mismo dato sirve para
 * Word, PDF e impresion, pesa poco y se respeta la orientacion de la camara
 * (las fotos de movil vienen giradas por EXIF).
 */

/** Ancho maximo en pixeles; suficiente para imprimir sin inflar el archivo. */
const MAX_WIDTH = 1600;
const JPEG_QUALITY = 0.85;

/** Limites de seguridad para no bloquear el navegador. */
export const MAX_IMAGES = 8;
export const MAX_FILE_BYTES = 12 * 1024 * 1024;

export const ACCEPTED_TYPES = "image/png,image/jpeg,image/webp,image/gif,image/bmp";

export function isSupportedImage(file: File): boolean {
  return file.type.startsWith("image/");
}

/** Carga el archivo respetando la orientacion EXIF. */
async function decode(file: File): Promise<ImageBitmap | HTMLImageElement> {
  if (typeof createImageBitmap === "function") {
    try {
      return await createImageBitmap(file, { imageOrientation: "from-image" });
    } catch (error) {
      console.error("[paula] createImageBitmap fallo, uso <img>:", error);
    }
  }

  const url = URL.createObjectURL(file);
  try {
    return await new Promise<HTMLImageElement>((resolve, reject) => {
      const image = new Image();
      image.onload = () => resolve(image);
      image.onerror = () => reject(new Error("No se pudo leer la imagen"));
      image.src = url;
    });
  } finally {
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
}

/** Convierte un archivo en una foto lista para adjuntar. */
export async function prepareImage(file: File): Promise<ReportImage> {
  if (!isSupportedImage(file)) {
    throw new Error(`"${file.name}" no es una imagen`);
  }
  if (file.size > MAX_FILE_BYTES) {
    throw new Error(`"${file.name}" pesa demasiado`);
  }

  const source = await decode(file);
  const sourceWidth = "width" in source ? source.width : 0;
  const sourceHeight = "height" in source ? source.height : 0;
  if (!sourceWidth || !sourceHeight) {
    throw new Error(`No pudimos leer "${file.name}"`);
  }

  const scale = Math.min(1, MAX_WIDTH / sourceWidth);
  const width = Math.round(sourceWidth * scale);
  const height = Math.round(sourceHeight * scale);

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("El navegador no pudo procesar la imagen");

  // Fondo blanco: los PNG con transparencia quedan bien en Word y PDF.
  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, width, height);
  context.drawImage(source as CanvasImageSource, 0, 0, width, height);
  if ("close" in source) source.close();

  return {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    name: file.name,
    dataUrl: canvas.toDataURL("image/jpeg", JPEG_QUALITY),
    width,
    height,
    caption: "",
  };
}

/** Bytes crudos de un data URL, para incrustar en el .docx. */
export function dataUrlToBytes(dataUrl: string): Uint8Array {
  const base64 = dataUrl.slice(dataUrl.indexOf(",") + 1);
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}

/** Ajusta una foto a un ancho maximo conservando la proporcion. */
export function fitWidth(
  image: { width: number; height: number },
  maxWidth: number,
  maxHeight: number,
): { width: number; height: number } {
  const ratio = Math.min(maxWidth / image.width, maxHeight / image.height, 1);
  return {
    width: Math.round(image.width * ratio),
    height: Math.round(image.height * ratio),
  };
}
