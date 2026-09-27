"use client";

import { useRef, useState } from "react";
import { ImagePlus, Loader2, X } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { useToast } from "@/components/ui/Toast";
import { ACCEPTED_TYPES, MAX_IMAGES, prepareImage } from "@/lib/images";
import { cn } from "@/lib/utils";
import type { ReportImage } from "@/types";

interface ImageAttachmentsProps {
  images: ReportImage[];
  onChange: (images: ReportImage[]) => void;
}

/** Fotos del reporte: se adjuntan aqui y salen en Word, PDF e impresion. */
export function ImageAttachments({ images, onChange }: ImageAttachmentsProps) {
  const { toast } = useToast();
  const inputRef = useRef<HTMLInputElement>(null);
  const [loading, setLoading] = useState(false);
  const [dragging, setDragging] = useState(false);

  const addFiles = async (files: FileList | File[]) => {
    const list = Array.from(files);
    if (list.length === 0) return;

    const room = MAX_IMAGES - images.length;
    if (room <= 0) {
      toast(`Máximo ${MAX_IMAGES} fotos por reporte`, "info");
      return;
    }

    setLoading(true);
    const added: ReportImage[] = [];
    for (const file of list.slice(0, room)) {
      try {
        added.push(await prepareImage(file));
      } catch (error) {
        console.error("[paula] no se pudo adjuntar la foto:", error);
        toast(error instanceof Error ? error.message : "No pudimos adjuntar la foto", "error");
      }
    }
    setLoading(false);

    if (added.length > 0) {
      onChange([...images, ...added]);
      toast(added.length === 1 ? "Foto adjuntada" : `${added.length} fotos adjuntadas`);
    }
    if (list.length > room) {
      toast(`Solo caben ${MAX_IMAGES} fotos; las demás no se agregaron`, "info");
    }
  };

  const remove = (id: string) => onChange(images.filter((image) => image.id !== id));

  const setCaption = (id: string, caption: string) =>
    onChange(images.map((image) => (image.id === id ? { ...image, caption } : image)));

  return (
    <div
      onDragOver={(event) => {
        event.preventDefault();
        setDragging(true);
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={(event) => {
        event.preventDefault();
        setDragging(false);
        void addFiles(event.dataTransfer.files);
      }}
      className={cn(
        "mt-3 rounded-xl border border-dashed border-line-strong p-3 transition-colors",
        dragging && "border-accent bg-accent-soft/50",
      )}
    >
      <div className="flex flex-wrap items-center gap-2">
        <span className="eyebrow">
          Fotos del reporte
        </span>
        <span className="text-[11px] tabular-nums text-muted">
          {images.length}/{MAX_IMAGES}
        </span>
        <Button
          size="sm"
          variant="secondary"
          className="ml-auto"
          onClick={() => inputRef.current?.click()}
          loading={loading}
          disabled={images.length >= MAX_IMAGES}
          icon={<ImagePlus aria-hidden className="size-4" />}
        >
          Agregar fotos
        </Button>
        <input
          ref={inputRef}
          type="file"
          accept={ACCEPTED_TYPES}
          multiple
          className="sr-only"
          aria-label="Agregar fotos al reporte"
          onChange={(event) => {
            if (event.target.files) void addFiles(event.target.files);
            event.target.value = "";
          }}
        />
      </div>

      {images.length === 0 ? (
        <p className="mt-2 text-xs leading-relaxed text-muted">
          {loading ? (
            <span className="inline-flex items-center gap-1.5">
              <Loader2 aria-hidden className="size-3.5 animate-spin" /> Procesando...
            </span>
          ) : (
            "Arrastra las fotos aquí o pulsa Agregar. Saldrán en el Word, el PDF y la impresión, con su pie de foto. No se guardan al cerrar la página."
          )}
        </p>
      ) : (
        <ul className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {images.map((image, index) => (
            <li
              key={image.id}
              className="animate-rise overflow-hidden rounded-lg border border-line bg-surface-soft"
            >
              <div className="relative">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={image.dataUrl}
                  alt={image.caption || image.name}
                  className="h-24 w-full object-cover"
                />
                <button
                  type="button"
                  onClick={() => remove(image.id)}
                  aria-label={`Quitar ${image.name}`}
                  className="absolute right-1 top-1 grid size-6 place-items-center rounded-md bg-black/55 text-white transition-colors hover:bg-black/75"
                >
                  <X aria-hidden className="size-3.5" />
                </button>
                <span className="absolute left-1 top-1 rounded-md bg-black/55 px-1.5 text-[10px] font-medium text-white">
                  {index + 1}
                </span>
              </div>
              <input
                type="text"
                value={image.caption}
                maxLength={120}
                onChange={(event) => setCaption(image.id, event.target.value)}
                placeholder="Pie de foto"
                aria-label={`Pie de foto ${index + 1}`}
                className="w-full border-t border-line bg-transparent px-2 py-1.5 text-[12px] text-ink outline-none placeholder:text-muted/70"
              />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
