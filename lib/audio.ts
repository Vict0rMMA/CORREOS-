/**
 * Preparacion del audio dictado.
 *
 * El navegador graba en WebM/Opus, que la API de IA no acepta. Aqui lo
 * decodificamos, lo pasamos a mono 16 kHz (voz limpia y archivo pequeno) y lo
 * guardamos como WAV, que si es un formato aceptado.
 */

const TARGET_SAMPLE_RATE = 16000;

/** Duracion maxima de una grabacion, en segundos. */
export const MAX_RECORDING_SECONDS = 180;

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

/** Convierte la grabacion en un WAV mono de 16 kHz. */
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

  return encodeWav(rendered.getChannelData(0), TARGET_SAMPLE_RATE);
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
