import { isAction, isTextType, isTone } from "@/lib/actions";
import {
  MAX_INPUT_CHARS,
  jsonCompletion,
  streamCompletion,
  toErrorResponse,
} from "@/lib/ai";
import { detectLanguage, effectiveSourceLang } from "@/lib/detect-language";
import { labels } from "@/lib/export/i18n";
import {
  CELLS_SCHEMA,
  SYSTEM_PROMPT,
  TABLE_SCHEMA,
  buildCellsPrompt,
  buildRetryPrompt,
  buildTablePrompt,
  buildTableRetryPrompt,
  buildUserPrompt,
  resolveTargetLang,
} from "@/lib/prompts";
import {
  type TablaLeida,
  esDato,
  leerTsv,
  necesitaTraduccion,
  normalizarTabla,
  pareceTabla,
  restosEnEspanol,
  tablaATexto,
  tokensPerdidos,
  traducirEncabezado,
} from "@/lib/tabla";
import type { Lang, ProcessRequest, TableData } from "@/types";

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
  if (raw.format !== undefined && raw.format !== "text" && raw.format !== "table") {
    return "Formato de respuesta no reconocido.";
  }

  return {
    action: raw.action,
    text,
    lang: raw.lang,
    tone: raw.tone,
    textType: raw.textType,
    subject: typeof raw.subject === "string" ? raw.subject.slice(0, 300) : undefined,
    signature: typeof raw.signature === "string" ? raw.signature.slice(0, 300) : undefined,
    format: raw.format === "table" ? "table" : "text",
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

// ---------------------------------------------------------------------------
// Planilla
// ---------------------------------------------------------------------------

/**
 * Revision de una tabla ya montada: ningun dato del original puede faltar y
 * nada puede quedar a medio traducir.
 *
 * `revisarIdioma` se apaga cuando la tabla venia pegada: ahi las celdas que
 * paso el modelo ya se revisaron una a una, y volver a mirar la tabla entera
 * solo daria avisos falsos por los nombres y los codigos que se copiaron tal
 * cual ("J. Pérez", "N123AV").
 */
function revisar(
  origen: string,
  table: TableData,
  target: Lang,
  revisarIdioma = true,
): string[] {
  const plano = tablaATexto(table, target);
  const problemas: string[] = [];

  const perdidos = tokensPerdidos(origen, plano);
  if (perdidos.length > 0) {
    problemas.push(`faltan datos del original: ${perdidos.join(", ")}`);
  }

  if (revisarIdioma) {
    const restos = restosEnEspanol(plano, target);
    if (restos.length > 0) {
      problemas.push(`quedó sin traducir: ${restos.slice(0, 12).join(", ")}`);
    }
  }

  return problemas;
}

/** Respuesta cuando la planilla no quedo fiel al original. */
function noCuadra(problemas: string[]): Response {
  return Response.json(
    {
      error: `La planilla no quedó igual que el original (${problemas.join("; ")}). No la descargues así: revisa el texto y vuelve a intentarlo.`,
      problems: problemas,
    },
    { status: 422 },
  );
}

/**
 * Tabla pegada desde Excel.
 *
 * Los encabezados conocidos y las celdas con codigos, horas o numeros se
 * resuelven aqui, sin IA: asi no hay forma de que una matricula vuelva
 * cambiada. Al modelo solo le llegan las celdas con texto de verdad.
 */
async function tablaPegada(
  parsed: ProcessRequest,
  target: Lang,
  leida: TablaLeida,
): Promise<Response> {
  const porTraducir: string[] = [];
  const indice = new Map<string, number>();

  /** Apunta un texto para traducir y devuelve su hueco en la lista. */
  const encolar = (valor: string): number => {
    const existente = indice.get(valor);
    if (existente !== undefined) return existente;
    const posicion = porTraducir.length;
    indice.set(valor, posicion);
    porTraducir.push(valor);
    return posicion;
  };

  // Encabezados: primero la plantilla de AVX, y solo lo que no esta en ella
  // pasa por el modelo.
  const columnas = leida.columns.map((nombre) => {
    const conocido = traducirEncabezado(nombre, target);
    if (conocido) return { fijo: conocido };
    return nombre.trim() ? { hueco: encolar(nombre) } : { fijo: nombre };
  });

  const celdas = leida.rows.map((fila) =>
    fila.map((celda) =>
      necesitaTraduccion(celda) ? { hueco: encolar(celda) } : { fijo: celda },
    ),
  );

  const titulo = leida.title ? { hueco: encolar(leida.title) } : null;
  const notas = leida.notes ? { hueco: encolar(leida.notes) } : null;
  // El turno ("Noche") es una palabra suelta y con mayuscula: sin esto
  // pasaria por nombre propio y se quedaria en espanol.
  const turno =
    leida.meta.shift && !esDato(leida.meta.shift) ? { hueco: encolar(leida.meta.shift) } : null;

  // Sin texto que traducir no hace falta llamar a nadie.
  let traducidas: string[] = porTraducir;

  if (porTraducir.length > 0) {
    const resultado = await jsonCompletion<{ cells?: unknown }>({
      system: SYSTEM_PROMPT,
      user: buildCellsPrompt(porTraducir, target),
      schema: CELLS_SCHEMA,
      verify: (valor) => {
        const lista = Array.isArray(valor?.cells) ? valor.cells : [];
        if (lista.length !== porTraducir.length) {
          return [
            `devolviste ${lista.length} celdas y hacían falta ${porTraducir.length}`,
          ];
        }
        const texto = lista.join("\n");
        const problemas: string[] = [];
        const perdidos = tokensPerdidos(porTraducir.join("\n"), texto);
        if (perdidos.length > 0) problemas.push(`faltan datos: ${perdidos.join(", ")}`);
        const restos = restosEnEspanol(texto, target);
        if (restos.length > 0) {
          problemas.push(`quedó sin traducir: ${restos.slice(0, 12).join(", ")}`);
        }
        return problemas;
      },
      retryUser: (crudo, problemas) => buildTableRetryPrompt(crudo, problemas),
    });

    // Con problemas no se recompone nada: mejor avisar que entregar una
    // planilla con los datos cambiados.
    if (resultado.problems.length > 0) return noCuadra(resultado.problems);

    const lista = Array.isArray(resultado.value?.cells) ? resultado.value.cells : [];
    traducidas = porTraducir.map((original, posicion) => {
      const valor = lista[posicion];
      return typeof valor === "string" && valor.trim() ? valor.trim() : original;
    });
  }

  const leer = (pieza: { fijo?: string; hueco?: number }): string =>
    pieza.hueco === undefined ? (pieza.fijo ?? "") : traducidas[pieza.hueco];

  const table: TableData = {
    title: titulo ? leer(titulo) : labels(target).sheetTitle,
    meta: { ...leida.meta, shift: turno ? leer(turno) : leida.meta.shift },
    columns: columnas.map(leer),
    rows: celdas.map((fila) => fila.map(leer)),
    notes: notas ? leer(notas) : undefined,
  };

  const problemas = revisar(parsed.text, table, target, false);
  if (problemas.length > 0) return noCuadra(problemas);

  return Response.json({ table });
}

/** Texto libre convertido en tabla por el modelo. */
async function tablaDeTexto(parsed: ProcessRequest, target: Lang): Promise<Response> {
  const resultado = await jsonCompletion<unknown>({
    system: SYSTEM_PROMPT,
    user: buildTablePrompt(parsed),
    schema: TABLE_SCHEMA,
    verify: (valor) => {
      const { table, problemas } = normalizarTabla(valor);
      if (!table) return problemas;
      return [...problemas, ...revisar(parsed.text, table, target)];
    },
    retryUser: (crudo, problemas) => buildTableRetryPrompt(crudo, problemas),
  });

  const { table, problemas } = normalizarTabla(resultado.value);
  if (!table) return noCuadra(problemas);
  if (resultado.problems.length > 0) return noCuadra(resultado.problems);

  if (!table.title) table.title = labels(target).sheetTitle;
  return Response.json({ table });
}

/** Planilla: tabla pegada desde Excel o texto libre. */
async function planilla(parsed: ProcessRequest, target: Lang): Promise<Response> {
  const leida = pareceTabla(parsed.text) ? leerTsv(parsed.text) : null;
  return leida ? tablaPegada(parsed, target, leida) : tablaDeTexto(parsed, target);
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

  // La planilla no va en streaming: la tabla se revisa entera antes de
  // entregarla.
  if (parsed.format === "table") {
    try {
      return await planilla(parsed, target);
    } catch (error) {
      return toErrorResponse(error);
    }
  }

  // Una traduccion se verifica antes de entregarla: si el modelo devolvio el
  // texto en el idioma de origen, se reintenta una vez.
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
