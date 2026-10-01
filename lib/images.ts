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
/** Cuanto mas oscuro que el papel tiene que ser un pixel para contar como tinta. */
const MARGEN_PAPEL = 26;
/** A partir de esta diferencia, tinta plena. */
const MARGEN_TINTA = 100;

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

  const brillo = (indice: number) =>
    0.299 * pixeles[indice] + 0.587 * pixeles[indice + 1] + 0.114 * pixeles[indice + 2];

  // El papel no siempre es blanco: se mide en los bordes y los umbrales se
  // ajustan a el, asi funciona igual con una foto de movil que con un escaneo.
  const muestras: number[] = [];
  for (let x = 0; x < width; x += 2) {
    muestras.push(brillo((0 * width + x) * 4));
    muestras.push(brillo(((height - 1) * width + x) * 4));
  }
  for (let y = 0; y < height; y += 2) {
    muestras.push(brillo((y * width) * 4));
    muestras.push(brillo((y * width + width - 1) * 4));
  }
  muestras.sort((a, b) => a - b);
  const papel = muestras[Math.floor(muestras.length / 2)] ?? 255;

  const nivelPapel = papel - MARGEN_PAPEL;
  const nivelTinta = papel - MARGEN_TINTA;

  // Limites de la tinta, para recortar el papel sobrante alrededor.
  let minX = width;
  let minY = height;
  let maxX = -1;
  let maxY = -1;

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const i = (y * width + x) * 4;
      const nivel = brillo(i);

      if (nivel >= nivelPapel) {
        pixeles[i + 3] = 0; // papel: transparente
        continue;
      }

      // Entre tinta y papel se suaviza, para que el trazo no quede dentado.
      const opacidad =
        nivel <= nivelTinta
          ? 255
          : Math.round(255 * ((nivelPapel - nivel) / (nivelPapel - nivelTinta)));
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

  // Los escaneos suelen traer la raya del papel sobre la que se firmo. El
  // documento ya dibuja la suya, asi que se quitan las filas que son una linea
  // recta de lado a lado.
  const anchoTinta = maxX - minX + 1;
  for (let y = 0; y < height; y += 1) {
    let seguidos = 0;
    let mayorSeguido = 0;
    for (let x = minX; x <= maxX; x += 1) {
      const opaco = pixeles[(y * width + x) * 4 + 3] > 40;
      seguidos = opaco ? seguidos + 1 : 0;
      if (seguidos > mayorSeguido) mayorSeguido = seguidos;
    }
    // Un trazo de firma nunca cruza casi toda la imagen en una sola fila.
    if (mayorSeguido > anchoTinta * 0.6) {
      for (let x = 0; x < width; x += 1) pixeles[(y * width + x) * 4 + 3] = 0;
    }
  }

  // Lo mismo en vertical: el borde de la hoja o la sombra del movil dejan una
  // franja oscura de arriba abajo que no es parte de la firma.
  const altoTinta = maxY - minY + 1;
  for (let x = 0; x < width; x += 1) {
    let seguidos = 0;
    let mayorSeguido = 0;
    for (let y = minY; y <= maxY; y += 1) {
      const opaco = pixeles[(y * width + x) * 4 + 3] > 40;
      seguidos = opaco ? seguidos + 1 : 0;
      if (seguidos > mayorSeguido) mayorSeguido = seguidos;
    }
    if (mayorSeguido > altoTinta * 0.75) {
      for (let y = 0; y < height; y += 1) pixeles[(y * width + x) * 4 + 3] = 0;
    }
  }

  // Tras quitar las rayas hay que recalcular hasta donde llega la tinta.
  minX = width;
  minY = height;
  maxX = -1;
  maxY = -1;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      if (pixeles[(y * width + x) * 4 + 3] > 40) {
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
