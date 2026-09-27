"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  MAX_UPLOAD_BYTES,
  MIN_SEGMENT_SECONDS,
  SEGMENT_MAX_SECONDS,
  SILENCE_SPLIT_MS,
  isRecordingSupported,
  pickRecordingMimeType,
  toWav,
} from "@/lib/audio";
import type { Lang } from "@/types";

/**
 * Dictado por voz continuo.
 *
 * Graba con el microfono y transcribe en el servidor. Para que no se pierda
 * nada de lo que se dice, la grabacion se parte en segmentos **en las pausas
 * naturales**: cuando detecta silencio cierra el segmento, lo manda a
 * transcribir y sigue grabando sin interrupcion. Asi se puede hablar todo lo
 * que haga falta (no hay limite de duracion), el texto va apareciendo por el
 * camino y ningun corte cae en mitad de una palabra.
 *
 * Los segmentos se transcriben en paralelo pero se escriben en orden.
 */

export type DictationState = "idle" | "recording" | "transcribing";

export interface DictationOptions {
  lang: Lang;
  /** Recibe cada trozo transcrito, ya en orden, para anadirlo al cuadro. */
  onText: (text: string) => void;
  onError: (message: string) => void;
}

export interface Dictation {
  supported: boolean;
  state: DictationState;
  /** Segundos hablados en total. */
  seconds: number;
  /** Volumen de entrada de 0 a 1, para el indicador. */
  level: number;
  /** Segmentos que se estan transcribiendo ahora mismo. */
  pending: number;
  start: () => void;
  stop: () => void;
  cancel: () => void;
  toggle: () => void;
}

export function useDictation({ lang, onText, onError }: DictationOptions): Dictation {
  const [supported, setSupported] = useState(false);
  const [state, setState] = useState<DictationState>("idle");
  const [seconds, setSeconds] = useState(0);
  const [level, setLevel] = useState(0);
  const [pending, setPending] = useState(0);

  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const audioContextRef = useRef<AudioContext | null>(null);
  const frameRef = useRef<number | null>(null);
  const timerRef = useRef<number | null>(null);

  const cancelledRef = useRef(false);
  const listeningRef = useRef(false);
  const mimeTypeRef = useRef<string>("audio/webm");

  /** Control del corte por silencio. */
  const segmentStartRef = useRef(0);
  const silenceSinceRef = useRef<number | null>(null);
  const peakRef = useRef(0);

  /** Orden de escritura: los segmentos se emiten como se grabaron. */
  const nextIndexRef = useRef(0);
  const writeIndexRef = useRef(0);
  const bufferRef = useRef(new Map<number, string>());

  const onTextRef = useRef(onText);
  const onErrorRef = useRef(onError);
  const langRef = useRef(lang);
  useEffect(() => {
    onTextRef.current = onText;
    onErrorRef.current = onError;
    langRef.current = lang;
  }, [lang, onError, onText]);

  useEffect(() => {
    setSupported(isRecordingSupported());
  }, []);

  /** Escribe en orden: si llega antes un segmento posterior, espera su turno. */
  const emit = useCallback((index: number, text: string) => {
    bufferRef.current.set(index, text);
    while (bufferRef.current.has(writeIndexRef.current)) {
      const value = bufferRef.current.get(writeIndexRef.current) ?? "";
      bufferRef.current.delete(writeIndexRef.current);
      writeIndexRef.current += 1;
      if (value) onTextRef.current(value);
    }
  }, []);

  /** Suelta microfono, medidor y contador. */
  const release = useCallback(() => {
    if (frameRef.current !== null) cancelAnimationFrame(frameRef.current);
    frameRef.current = null;
    if (timerRef.current !== null) window.clearInterval(timerRef.current);
    timerRef.current = null;
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    void audioContextRef.current?.close();
    audioContextRef.current = null;
    recorderRef.current = null;
    setLevel(0);
  }, []);

  /** Manda un segmento a transcribir; reintenta una vez ante fallos de red. */
  const transcribeSegment = useCallback(
    async (recorded: Blob, index: number) => {
      setPending((current) => current + 1);
      try {
        const wav = await toWav(recorded);
        if (wav.size > MAX_UPLOAD_BYTES) {
          throw new Error("Ese trozo salió demasiado largo.");
        }

        const send = async () => {
          const form = new FormData();
          form.append("audio", wav, "dictado.wav");
          form.append("lang", langRef.current);
          const response = await fetch("/api/transcribe", { method: "POST", body: form });
          const data = (await response.json()) as { text?: string; error?: string };
          if (!response.ok) {
            const failure = new Error(data.error ?? "No pudimos transcribir el audio.");
            // Un 4xx no cambia al repetirlo; un 5xx suele ser pasajero.
            (failure as Error & { retriable?: boolean }).retriable = response.status >= 500;
            throw failure;
          }
          return data.text?.trim() ?? "";
        };

        let text: string;
        try {
          text = await send();
        } catch (failure) {
          const retriable =
            failure instanceof TypeError ||
            (failure as Error & { retriable?: boolean }).retriable === true;
          if (!retriable) throw failure;
          await new Promise((resolve) => setTimeout(resolve, 900));
          text = await send();
        }

        emit(index, text);
      } catch (error) {
        console.error("[paula] transcripción fallida:", error);
        // Se libera el turno para que los siguientes segmentos no se queden esperando.
        emit(index, "");
        onErrorRef.current(
          error instanceof Error && error.message
            ? error.message
            : "No pudimos transcribir el audio.",
        );
      } finally {
        setPending((current) => Math.max(0, current - 1));
      }
    },
    [emit],
  );

  /** Arranca un grabador nuevo sobre el microfono ya abierto. */
  const startSegment = useCallback(() => {
    const stream = streamRef.current;
    if (!stream) return;

    const recorder = new MediaRecorder(stream, { mimeType: mimeTypeRef.current });
    recorderRef.current = recorder;
    chunksRef.current = [];
    segmentStartRef.current = Date.now();
    silenceSinceRef.current = null;
    peakRef.current = 0;

    const index = nextIndexRef.current;
    nextIndexRef.current += 1;

    recorder.ondataavailable = (event) => {
      if (event.data.size > 0) chunksRef.current.push(event.data);
    };

    recorder.onstop = () => {
      const recorded = new Blob(chunksRef.current, { type: mimeTypeRef.current });
      chunksRef.current = [];

      const hadVoice = peakRef.current >= 0.035;

      // Trozos mudos o demasiado cortos no se envian: ante el silencio los
      // modelos tienden a inventar texto, y aqui no se inventa nada.
      if (cancelledRef.current || recorded.size < 1200 || !hadVoice) {
        emit(index, "");
      } else {
        void transcribeSegment(recorded, index);
      }

      if (listeningRef.current) startSegment();
    };

    recorder.onerror = (event) => {
      console.error("[paula] error de grabación:", event);
      emit(index, "");
    };

    recorder.start(250);
  }, [emit, transcribeSegment]);

  /** Cierra el segmento actual; el siguiente arranca solo. */
  const rotate = useCallback(() => {
    if (recorderRef.current?.state === "recording") recorderRef.current.stop();
  }, []);

  const start = useCallback(async () => {
    if (state !== "idle") return;

    const mimeType = pickRecordingMimeType();
    if (!mimeType) {
      onErrorRef.current("Tu navegador no permite grabar audio.");
      return;
    }
    mimeTypeRef.current = mimeType;

    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      });
    } catch (error) {
      console.error("[paula] micrófono denegado:", error);
      onErrorRef.current(
        "No pudimos usar el micrófono. Permite el acceso en el navegador e inténtalo de nuevo.",
      );
      return;
    }

    cancelledRef.current = false;
    listeningRef.current = true;
    streamRef.current = stream;
    peakRef.current = 0;
    nextIndexRef.current = 0;
    writeIndexRef.current = 0;
    bufferRef.current.clear();

    // Medidor de volumen: alimenta el indicador y el corte por silencio.
    try {
      const AudioContextClass =
        window.AudioContext ??
        (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (AudioContextClass) {
        const context = new AudioContextClass();
        audioContextRef.current = context;
        const analyser = context.createAnalyser();
        analyser.fftSize = 512;
        context.createMediaStreamSource(stream).connect(analyser);
        const data = new Uint8Array(analyser.frequencyBinCount);

        const tick = () => {
          analyser.getByteTimeDomainData(data);
          let peak = 0;
          for (const value of data) peak = Math.max(peak, Math.abs(value - 128) / 128);
          peakRef.current = Math.max(peakRef.current, peak);
          setLevel(peak);

          const now = Date.now();
          const elapsed = now - segmentStartRef.current;

          if (peak < 0.02) {
            if (silenceSinceRef.current === null) silenceSinceRef.current = now;
          } else {
            silenceSinceRef.current = null;
          }

          const quietFor = silenceSinceRef.current ? now - silenceSinceRef.current : 0;
          const longEnough = elapsed > MIN_SEGMENT_SECONDS * 1000;
          const tooLong = elapsed > SEGMENT_MAX_SECONDS * 1000;

          // Se corta en la pausa (nunca en mitad de una palabra) o, si alguien
          // habla sin parar, al llegar al maximo del segmento.
          if (listeningRef.current && ((longEnough && quietFor > SILENCE_SPLIT_MS) || tooLong)) {
            rotate();
          }

          frameRef.current = requestAnimationFrame(tick);
        };
        tick();
      }
    } catch (error) {
      console.error("[paula] medidor de audio no disponible:", error);
    }

    startSegment();
    setState("recording");
    setSeconds(0);
    timerRef.current = window.setInterval(() => setSeconds((value) => value + 1), 1000);
  }, [rotate, startSegment, state]);

  const stop = useCallback(() => {
    if (!listeningRef.current) return;
    listeningRef.current = false;
    if (recorderRef.current?.state === "recording") recorderRef.current.stop();
    release();
    setState("transcribing");
    setSeconds(0);
  }, [release]);

  const cancel = useCallback(() => {
    cancelledRef.current = true;
    stop();
  }, [stop]);

  const toggle = useCallback(() => {
    if (state === "recording") stop();
    else if (state === "idle") void start();
  }, [start, state, stop]);

  // Cuando no queda nada pendiente, se vuelve al reposo.
  useEffect(() => {
    if (state === "transcribing" && pending === 0) setState("idle");
  }, [pending, state]);

  useEffect(
    () => () => {
      cancelledRef.current = true;
      listeningRef.current = false;
      if (recorderRef.current?.state === "recording") recorderRef.current.stop();
      release();
    },
    [release],
  );

  return {
    supported,
    state,
    seconds,
    level,
    pending,
    start: () => void start(),
    stop,
    cancel,
    toggle,
  };
}
