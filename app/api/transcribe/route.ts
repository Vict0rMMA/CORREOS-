import { toErrorResponse, transcribe } from "@/lib/ai";

export const runtime = "nodejs";
export const maxDuration = 60;

/** Audio maximo aceptado (unos 3 minutos de WAV mono a 16 kHz). */
const MAX_AUDIO_BYTES = 8 * 1024 * 1024;

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
      { error: "La grabación es demasiado larga. Graba por partes." },
      { status: 400 },
    );
  }
  if (!ACCEPTED.has(audio.type)) {
    return Response.json({ error: "Formato de audio no admitido." }, { status: 400 });
  }

  const language = form.get("lang") === "en" ? "English" : "Spanish";

  try {
    const text = await transcribe({
      base64: Buffer.from(await audio.arrayBuffer()).toString("base64"),
      mimeType: audio.type === "audio/x-wav" ? "audio/wav" : audio.type,
      language,
    });

    if (!text) {
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
