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

/**
 * Prepara una firma escaneada para meterla en los documentos.
 *
 * Una foto o escaneo trae el papel de fondo (blanco grisaceo, a veces con
 * sombras). Aqui se recorta a la zona que tiene tinta y se vuelve
 * transparente todo lo claro, de modo que en el Word o el PDF se vea la firma
 * sola, como escrita sobre la hoja.
 */
export interface SignatureImage {
  /** PNG con fondo transparente, en data URL. */
  dataUrl: string;
  width: number;
  height: number;
}

/** Ancho maximo; de sobra para imprimir bien. */
const SIGNATURE_MAX_WIDTH = 700;
/** Por encima de este brillo se considera papel, no tinta. */
const PAPER_LEVEL = 205;
/** Por debajo de este, tinta segura. */
const INK_LEVEL = 120;

export async function prepareSignatureImage(file: File): Promise<SignatureImage> {
  if (!isSupportedImage(file)) throw new Error(`"${file.name}" no es una imagen`);
  if (file.size > MAX_FILE_BYTES) throw new Error("La imagen de la firma pesa demasiado");

  const source = await decode(file);
  const sourceWidth = "width" in source ? source.width : 0;
  const sourceHeight = "height" in source ? source.height : 0;
  if (!sourceWidth || !sourceHeight) throw new Error("No pudimos leer la imagen");

  const scale = Math.min(1, SIGNATURE_MAX_WIDTH / sourceWidth);
  const width = Math.max(1, Math.round(sourceWidth * scale));
  const height = Math.max(1, Math.round(sourceHeight * scale));

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) throw new Error("El navegador no pudo procesar la imagen");

  context.drawImage(source as CanvasImageSource, 0, 0, width, height);
  if ("close" in source) source.close();

  const imagen = context.getImageData(0, 0, width, height);
  const pixeles = imagen.data;

  // Limites de la tinta, para recortar el papel sobrante alrededor.
  let minX = width;
  let minY = height;
  let maxX = -1;
  let maxY = -1;

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const i = (y * width + x) * 4;
      const brillo = 0.299 * pixeles[i] + 0.587 * pixeles[i + 1] + 0.114 * pixeles[i + 2];

      if (brillo >= PAPER_LEVEL) {
        pixeles[i + 3] = 0; // papel: transparente
        continue;
      }

      // Entre tinta y papel se suaviza, para que el trazo no quede dentado.
      const opacidad =
        brillo <= INK_LEVEL
          ? 255
          : Math.round(255 * ((PAPER_LEVEL - brillo) / (PAPER_LEVEL - INK_LEVEL)));
      pixeles[i + 3] = Math.min(pixeles[i + 3], opacidad);

      if (opacidad > 40) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }

  if (maxX < 0) throw new Error("No encontramos ninguna firma en esa imagen");

  context.putImageData(imagen, 0, 0);

  // Recorte con un pequeno margen
  const margen = 6;
  const cropX = Math.max(0, minX - margen);
  const cropY = Math.max(0, minY - margen);
  const cropW = Math.min(width - cropX, maxX - minX + margen * 2);
  const cropH = Math.min(height - cropY, maxY - minY + margen * 2);

  const recorte = document.createElement("canvas");
  recorte.width = cropW;
  recorte.height = cropH;
  const contextoRecorte = recorte.getContext("2d");
  if (!contextoRecorte) throw new Error("El navegador no pudo recortar la imagen");
  contextoRecorte.drawImage(canvas, cropX, cropY, cropW, cropH, 0, 0, cropW, cropH);

  return { dataUrl: recorte.toDataURL("image/png"), width: cropW, height: cropH };
}
