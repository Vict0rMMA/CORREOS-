/**
 * Preparacion del audio dictado.
 *
 * El navegador graba en WebM/Opus, que la API de IA no acepta. Aqui lo
 * decodificamos, lo pasamos a mono 16 kHz, le igualamos el volumen y lo
 * guardamos como WAV, que si es un formato aceptado.
 *
 * Igualar el volumen importa de verdad: con la voz lejos del microfono la
 * transcripcion se come letras y palabras cortas (medido: una placa "AX4471"
 * se transcribia "X4471" y al normalizar volvia a salir completa).
 */

const TARGET_SAMPLE_RATE = 16000;

/** Nivel medio al que llevamos la voz. */
const TARGET_RMS = 0.12;
/** Tope de amplificacion: mas alla solo se amplifica el ruido. */
const MAX_GAIN = 14;
/** Margen para no saturar. */
const PEAK_CEILING = 0.97;

/** Por debajo de esto consideramos que no hay voz. */
const SILENCE_LEVEL = 0.012;

/**
 * Duracion maxima de un segmento, en segundos.
 *
 * El dictado no tiene limite: se parte en segmentos que se transcriben sobre
 * la marcha. Cada uno debe caber en una peticion (Vercel corta en 4,5 MB y un
 * WAV mono de 16 kHz ocupa 32 KB por segundo, asi que 90 s son unos 2,9 MB).
 */
export const SEGMENT_MAX_SECONDS = 90;

/** Silencio que da por terminada una frase y cierra el segmento. */
export const SILENCE_SPLIT_MS = 1100;

/** Un segmento no se corta antes de esto, para no trocear de mas. */
export const MIN_SEGMENT_SECONDS = 5;

/** Tamano maximo que aceptamos subir (por debajo del limite de Vercel). */
export const MAX_UPLOAD_BYTES = 4 * 1024 * 1024;

/** Formato de grabacion soportado por este navegador. */
export function pickRecordingMimeType(): string | undefined {
  if (typeof MediaRecorder === "undefined") return undefined;
  const candidates = [
    "audio/webm;codecs=opus",
    "audio/webm",
    "audio/ogg;codecs=opus",
    "audio/mp4",
  ];
  return candidates.find((type) => MediaRecorder.isTypeSupported(type));
}

export function isRecordingSupported(): boolean {
  return (
    typeof navigator !== "undefined" &&
    typeof navigator.mediaDevices?.getUserMedia === "function" &&
    typeof MediaRecorder !== "undefined" &&
    pickRecordingMimeType() !== undefined
  );
}

/** Quita el silencio del principio y del final, dejando un respiro. */
function trimSilence(samples: Float32Array, sampleRate: number): Float32Array {
  const padding = Math.round(sampleRate * 0.15);
  let first = 0;
  let last = samples.length - 1;

  while (first < samples.length && Math.abs(samples[first]) < SILENCE_LEVEL) first += 1;
  while (last > first && Math.abs(samples[last]) < SILENCE_LEVEL) last -= 1;
  if (first >= last) return samples;

  return samples.slice(Math.max(0, first - padding), Math.min(samples.length, last + padding));
}

/** Lleva la voz a un volumen constante, sin saturar ni inflar el ruido. */
function normalize(samples: Float32Array): Float32Array {
  let peak = 0;
  let sumSquares = 0;
  let active = 0;

  for (const value of samples) {
    const magnitude = Math.abs(value);
    if (magnitude > peak) peak = magnitude;
    // La media se calcula solo sobre lo que suena: los silencios la falsean.
    if (magnitude > SILENCE_LEVEL) {
      sumSquares += value * value;
      active += 1;
    }
  }

  if (active === 0 || peak === 0) return samples;

  const rms = Math.sqrt(sumSquares / active);
  const gain = Math.min(TARGET_RMS / rms, MAX_GAIN, PEAK_CEILING / peak);
  if (gain <= 1.02) return samples;

  const output = new Float32Array(samples.length);
  for (let index = 0; index < samples.length; index += 1) {
    output[index] = Math.max(-1, Math.min(1, samples[index] * gain));
  }
  return output;
}

/** Convierte la grabacion en un WAV mono de 16 kHz, recortado y nivelado. */
export async function toWav(blob: Blob): Promise<Blob> {
  const buffer = await blob.arrayBuffer();

  const AudioContextClass =
    window.AudioContext ??
    (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AudioContextClass) throw new Error("Este navegador no puede procesar el audio");

  const decodeContext = new AudioContextClass();
  let decoded: AudioBuffer;
  try {
    decoded = await decodeContext.decodeAudioData(buffer.slice(0));
  } finally {
    void decodeContext.close();
  }

  // Remuestreo a 16 kHz mono con un contexto offline.
  const frames = Math.ceil(decoded.duration * TARGET_SAMPLE_RATE);
  const offline = new OfflineAudioContext(1, Math.max(frames, 1), TARGET_SAMPLE_RATE);
  const source = offline.createBufferSource();
  source.buffer = decoded;
  source.connect(offline.destination);
  source.start(0);
  const rendered = await offline.startRendering();

  const prepared = normalize(trimSilence(rendered.getChannelData(0), TARGET_SAMPLE_RATE));
  return encodeWav(prepared, TARGET_SAMPLE_RATE);
}

/** PCM de 16 bits en un contenedor WAV. */
function encodeWav(samples: Float32Array, sampleRate: number): Blob {
  const bytes = new ArrayBuffer(44 + samples.length * 2);
  const view = new DataView(bytes);

  const writeText = (offset: number, text: string) => {
    for (let index = 0; index < text.length; index += 1) {
      view.setUint8(offset + index, text.charCodeAt(index));
    }
  };

  writeText(0, "RIFF");
  view.setUint32(4, 36 + samples.length * 2, true);
  writeText(8, "WAVE");
  writeText(12, "fmt ");
  view.setUint32(16, 16, true); // tamano del bloque fmt
  view.setUint16(20, 1, true); // PCM
  view.setUint16(22, 1, true); // mono
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true); // bytes por segundo
  view.setUint16(32, 2, true); // alineacion de bloque
  view.setUint16(34, 16, true); // bits por muestra
  writeText(36, "data");
  view.setUint32(40, samples.length * 2, true);

  let offset = 44;
  for (let index = 0; index < samples.length; index += 1) {
    const clamped = Math.max(-1, Math.min(1, samples[index]));
    view.setInt16(offset, clamped < 0 ? clamped * 0x8000 : clamped * 0x7fff, true);
    offset += 2;
  }

  return new Blob([bytes], { type: "audio/wav" });
}
