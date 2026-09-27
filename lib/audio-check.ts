/**
 * Analisis del audio recibido, en el servidor.
 *
 * Un modelo de IA al que se le da silencio tiende a "rellenarlo" con frases
 * inventadas. Como la regla de la aplicacion es no inventar nada, medimos la
 * senal antes de enviarla: si no hay voz audible, no se llama a la IA.
 */

export interface AudioLevels {
  /** Amplitud maxima, de 0 a 1. */
  peak: number;
  /** Nivel medio (RMS), de 0 a 1. */
  rms: number;
  /** Proporcion de muestras con senal audible. */
  activeRatio: number;
}

/** Umbrales por debajo de los cuales damos el audio por vacio. */
const PEAK_FLOOR = 0.02;
const RMS_FLOOR = 0.004;
const ACTIVE_FLOOR = 0.01;

/** Localiza el bloque `data` de un WAV PCM. */
function findDataChunk(view: DataView): { offset: number; length: number } | null {
  if (view.byteLength < 12) return null;
  const tag = (offset: number) =>
    String.fromCharCode(
      view.getUint8(offset),
      view.getUint8(offset + 1),
      view.getUint8(offset + 2),
      view.getUint8(offset + 3),
    );

  if (tag(0) !== "RIFF" || tag(8) !== "WAVE") return null;

  let offset = 12;
  while (offset + 8 <= view.byteLength) {
    const id = tag(offset);
    const size = view.getUint32(offset + 4, true);
    if (id === "data") {
      return { offset: offset + 8, length: Math.min(size, view.byteLength - offset - 8) };
    }
    offset += 8 + size + (size % 2);
  }
  return null;
}

/** Mide el nivel de un WAV PCM de 16 bits. */
export function measureWav(buffer: ArrayBuffer): AudioLevels | null {
  const view = new DataView(buffer);
  const data = findDataChunk(view);
  if (!data || data.length < 2) return null;

  const samples = Math.floor(data.length / 2);
  let peak = 0;
  let sumSquares = 0;
  let active = 0;

  for (let index = 0; index < samples; index += 1) {
    const value = Math.abs(view.getInt16(data.offset + index * 2, true)) / 32768;
    if (value > peak) peak = value;
    sumSquares += value * value;
    if (value > 0.02) active += 1;
  }

  return {
    peak,
    rms: Math.sqrt(sumSquares / samples),
    activeRatio: active / samples,
  };
}

/** true si el audio trae senal suficiente para contener voz. */
export function hasAudibleSpeech(buffer: ArrayBuffer): boolean {
  const levels = measureWav(buffer);
  // Si no podemos medirlo (otro formato), dejamos que la IA lo intente.
  if (!levels) return true;

  return (
    levels.peak >= PEAK_FLOOR &&
    levels.rms >= RMS_FLOOR &&
    levels.activeRatio >= ACTIVE_FLOOR
  );
}
