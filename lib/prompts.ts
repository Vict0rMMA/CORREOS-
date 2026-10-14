import type { Action, Lang, ProcessRequest, SheetCell, TextType, Tone } from "@/types";

/**
 * Prompt del sistema: editor profesional bilingue espanol-ingles.
 * Es estable entre peticiones para aprovechar el cache de prompt.
 */
export const SYSTEM_PROMPT = `You are the editing engine of PAULA CORREOS, a professional bilingual (Spanish <-> English) writing assistant. You behave like an experienced human editor and translator, not like a chatbot.

ABSOLUTE RULES
- Preserve the author's intent and meaning. Never change what they meant to say.
- Never invent information. Do not add facts, reasons, excuses, dates, promises or details that are not in the source text.
- Never remove important information from the source text.
- Keep proper nouns, names, titles, dates, times, numbers, amounts, currencies, units, links, emails, file names, codes and quoted text exactly as given (adapt only the format of dates when the target language clearly requires it).
- Never add explanations, notes, comments, alternatives, labels or headings of your own.
- Never wrap the answer in quotes or code fences.
- Never write "Subject:" / "Asunto:" lines; the subject is handled separately by the app.
- Output ONLY the final text, ready to copy and paste.
- Keep the original paragraph structure and line breaks unless the requested action implies restructuring.
- Do NOT add a greeting, a closing or a signature that is not already in the source text. Only the "write the complete email" task may add them.
- If the source text is already correct, return it unchanged instead of rewriting it.

TRANSLATION RULES
- Translate meaning and intent, never word by word.
- The result must read as if written by an educated native speaker of the target language.
- Adapt idioms, greetings and closings to what a native speaker would actually write.
- Keep the register of the source unless a different tone was requested.

EMAIL RULES
- A well formed email has a greeting, a clear body and a closing.
- When information is missing, use neutral phrasing instead of inventing details.
- Never invent a sender name, a course code, an institution, a phone number or an attachment.

STYLE
- Natural, fluent, human. No filler, no corporate cliches, no over-formality unless requested.
- Respect the requested tone and text type exactly.

WHEN THE OUTPUT LANGUAGE IS ENGLISH
- Write the whole answer in English. Never leave sentences, words or connectors in Spanish.
- Write AMERICAN English: color, center, aluminum, traveled, canceled, program, analyze, meter, liter, schedule (never colour, centre, aluminium, travelled, programme, analyse, metre, litre).
- Use standard English spelling, capitalization and punctuation.
- Check the things Spanish speakers get wrong in English: articles (a/an/the), prepositions, subject-verb agreement, verb tenses, word order, false friends (actually, assist, realize, carpet, library) and capitalization of days, months, languages and nationalities.

AIRCRAFT MAINTENANCE TERMINOLOGY (Spanish -> American English)
- aeronave / avion = aircraft; matricula = tail number; puerta = gate; turno = shift
- falla diferida = deferred defect; novedad = discrepancy; tarjeta de trabajo = job card
- inspeccion = inspection; mantenimiento de linea = line maintenance; tecnico = technician
- pieza = part; repuesto = spare part; herramienta = tool; bitacora = logbook
- llegada = arrival; salida = departure; estacion = station; tripulacion = crew
- Use the standard US industry term, not a literal translation.

CODES AND DATA ARE COPIED, NEVER TRANSLATED
- Copy exactly, character by character: tail numbers (N123AV, HK-4721), gate numbers (B4), station codes (MIA, DFW), times (07:30), dates, quantities, part numbers, work order numbers, unit numbers, MEL, NEF, JC and the priorities P-0, P-1, P-2, P-3.
- Acronyms stay as they are: never expand them, translate them or change their capitalization.
- People's names keep their original spelling and their accents.

WHEN THE OUTPUT LANGUAGE IS SPANISH
- Write the whole answer in Spanish, with correct accents (tildes), n-tilde and opening signs for questions and exclamations.
- Use neutral Latin American Spanish, not Spain-specific Spanish: "computador"/"computadora" (not "ordenador"), "celular" (not "móvil"), "carro" or "auto" (not "coche"), "ustedes" (never "vosotros"), "Le informamos que" (not "Le informamos de que").
- Keep the original form of address: if the source uses "usted", keep "usted"; if it uses "tú", keep "tú".`;

const TONE_INSTRUCTIONS: Record<Tone, string> = {
  professional:
    "professional: polite, clear and competent, the way a good colleague writes at work",
  formal:
    "formal: respectful and correct, courteous distance, no contractions, no slang",
  friendly: "friendly: warm, close and human, still correct and respectful",
  casual: "casual: relaxed and everyday, contractions allowed, never sloppy",
  academic:
    "academic: precise, objective and well structured, suitable for a university context",
  concise:
    "short and direct: say it in as few words as possible, no filler, no unnecessary courtesy",
};

/**
 * El tipo de texto es CONTEXTO: ajusta el registro, no la estructura.
 * Solo generate_email tiene permiso para anadir saludo y cierre.
 */
const TEXT_TYPE_INSTRUCTIONS: Record<TextType, string> = {
  email: "an email",
  report:
    "a report: factual and well organized, with a clear opening, the findings or events in order, and a short conclusion; no email greetings or closings",
  message: "a short message (chat or instant messaging), without email formalities",
  sheet:
    "a shift assignment sheet: data in columns, short entries, no prose and no courtesy formulas",
};

const LANG_NAMES: Record<Lang, string> = {
  es: "Spanish",
  en: "English",
};

function other(lang: Lang): Lang {
  return lang === "es" ? "en" : "es";
}

/** Idioma en el que debe salir el resultado, segun la accion. */
export function resolveTargetLang(action: Action, lang: Lang): Lang {
  switch (action) {
    case "translate":
      return other(lang);
    case "to_english":
      return "en";
    case "to_spanish":
      return "es";
    default:
      return lang;
  }
}

function actionInstruction(action: Action, source: Lang, target: Lang): string {
  switch (action) {
    case "correct":
      return `Correct the text: spelling, grammar, punctuation, accents, capitalization and awkward wording. Keep the author's voice and vocabulary. Make the smallest set of changes needed for the text to be correct and natural in ${LANG_NAMES[source]}. Do not translate it and do not rewrite sentences that are already fine.`;
    case "translate":
    case "to_english":
    case "to_spanish":
      return `Translate the text into ${LANG_NAMES[target]}. Fix any mistakes present in the source while translating. The result must sound completely natural to a native ${LANG_NAMES[target]} speaker, not like a translation. Keep the same form and length as the source: translate what is there, do not turn a note into an email, and do not add a greeting, a closing or a signature the source does not have.`;
    case "improve":
      return `Improve the writing in ${LANG_NAMES[source]}: clearer, better connected and more natural, with correct grammar. Keep exactly the same intent, information and approximate length. Do not translate it.`;
    case "generate_email":
      return `The text is a short idea or set of notes. Write the complete email it describes, in ${LANG_NAMES[target]}, with a greeting, a body that covers every point in the notes, and a closing. Use only the information given; where a detail is missing, use neutral phrasing. Do not invent names, dates or reasons.`;
    case "more_professional":
      return `Rewrite the text in ${LANG_NAMES[source]} with a more professional register, without making it stiff or bureaucratic. Same information, same intent.`;
    case "shorter":
      return `Make the text noticeably shorter in ${LANG_NAMES[source]} while keeping every piece of relevant information and the intent. Remove filler, not content.`;
    case "friendlier":
      return `Rewrite the text in ${LANG_NAMES[source]} with a warmer, friendlier tone. Same information, same intent, still correct.`;
    case "more_direct":
      return `Rewrite the text in ${LANG_NAMES[source]} so it gets straight to the point: lead with the request or the main message, keep it courteous but brief.`;
  }
}

/** Mensaje de usuario completo para una peticion de proceso. */
export function buildUserPrompt(req: ProcessRequest): string {
  const target = resolveTargetLang(req.action, req.lang);
  const parts: string[] = [
    `TASK: ${actionInstruction(req.action, req.lang, target)}`,
    `SOURCE LANGUAGE: ${LANG_NAMES[req.lang]}`,
    `OUTPUT LANGUAGE: ${LANG_NAMES[target]}`,
    `TEXT TYPE: ${TEXT_TYPE_INSTRUCTIONS[req.textType]}`,
    `TONE: ${TONE_INSTRUCTIONS[req.tone]}`,
  ];

  if (req.textType === "email" && req.subject?.trim()) {
    parts.push(
      `EMAIL SUBJECT (context only, do not repeat it in the output): ${req.subject.trim()}`,
    );
  }

  // La firma solo se anade al escribir un correo desde cero. En una correccion
  // o una traduccion seria anadir algo que el texto original no tenia.
  if (req.action === "generate_email" && req.signature?.trim()) {
    parts.push(
      [
        "SIGNATURE: end the email with exactly this signature block, on its own lines:",
        req.signature.trim(),
        "If that block already starts with a closing line (Atentamente, Cordialmente, Saludos, Best regards...), do not write another one before it.",
      ].join("\n"),
    );
  }

  parts.push(
    "Reply with the final text only.",
    "---- TEXT ----",
    req.text.trim(),
  );

  return parts.join("\n");
}

/** Mensaje de usuario para sugerir asuntos de correo. */
export function buildSubjectPrompt(text: string, lang: Lang, tone: Tone): string {
  return [
    `TASK: propose 3 subject lines for the email below, in ${LANG_NAMES[lang]}.`,
    `TONE: ${TONE_INSTRUCTIONS[tone]}`,
    "RULES: each subject line is short (max 60 characters), specific to the content, no quotes, no numbering, no invented details.",
    "Reply with exactly 3 lines, one subject per line, nothing else.",
    "---- EMAIL ----",
    text.trim(),
  ].join("\n");
}

/**
 * Segundo intento cuando el modelo devolvio el texto en el idioma equivocado.
 * Le mostramos su propia respuesta rechazada para que no la repita.
 */
export function buildRetryPrompt(req: ProcessRequest, rejected: string): string {
  const target = resolveTargetLang(req.action, req.lang);
  return [
    `Your previous answer was REJECTED because it was not written in ${LANG_NAMES[target]}.`,
    "---- REJECTED ANSWER ----",
    rejected.slice(0, 2000),
    "---- END ----",
    `Translate the original text below into ${LANG_NAMES[target]}. Every single sentence must be in ${LANG_NAMES[target]}. Output only the translation, nothing else.`,
    "---- ORIGINAL TEXT ----",
    req.text.trim(),
  ].join("\n");
}

// ---------------------------------------------------------------------------
// Planillas: traduccion celda a celda
// ---------------------------------------------------------------------------

/**
 * Mensaje de usuario para traducir las celdas de una planilla.
 *
 * Al modelo nunca le llega la tabla entera: solo la lista de celdas con texto
 * de verdad, cada una con su identificador. Asi no puede mover una fila, ni
 * inventarse una columna, ni devolver una matricula cambiada; lo unico que
 * puede hacer es traducir el texto que se le da.
 */
export function buildCellsPrompt(cells: SheetCell[], target: Lang): string {
  return [
    `TASK: translate the "text" of each entry below into ${LANG_NAMES[target]}.`,
    "These are cells of an American Airlines aircraft maintenance assignment sheet.",
    "RULES:",
    `- Return one entry per input entry, with the SAME "id". ${cells.length} in, ${cells.length} out.`,
    "- Translate the meaning, not word by word. Use the standard US aviation maintenance term.",
    "- Keep it short: these are table cells, not sentences. No trailing periods on short entries.",
    "- Copy codes, tail numbers, gate numbers, times, dates and numbers character by character.",
    "- Keep people's names exactly as written, accents included.",
    "- If an entry is already correct in the target language, repeat it unchanged.",
    "- Never merge, split, reorder, drop or invent entries.",
    "---- ENTRIES ----",
    JSON.stringify(cells),
  ].join("\n");
}

/** Lo que se le dice al modelo cuando su respuesta no paso la revision. */
export function buildCellsRetryPrompt(previous: string, problems: string[]): string {
  return [
    "Your previous answer was REJECTED. These are the exact problems:",
    ...problems.slice(0, 15).map((problem) => `- ${problem}`),
    "Fix every one of them and keep everything that was already right.",
    "Return the same ids, the same number of entries, and leave codes, times and numbers untouched.",
    "---- PREVIOUS ANSWER ----",
    previous.slice(0, 4000),
  ].join("\n");
}

/**
 * Esquema de la respuesta.
 * Con el esquema puesto, el proveedor ya no puede contestar con texto suelto
 * ni envolver el JSON en comillas.
 */
export const CELLS_SCHEMA: Record<string, unknown> = {
  type: "OBJECT",
  properties: {
    cells: {
      type: "ARRAY",
      items: {
        type: "OBJECT",
        properties: {
          id: { type: "STRING" },
          text: { type: "STRING" },
        },
        required: ["id", "text"],
      },
    },
  },
  required: ["cells"],
};
