import type { Lang } from "@/types";

/**
 * Deteccion de idioma por palabras funcionales y caracteres propios del espanol.
 * Es una heuristica local (sin red) suficiente para elegir entre es/en;
 * el usuario siempre puede corregirla manualmente.
 */

const ES_WORDS = new Set([
  "de","la","que","el","en","y","a","los","se","del","las","un","por","con","no",
  "una","su","para","es","al","lo","como","mas","pero","sus","le","ya","o","este",
  "si","porque","esta","entre","cuando","muy","sin","sobre","tambien","me","hasta",
  "hay","donde","quien","desde","todo","nos","durante","todos","uno","les","ni",
  "contra","ese","eso","ante","ellos","yo","tengo","puedo","quiero","gracias",
  "saludos","estimado","estimada","buenos","buenas","dias","tardes","noches",
  "profesor","profesora","clase","trabajo","favor","adjunto","cordial","atentamente",
]);

const EN_WORDS = new Set([
  "the","of","and","to","in","is","you","that","it","he","was","for","on","are",
  "as","with","his","they","i","at","be","this","have","from","or","one","had",
  "by","but","not","what","all","were","we","when","your","can","said","there",
  "use","an","each","which","she","do","how","their","if","will","up","other",
  "about","out","many","then","them","these","so","would","could","should","please",
  "thanks","thank","regards","best","dear","hello","hi","professor","class","work",
  "attached","sincerely","kind",
]);

export interface Detection {
  lang: Lang;
  confident: boolean;
}

export function detectLanguage(input: string): Detection {
  const text = input.trim();
  if (text.length < 3) return { lang: "es", confident: false };

  const normalized = text.toLowerCase();
  const words = normalized
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .match(/[a-z']+/g);

  let es = 0;
  let en = 0;

  if (words) {
    for (const word of words) {
      if (ES_WORDS.has(word)) es += 1;
      if (EN_WORDS.has(word)) en += 1;
    }
  }

  // Caracteres que practicamente solo aparecen en espanol.
  const spanishChars = normalized.match(/[ñáéíóúü¿¡]/g);
  if (spanishChars) es += spanishChars.length * 1.5;

  // Contracciones y posesivos tipicos del ingles.
  const englishMarks = normalized.match(/\b\w+'(?:s|t|re|ve|ll|d|m)\b/g);
  if (englishMarks) en += englishMarks.length;

  const total = es + en;
  if (total === 0) return { lang: "es", confident: false };

  const lang: Lang = es >= en ? "es" : "en";
  const ratio = Math.max(es, en) / total;
  return { lang, confident: total >= 3 && ratio >= 0.65 };
}

/**
 * Idioma de origen real de un texto.
 *
 * El selector manual solo manda mientras la deteccion no esta segura. Si el
 * texto es claramente de otro idioma, gana el texto: procesar un texto en
 * espanol como si fuera ingles no es lo que quiere nadie, y era la causa de
 * que "Traducir" a veces devolviera el mismo texto sin traducir.
 */
export function effectiveSourceLang(selected: Lang, text: string): Lang {
  const detection = detectLanguage(text);
  return detection.confident ? detection.lang : selected;
}
