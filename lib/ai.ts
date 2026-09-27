import { ApiError, GoogleGenAI } from "@google/genai";

/**
 * Capa de servicio de IA (Google Gemini). Solo se ejecuta en el servidor.
 * Para cambiar de proveedor basta con reimplementar streamCompletion y
 * completion manteniendo su firma: el resto de la app no sabe quien responde.
 */

/**
 * Modelo por defecto; se puede sobreescribir con AI_MODEL.
 * flash-lite responde en menos de un segundo, traduce con calidad nativa y es
 * el que mas peticiones gratuitas permite al dia.
 */
export const AI_MODEL = process.env.AI_MODEL?.trim() || "gemini-flash-lite-latest";

/** Limite de caracteres de entrada aceptado por el servidor. */
export const MAX_INPUT_CHARS = Number(process.env.AI_MAX_INPUT_CHARS) || 12000;

/** Falta configuracion (no hay API key). */
export class AIConfigError extends Error {}

/** El proveedor no devolvio un resultado utilizable. */
export class AIRequestError extends Error {}

let client: GoogleGenAI | null = null;

function getClient(): GoogleGenAI {
  const apiKey =
    process.env.AI_API_KEY?.trim() ||
    process.env.GEMINI_API_KEY?.trim() ||
    process.env.GOOGLE_API_KEY?.trim();

  if (!apiKey) {
    throw new AIConfigError("AI_API_KEY is not set");
  }
  if (!client) {
    client = new GoogleGenAI({ apiKey });
  }
  return client;
}

/**
 * Temperatura baja: corregir y traducir exige fidelidad, no creatividad.
 */
const TEMPERATURE = 0.4;

const encoder = new TextEncoder();

/** Estados que suelen resolverse solos: saturacion o limite momentaneo. */
const TRANSIENT_STATUS = new Set([429, 500, 502, 503, 504]);

function isTransient(error: unknown): boolean {
  return error instanceof ApiError && TRANSIENT_STATUS.has(error.status);
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Reintenta con espera creciente solo los fallos temporales del proveedor.
 * Se usa antes de enviar el primer fragmento al cliente, nunca a mitad de stream.
 */
async function withRetry<T>(run: () => Promise<T>, attempts = 3): Promise<T> {
  let lastError: unknown;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      return await run();
    } catch (error) {
      lastError = error;
      if (!isTransient(error) || attempt === attempts - 1) throw error;
      console.warn(`[paula] reintento ${attempt + 1} tras fallo temporal de la IA`);
      await sleep(700 * 2 ** attempt);
    }
  }
  throw lastError;
}

export interface CompletionOptions {
  system: string;
  user: string;
  maxTokens?: number;
}

/**
 * Devuelve un ReadableStream de texto plano (UTF-8) con la respuesta del modelo.
 *
 * Espera el primer fragmento antes de resolver: asi los fallos de
 * configuracion, de clave o de filtros de seguridad se devuelven como un error
 * HTTP normal en lugar de como un stream roto a mitad de camino.
 */
export async function streamCompletion({
  system,
  user,
  maxTokens = 8000,
}: CompletionOptions): Promise<ReadableStream<Uint8Array>> {
  /** Abre el stream y devuelve el primer fragmento con texto. */
  const start = async () => {
    const chunks = await getClient().models.generateContentStream({
      model: AI_MODEL,
      contents: user,
      config: {
        systemInstruction: system,
        temperature: TEMPERATURE,
        maxOutputTokens: maxTokens,
      },
    });

    const iterator = chunks[Symbol.asyncIterator]();

    /** Avanza el stream hasta el siguiente fragmento con texto. */
    const readText = async (): Promise<string | null> => {
      for (;;) {
        const next = await iterator.next();
        if (next.done) return null;

        const blockReason = next.value.promptFeedback?.blockReason;
        if (blockReason) {
          throw new AIRequestError(`Request blocked by the provider: ${blockReason}`);
        }

        const text = next.value.text;
        if (text) return text;
      }
    };

    const first = await readText();
    if (first === null) {
      throw new AIRequestError("Empty response from the provider");
    }

    return { first, readText };
  };

  const { first: opening, readText } = await withRetry(start);

  return new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
        controller.enqueue(encoder.encode(opening));
        for (;;) {
          const chunk = await readText();
          if (chunk === null) break;
          controller.enqueue(encoder.encode(chunk));
        }
        controller.close();
      } catch (error) {
        console.error("[paula] AI stream failed:", error);
        controller.error(error);
      }
    },
  });
}

/** Llamada sin streaming; devuelve el texto completo. */
export async function completion({
  system,
  user,
  maxTokens = 1000,
}: CompletionOptions): Promise<string> {
  const response = await withRetry(() =>
    getClient().models.generateContent({
      model: AI_MODEL,
      contents: user,
      config: {
        systemInstruction: system,
        temperature: TEMPERATURE,
        maxOutputTokens: maxTokens,
      },
    }),
  );

  if (response.promptFeedback?.blockReason) {
    throw new AIRequestError(
      `Request blocked by the provider: ${response.promptFeedback.blockReason}`,
    );
  }

  const text = response.text?.trim();
  if (!text) {
    throw new AIRequestError("Empty response from the provider");
  }

  return text;
}

export interface TranscriptionOptions {
  /** Audio en base64 (WAV mono 16 kHz). */
  base64: string;
  mimeType: string;
  /** Idioma esperado, para no transcribir "a lo que suene". */
  language: string;
}

/**
 * Convierte audio dictado en texto. Va por la misma API que el resto:
 * transcribe con puntuacion y acentos, no palabra por palabra.
 */
export async function transcribe({
  base64,
  mimeType,
  language,
}: TranscriptionOptions): Promise<string> {
  const response = await withRetry(() =>
    getClient().models.generateContent({
      model: AI_MODEL,
      contents: [
        {
          role: "user",
          parts: [
            { inlineData: { mimeType, data: base64 } },
            {
              text: [
                `Transcribe the dictation in this audio. The speaker is talking in ${language}.`,
                "Rules:",
                "- Write exactly what is said, in the same language. Do not translate.",
                "- Add correct punctuation, capitalization and accents.",
                "- If the speaker dictates punctuation out loud (coma, punto, nueva linea, comma, period, new line), apply it instead of writing the word.",
                "- Do not add greetings, comments, titles or anything that was not said.",
                "- If the audio has no speech, reply with nothing at all.",
                "Output only the transcription.",
              ].join("\n"),
            },
          ],
        },
      ],
      config: { temperature: 0, maxOutputTokens: 4000 },
    }),
  );

  if (response.promptFeedback?.blockReason) {
    throw new AIRequestError(
      `Request blocked by the provider: ${response.promptFeedback.blockReason}`,
    );
  }

  return response.text?.trim() ?? "";
}

/** Traduce cualquier fallo a una respuesta HTTP sin filtrar detalles tecnicos. */
export function toErrorResponse(error: unknown): Response {
  console.error("[paula] AI request failed:", error);

  if (error instanceof AIConfigError) {
    return Response.json(
      { error: "IA no configurada. Falta la variable AI_API_KEY." },
      { status: 503 },
    );
  }

  if (error instanceof ApiError) {
    // Gemini responde 400 / API_KEY_INVALID cuando la clave esta mal.
    const invalidKey =
      error.status === 401 ||
      error.status === 403 ||
      (error.status === 400 && /API_KEY_INVALID|API key not valid/i.test(error.message));

    if (invalidKey) {
      return Response.json(
        { error: "La clave de la API no es válida. Revisa AI_API_KEY." },
        { status: 503 },
      );
    }
    if (error.status === 404) {
      return Response.json(
        { error: `El modelo "${AI_MODEL}" no está disponible. Revisa AI_MODEL.` },
        { status: 503 },
      );
    }
    if (error.status === 429) {
      return Response.json(
        { error: "Demasiadas peticiones. Intenta de nuevo en unos segundos." },
        { status: 429 },
      );
    }
    if (TRANSIENT_STATUS.has(error.status)) {
      return Response.json(
        {
          error:
            "El servicio de IA está saturado en este momento. Intenta de nuevo en unos segundos.",
        },
        { status: 503 },
      );
    }
  }

  return Response.json(
    {
      error:
        "No pudimos procesar el texto. Revisa tu conexión o configuración de IA.",
    },
    { status: 502 },
  );
}
