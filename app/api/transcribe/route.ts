import { toErrorResponse, transcribe } from "@/lib/ai";
import { hasAudibleSpeech } from "@/lib/audio-check";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * Audio maximo aceptado. Vercel rechaza el cuerpo de la peticion a partir de
 * 4,5 MB, asi que cortamos antes para poder dar un mensaje entendible.
 */
const MAX_AUDIO_BYTES = 4 * 1024 * 1024;

const ACCEPTED = new Set(["audio/wav", "audio/x-wav", "audio/mpeg", "audio/ogg", "audio/flac"]);

export async function POST(request: Request): Promise<Response> {
  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return Response.json({ error: "Petición inválida." }, { status: 400 });
  }

  const audio = form.get("audio");
  if (!(audio instanceof File)) {
    return Response.json({ error: "No recibimos el audio." }, { status: 400 });
  }
  if (audio.size === 0) {
    return Response.json({ error: "La grabación está vacía." }, { status: 400 });
  }
  if (audio.size > MAX_AUDIO_BYTES) {
    return Response.json(
      { error: "La grabación es demasiado larga. Grábala en partes más cortas." },
      { status: 400 },
    );
  }
  if (!ACCEPTED.has(audio.type)) {
    return Response.json({ error: "Formato de audio no admitido." }, { status: 400 });
  }

  const language = form.get("lang") === "en" ? "English" : "Spanish";

  const bytes = await audio.arrayBuffer();

  // Si el audio no trae voz audible no se llama a la IA: ante el silencio
  // los modelos tienden a inventar frases, y aqui no se inventa nada.
  if (!hasAudibleSpeech(bytes)) {
    return Response.json(
      { error: "No escuchamos nada. Revisa el micrófono e inténtalo otra vez." },
      { status: 422 },
    );
  }

  try {
    const text = await transcribe({
      base64: Buffer.from(bytes).toString("base64"),
      mimeType: audio.type === "audio/x-wav" ? "audio/wav" : audio.type,
      language,
    });

    // El modelo avisa asi cuando el audio no trae voz; evita transcripciones inventadas.
    if (!text || /^no[_\s]?speech\.?$/i.test(text)) {
      return Response.json(
        { error: "No escuchamos nada. Acerca el micrófono e inténtalo otra vez." },
        { status: 422 },
      );
    }

    return Response.json({ text });
  } catch (error) {
    return toErrorResponse(error);
  }
}
