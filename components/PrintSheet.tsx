import { labels, longDate, photoCaption } from "@/lib/export/i18n";
import { parseSignature, splitClosing } from "@/lib/export/layout";
import { LOGO_PATH } from "@/lib/export/logo";
import { paraExportar } from "@/lib/planilla";
import type { Lang, ReportImage, SheetDoc, SignatureDrawing } from "@/types";

/** Solo visible al imprimir: hoja limpia con titulo, asunto, contenido y fotos. */
export function PrintSheet({
  title,
  subject,
  body,
  lang,
  images,
  sheet = null,
  signature = "",
  signatureImage = null,
  includeLogo = true,
}: {
  title: string;
  subject?: string;
  body: string;
  /** Idioma del documento: el mismo en el que salio el resultado. */
  lang: Lang;
  images?: ReportImage[];
  sheet?: SheetDoc | null;
  signature?: string;
  signatureImage?: SignatureDrawing | null;
  includeLogo?: boolean;
}) {
  const textos = labels(lang);
  const firma = parseSignature(signature);
  const { body: cuerpo, closing } = firma
    ? splitClosing(body, firma.name)
    : { body, closing: null };

  const planilla = sheet ? paraExportar(sheet) : null;
  const datos = [
    planilla?.meta.date && `${textos.date}: ${planilla.meta.date}`,
    planilla?.meta.shift && `${textos.shift}: ${planilla.meta.shift}`,
    planilla?.meta.supervisor && `${textos.supervisor}: ${planilla.meta.supervisor}`,
  ].filter(Boolean) as string[];

  return (
    <div className="print-sheet hidden" aria-hidden>
      {/* La planilla se imprime apaisada, como el Excel y el PDF. */}
      {planilla ? <style>{"@media print { @page { size: A4 landscape } }"}</style> : null}

      {includeLogo ? (
        /* eslint-disable-next-line @next/next/no-img-element */
        <img className="print-logo" src={LOGO_PATH} alt="" />
      ) : null}

      <div className="print-head">
        <h1>{title.toUpperCase()}</h1>
        <span>{longDate(lang)}</span>
      </div>
      {subject ? (
        <p className="print-subject">
          {textos.subject} {subject}
        </p>
      ) : null}

      {planilla ? (
        <>
          {datos.length > 0 ? <p className="print-meta">{datos.join(" · ")}</p> : null}
          {planilla.sections.map((bloque, indiceBloque) => (
            <div key={indiceBloque}>
              {bloque.title ? <h2 className="print-bloque">{bloque.title}</h2> : null}
              <table className="print-table">
                <thead>
                  <tr>
                    {bloque.columns.map((columna, indice) => (
                      <th key={`${columna}-${indice}`}>{columna}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {bloque.rows.map((fila, indiceFila) => (
                    <tr key={indiceFila}>
                      {bloque.columns.map((_, indiceColumna) => (
                        <td key={indiceColumna}>{fila[indiceColumna] ?? ""}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ))}
          {planilla.notes ? (
            <p className="print-notes">
              {textos.notes}: {planilla.notes}
            </p>
          ) : null}
        </>
      ) : (
        <div style={{ whiteSpace: "pre-wrap" }}>{cuerpo}</div>
      )}

      {firma ? (
        <div className="print-sign">
          {closing ? <p className="print-closing">{closing}</p> : null}
          {signatureImage ? (
            /* eslint-disable-next-line @next/next/no-img-element */
            <img className="print-signature" src={signatureImage.dataUrl} alt="" />
          ) : null}
          <span className="print-rule" />
          <p className="print-name">{firma.name}</p>
          {firma.details.map((detail) => (
            <p key={detail} className="print-role">
              {detail}
            </p>
          ))}
        </div>
      ) : null}

      {images && images.length > 0 ? (
        <div className="print-annex">
          <h2>{images.length === 1 ? textos.annex : textos.annexes}</h2>
          {images.map((image, index) => (
            <figure key={image.id}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={image.dataUrl} alt={image.caption || image.name} />
              <figcaption>{photoCaption(index, image.caption, lang)}</figcaption>
            </figure>
          ))}
        </div>
      ) : null}
    </div>
  );
}
