"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { MAX_RECORDING_SECONDS, isRecordingSupported, pickRecordingMimeType, toWav } from "@/lib/audio";
import type { Lang } from "@/types";

/**
 * Dictado por voz: graba con el microfono y transcribe en el servidor.
 *
 * Se hace asi, y no con el reconocimiento del navegador, porque aquel depende
 * de un servicio de Chrome que falla a menudo, corta por silencios y devuelve
 * el texto sin acentos ni puntuacion. Grabando, la transcripcion llega con
 * puntuacion, tildes y ninguna dependencia del navegador.
 */

export type DictationState = "idle" | "recording" | "transcribing";

export interface DictationOptions {
  lang: Lang;
  /** Recibe el texto transcrito para anadirlo al cuadro. */
  onText: (text: string) => void;
  onError: (message: string) => void;
}

export interface Dictation {
  supported: boolean;
  state: DictationState;
  /** Segundos grabados. */
  seconds: number;
  /** Volumen de entrada de 0 a 1, para el indicador. */
  level: number;
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

  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const audioContextRef = useRef<AudioContext | null>(null);
  const frameRef = useRef<number | null>(null);
  const timerRef = useRef<number | null>(null);
  const cancelledRef = useRef(false);

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

  const transcribe = useCallback(async (recorded: Blob) => {
    setState("transcribing");
    try {
      const wav = await toWav(recorded);
      const form = new FormData();
      form.append("audio", wav, "dictado.wav");
      form.append("lang", langRef.current);

      const response = await fetch("/api/transcribe", { method: "POST", body: form });
      const data = (await response.json()) as { text?: string; error?: string };
      if (!response.ok) throw new Error(data.error ?? "No pudimos transcribir el audio.");

      const text = data.text?.trim();
      if (text) onTextRef.current(text);
      else onErrorRef.current("No escuchamos nada en la grabación.");
    } catch (error) {
      console.error("[paula] transcripción fallida:", error);
      onErrorRef.current(
        error instanceof Error && error.message
          ? error.message
          : "No pudimos transcribir el audio.",
      );
    } finally {
      setState("idle");
      setSeconds(0);
    }
  }, []);

  const start = useCallback(async () => {
    if (state !== "idle") return;

    const mimeType = pickRecordingMimeType();
    if (!mimeType) {
      onErrorRef.current("Tu navegador no permite grabar audio.");
      return;
    }

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
    streamRef.current = stream;
    chunksRef.current = [];

    const recorder = new MediaRecorder(stream, { mimeType });
    recorderRef.current = recorder;

    recorder.ondataavailable = (event) => {
      if (event.data.size > 0) chunksRef.current.push(event.data);
    };

    recorder.onstop = () => {
      const recorded = new Blob(chunksRef.current, { type: mimeType });
      release();
      if (cancelledRef.current) {
        setState("idle");
        setSeconds(0);
        return;
      }
      if (recorded.size < 1200) {
        setState("idle");
        setSeconds(0);
        onErrorRef.current("La grabación fue muy corta. Mantén pulsado y habla un poco más.");
        return;
      }
      void transcribe(recorded);
    };

    recorder.onerror = (event) => {
      console.error("[paula] error de grabación:", event);
      release();
      setState("idle");
      onErrorRef.current("Se interrumpió la grabación.");
    };

    // Medidor de volumen, para que se vea que el micrófono está entrando.
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
          setLevel(peak);
          frameRef.current = requestAnimationFrame(tick);
        };
        tick();
      }
    } catch (error) {
      console.error("[paula] medidor de audio no disponible:", error);
    }

    recorder.start(250);
    setState("recording");
    setSeconds(0);
    timerRef.current = window.setInterval(() => {
      setSeconds((current) => {
        const next = current + 1;
        // Tope de seguridad: cerramos la grabación sola.
        if (next >= MAX_RECORDING_SECONDS) recorderRef.current?.stop();
        return next;
      });
    }, 1000);
  }, [release, state, transcribe]);

  const stop = useCallback(() => {
    if (recorderRef.current?.state === "recording") recorderRef.current.stop();
  }, []);

  const cancel = useCallback(() => {
    cancelledRef.current = true;
    stop();
  }, [stop]);

  const toggle = useCallback(() => {
    if (state === "recording") stop();
    else if (state === "idle") void start();
  }, [start, state, stop]);

  useEffect(
    () => () => {
      cancelledRef.current = true;
      if (recorderRef.current?.state === "recording") recorderRef.current.stop();
      release();
    },
    [release],
  );

  return { supported, state, seconds, level, start: () => void start(), stop, cancel, toggle };
}
