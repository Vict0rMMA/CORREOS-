import { isAction, isTextType, isTone } from "@/lib/actions";
import { MAX_INPUT_CHARS, streamCompletion, toErrorResponse } from "@/lib/ai";
import { detectLanguage, effectiveSourceLang } from "@/lib/detect-language";
import {
  SYSTEM_PROMPT,
  buildRetryPrompt,
  buildUserPrompt,
  resolveTargetLang,
} from "@/lib/prompts";
import type { Lang, ProcessRequest } from "@/types";

export const runtime = "nodejs";
export const maxDuration = 60;

function badRequest(message: string): Response {
  return Response.json({ error: message }, { status: 400 });
}

/** Valida el cuerpo de la peticion y lo normaliza. */
function parseBody(body: unknown): ProcessRequest | string {
  if (typeof body !== "object" || body === null) return "Petición inválida.";
  const raw = body as Record<string, unknown>;

  const text = typeof raw.text === "string" ? raw.text.trim() : "";
  if (!text) return "No hay texto para procesar.";
  if (text.length > MAX_INPUT_CHARS) {
    return `El texto supera el límite de ${MAX_INPUT_CHARS} caracteres.`;
  }
  if (!isAction(raw.action)) return "Acción no reconocida.";
  if (raw.lang !== "es" && raw.lang !== "en") return "Idioma no reconocido.";
  if (!isTone(raw.tone)) return "Tono no reconocido.";
  if (!isTextType(raw.textType)) return "Tipo de texto no reconocido.";

  return {
    action: raw.action,
    text,
    lang: raw.lang,
    tone: raw.tone,
    textType: raw.textType,
    subject: typeof raw.subject === "string" ? raw.subject.slice(0, 300) : undefined,
    signature: typeof raw.signature === "string" ? raw.signature.slice(0, 300) : undefined,
  };
}

/** true si el texto esta claramente en el idioma esperado. */
function wrongLanguage(text: string, target: Lang): boolean {
  const detection = detectLanguage(text);
  return detection.confident && detection.lang !== target;
}

/**
 * Traduce en streaming, comprobando solo el principio del resultado.
 *
 * Si esas primeras lineas no vienen en el idioma pedido, se descarta y se
 * reintenta con una instruccion mas firme. Antes se esperaba al texto
 * completo para poder comprobarlo, y en correos largos eso se notaba.
 */
async function translate(parsed: ProcessRequest, target: Lang): Promise<Response> {
  const stream = await streamCompletion({
    system: SYSTEM_PROMPT,
    user: buildUserPrompt(parsed),
    maxTokens: 8000,
    verify: (muestra) => !wrongLanguage(muestra, target),
    retryUser: (rechazada) => buildRetryPrompt(parsed, rechazada),
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Accel-Buffering": "no",
    },
  });
}

export async function POST(request: Request): Promise<Response> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return badRequest("Petición inválida.");
  }

  const validated = parseBody(body);
  if (typeof validated === "string") return badRequest(validated);
  let parsed = validated;

  // El idioma de origen lo decide el texto cuando es evidente (ver
  // effectiveSourceLang): evita traducir "al otro idioma" en la direccion
  // equivocada y devolver el texto igual.
  const source = effectiveSourceLang(parsed.lang, parsed.text);
  if (source !== parsed.lang) {
    console.warn(`[paula] idioma corregido: ${parsed.lang} -> ${source}`);
    parsed = { ...parsed, lang: source };
  }

  const target = resolveTargetLang(parsed.action, parsed.lang);

  // Una traduccion se verifica antes de entregarla: si el modelo devolvio el
  // texto en el idioma de origen, se reintenta una vez. Por eso no va en
  // streaming (el texto ya estaria en pantalla cuando descubrimos el fallo).
  if (target !== parsed.lang) {
    try {
      return await translate(parsed, target);
    } catch (error) {
      return toErrorResponse(error);
    }
  }

  try {
    const stream = await streamCompletion({
      system: SYSTEM_PROMPT,
      user: buildUserPrompt(parsed),
      maxTokens: 8000,
    });

    return new Response(stream, {
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        "Cache-Control": "no-store",
        // Evita que proxies intermedios acumulen el stream.
        "X-Accel-Buffering": "no",
      },
    });
  } catch (error) {
    return toErrorResponse(error);
  }
}
