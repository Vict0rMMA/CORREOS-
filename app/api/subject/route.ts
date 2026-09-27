import { isTone } from "@/lib/actions";
import { MAX_INPUT_CHARS, completion, toErrorResponse } from "@/lib/ai";
import { SYSTEM_PROMPT, buildSubjectPrompt } from "@/lib/prompts";
import type { SubjectResponse } from "@/types";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(request: Request): Promise<Response> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Petición inválida." }, { status: 400 });
  }

  const raw = (body ?? {}) as Record<string, unknown>;
  const text = typeof raw.text === "string" ? raw.text.trim() : "";

  if (!text) {
    return Response.json({ error: "No hay texto para el asunto." }, { status: 400 });
  }
  if (text.length > MAX_INPUT_CHARS) {
    return Response.json({ error: "El texto es demasiado largo." }, { status: 400 });
  }
  const lang = raw.lang === "en" ? "en" : "es";
  const tone = isTone(raw.tone) ? raw.tone : "professional";

  try {
    const result = await completion({
      system: SYSTEM_PROMPT,
      user: buildSubjectPrompt(text, lang, tone),
      maxTokens: 2000,
    });

    const subjects = result
      .split("\n")
      .map((line) => line.replace(/^\s*(?:[-*\d.)\]]+\s*)/, "").replace(/^["']|["']$/g, "").trim())
      .filter(Boolean)
      .slice(0, 3);

    if (subjects.length === 0) {
      return Response.json(
        { error: "No pudimos generar asuntos. Intenta de nuevo." },
        { status: 502 },
      );
    }

    return Response.json({ subjects } satisfies SubjectResponse);
  } catch (error) {
    return toErrorResponse(error);
  }
}
