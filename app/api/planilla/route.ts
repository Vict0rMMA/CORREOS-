import { jsonCompletion, toErrorResponse } from "@/lib/ai";
import { paraExportar } from "@/lib/planilla";
import {
  CELLS_SCHEMA,
  SYSTEM_PROMPT,
  buildCellsPrompt,
  buildCellsRetryPrompt,
} from "@/lib/prompts";
import {
  fechaParaIdioma,
  necesitaTraduccion,
  restosEnEspanol,
  revisarPlanilla,
  tokensPerdidos,
  traducirEncabezado,
  traducirValor,
} from "@/lib/tabla";
import type { Aviso } from "@/lib/tabla";
import type { Lang, SheetCell, SheetDoc, SheetSection } from "@/types";

/**
 * Traduce una planilla celda a celda.
 *
 * El modelo nunca ve la tabla: recibe una lista de celdas con identificador y
 * devuelve la misma lista traducida. La planilla se vuelve a montar aqui, con
 * las mismas filas, las mismas columnas y los datos protegidos copiados tal
 * cual. Despues se revisa; si algo no cuadra se devuelve la lista de celdas
 * con problema en vez del archivo.
 */

export const runtime = "nodejs";
export const maxDuration = 60;

/** Tope de celdas por peticion: una planilla de verdad no llega ni de lejos. */
const MAX_CELDAS = 4000;

function badRequest(message: string): Response {
  return Response.json({ error: message }, { status: 400 });
}

/** Comprueba que el cuerpo es una planilla con la forma esperada. */
function parseBody(body: unknown): { doc: SheetDoc; target: Lang } | string {
  if (typeof body !== "object" || body === null) return "Petición inválida.";
  const raw = body as Record<string, unknown>;

  if (raw.target !== "es" && raw.target !== "en") return "Idioma no reconocido.";
  const doc = raw.doc as SheetDoc | undefined;
  if (!doc || typeof doc !== "object") return "No hay planilla para traducir.";
  if (!Array.isArray(doc.sections) || doc.sections.length === 0) {
    return "La planilla no tiene ninguna tabla.";
  }

  let celdas = 0;
  for (const seccion of doc.sections) {
    if (!Array.isArray(seccion.columns) || !Array.isArray(seccion.rows)) {
      return "La planilla no tiene la forma esperada.";
    }
    celdas += seccion.columns.length * (seccion.rows.length + 1);
  }
  if (celdas > MAX_CELDAS) return "La planilla es demasiado grande.";

  return { doc, target: raw.target };
}

interface Pieza {
  /** Texto final, cuando se resuelve sin IA. */
  fijo?: string;
  /** Identificador de la celda que se manda a traducir. */
  id?: string;
}

export async function POST(request: Request): Promise<Response> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return badRequest("Petición inválida.");
  }

  const validado = parseBody(body);
  if (typeof validado === "string") return badRequest(validado);

  // Las filas en blanco del final no se traducen ni se exportan.
  const origen = paraExportar(validado.doc);
  const target = validado.target;

  const porTraducir: SheetCell[] = [];
  /** El mismo texto dos veces se traduce una sola vez. */
  const yaPedido = new Map<string, string>();

  const encolar = (texto: string): Pieza => {
    const existente = yaPedido.get(texto);
    if (existente) return { id: existente };
    const id = `c${porTraducir.length + 1}`;
    yaPedido.set(texto, id);
    porTraducir.push({ id, text: texto });
    return { id };
  };

  /**
   * Resuelve una celda: fija si se puede, a la cola si hace falta la IA.
   * La columna cuenta: "Pérez" se respeta en EMPLEADO, pero "Puntual" en
   * NOTAS es una palabra y se traduce.
   */
  const resolverCelda = (valor: string, columna = ""): Pieza => {
    const texto = valor.trim();
    if (!texto) return { fijo: "" };
    const conocido = traducirValor(texto, target);
    if (conocido) return { fijo: conocido };
    if (!necesitaTraduccion(texto, target, columna)) return { fijo: valor };
    return encolar(texto);
  };

  const plano = origen.sections.map((seccion) => ({
    title: seccion.title ? resolverEncabezado(seccion.title) : { fijo: "" },
    columns: seccion.columns.map(resolverEncabezado),
    rows: seccion.rows.map((fila) =>
      fila.map((celda, columna) => resolverCelda(celda, seccion.columns[columna] ?? "")),
    ),
  }));

  function resolverEncabezado(nombre: string): Pieza {
    const texto = nombre.trim();
    if (!texto) return { fijo: nombre };
    const conocido = traducirEncabezado(texto, target);
    if (conocido) return { fijo: conocido };
    return encolar(texto);
  }

  const notas = origen.notes?.trim() ? resolverCelda(origen.notes) : { fijo: "" };
  const turno = origen.meta.shift?.trim() ? resolverCelda(origen.meta.shift) : { fijo: "" };
  const titulo = origen.title?.trim() ? resolverEncabezado(origen.title) : { fijo: "" };

  /** Lo que devolvio el modelo, por identificador. */
  let traducciones = new Map<string, string>();

  if (porTraducir.length > 0) {
    try {
      const resultado = await jsonCompletion<{ cells?: unknown }>({
        system: SYSTEM_PROMPT,
        user: buildCellsPrompt(porTraducir, target),
        schema: CELLS_SCHEMA,
        verify: (valor) => revisarCeldas(valor, porTraducir, target),
        retryUser: (crudo, problemas) => buildCellsRetryPrompt(crudo, problemas),
      });

      traducciones = mapaDeCeldas(resultado.value?.cells);

      if (resultado.problems.length > 0) {
        return Response.json(
          {
            error: "La traducción no quedó fiel al original.",
            problems: resultado.problems,
          },
          { status: 422 },
        );
      }
    } catch (error) {
      return toErrorResponse(error);
    }
  }

  // El mapa de ids al reves, para poder recuperar el texto original.
  const textoPorId = new Map([...yaPedido].map(([texto, id]) => [id, texto]));

  const leerCelda = (pieza: Pieza): string => {
    if (pieza.id === undefined) return pieza.fijo ?? "";
    const traducida = traducciones.get(pieza.id);
    // Sin traduccion se deja el original: nunca una celda vacia.
    return traducida?.trim() ? traducida.trim() : (textoPorId.get(pieza.id) ?? "");
  };

  const sections: SheetSection[] = plano.map((seccion) => ({
    title: leerCelda(seccion.title),
    columns: seccion.columns.map(leerCelda),
    rows: seccion.rows.map((fila) => fila.map(leerCelda)),
  }));

  const salida: SheetDoc = {
    template: origen.template,
    title: leerCelda(titulo) || origen.title,
    meta: {
      // 14/10/2026 en espanol es 10/14/2026 en ingles, como en el modelo.
      date: fechaParaIdioma(origen.meta.date, target),
      shift: leerCelda(turno),
      supervisor: origen.meta.supervisor,
    },
    sections,
    notes: leerCelda(notas) || undefined,
  };

  // Ultima revision, ya sobre la planilla montada: estructura, datos
  // protegidos e idioma, celda por celda.
  const avisos: Aviso[] = revisarPlanilla(origen, salida, target);
  if (avisos.length > 0) {
    return Response.json(
      {
        error: "La planilla traducida no coincide con el original.",
        avisos,
        doc: salida,
      },
      { status: 422 },
    );
  }

  return Response.json({ doc: salida });
}

/** Lo que devolvio el modelo, en un mapa id -> texto. */
function mapaDeCeldas(valor: unknown): Map<string, string> {
  const mapa = new Map<string, string>();
  if (!Array.isArray(valor)) return mapa;
  for (const celda of valor) {
    if (typeof celda !== "object" || celda === null) continue;
    const { id, text } = celda as { id?: unknown; text?: unknown };
    if (typeof id === "string" && typeof text === "string") mapa.set(id, text);
  }
  return mapa;
}

/** Revision de la lista que devolvio el modelo, antes de montar la planilla. */
function revisarCeldas(
  valor: { cells?: unknown },
  pedidas: SheetCell[],
  target: Lang,
): string[] {
  const devueltas = mapaDeCeldas(valor?.cells);
  const problemas: string[] = [];

  const faltan = pedidas.filter((celda) => !devueltas.has(celda.id));
  if (faltan.length > 0) {
    problemas.push(
      `faltan ${faltan.length} celda(s): ${faltan.slice(0, 8).map((celda) => celda.id).join(", ")}`,
    );
  }

  for (const celda of pedidas) {
    const traducida = devueltas.get(celda.id);
    if (traducida === undefined) continue;
    if (!traducida.trim()) {
      problemas.push(`${celda.id} volvió vacía ("${celda.text}")`);
      continue;
    }

    const perdidos = tokensPerdidos(celda.text, traducida);
    if (perdidos.length > 0) {
      problemas.push(`${celda.id} perdió ${perdidos.join(", ")} de "${celda.text}"`);
      continue;
    }
    const restos = restosEnEspanol(traducida, target);
    if (restos.length > 0) {
      problemas.push(`${celda.id} quedó en español: ${restos.join(", ")}`);
    }
  }

  return problemas.slice(0, 20);
}
