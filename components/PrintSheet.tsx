import { APP_NAME } from "@/lib/config";
import { withSignature } from "@/lib/utils";
import type { ReportImage } from "@/types";

/** Solo visible al imprimir: hoja limpia con titulo, asunto, contenido y fotos. */
export function PrintSheet({
  title,
  subject,
  body,
  images,
  signature = "",
}: {
  title: string;
  subject?: string;
  body: string;
  images?: ReportImage[];
  signature?: string;
}) {
  return (
    <div className="print-sheet hidden" aria-hidden>
      <h1>{title}</h1>
      {subject ? <p className="print-subject">Asunto: {subject}</p> : null}
      <div style={{ whiteSpace: "pre-wrap" }}>{withSignature(body, signature)}</div>

      {images && images.length > 0 ? (
        <div className="print-annex">
          <h2>{images.length === 1 ? "Anexo fotográfico" : "Anexos fotográficos"}</h2>
          {images.map((image, index) => (
            <figure key={image.id}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={image.dataUrl} alt={image.caption || image.name} />
              <figcaption>
                {image.caption ? `Foto ${index + 1}. ${image.caption}` : `Foto ${index + 1}`}
              </figcaption>
            </figure>
          ))}
        </div>
      ) : null}

      <p className="print-footer">{APP_NAME}</p>
    </div>
  );
}
