"use client";

import { Sparkles } from "lucide-react";
import { ImageAttachments } from "@/components/ImageAttachments";
import { Button } from "@/components/ui/Button";
import { Select } from "@/components/ui/Select";
import { TEXT_TYPES, TONES } from "@/lib/actions";
import type { ReportImage, TextType, Tone } from "@/types";

interface OptionsBarProps {
  tone: Tone;
  onToneChange: (tone: Tone) => void;
  textType: TextType;
  onTextTypeChange: (textType: TextType) => void;
  subject: string;
  onSubjectChange: (subject: string) => void;
  onGenerateSubject: () => void;
  subjectLoading: boolean;
  subjectOptions: string[];
  onPickSubject: (subject: string) => void;
  canGenerateSubject: boolean;
  images: ReportImage[];
  onImagesChange: (images: ReportImage[]) => void;
}

export function OptionsBar({
  tone,
  onToneChange,
  textType,
  onTextTypeChange,
  subject,
  onSubjectChange,
  onGenerateSubject,
  subjectLoading,
  subjectOptions,
  onPickSubject,
  canGenerateSubject,
  images,
  onImagesChange,
}: OptionsBarProps) {
  const isEmail = textType === "email";
  const isReport = textType === "report";

  return (
    <div className="glass print-hidden rounded-2xl border border-line p-3 shadow-panel sm:p-4">
      {/* grid-cols-1 explicito: sin el, la columna implicita toma el ancho
          maximo del <select> y desborda en pantallas estrechas. */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,1.6fr)]">
        <Select label="Tono" value={tone} options={TONES} onChange={onToneChange} />
        <Select
          label="Tipo de texto"
          value={textType}
          options={TEXT_TYPES}
          onChange={onTextTypeChange}
        />

        {isEmail ? (
          <div className="flex flex-col gap-1.5 sm:col-span-2 lg:col-span-1">
            <label
              htmlFor="paula-subject"
              className="eyebrow"
            >
              Asunto
            </label>
            <div className="flex gap-2">
              <input
                id="paula-subject"
                type="text"
                value={subject}
                maxLength={200}
                onChange={(event) => onSubjectChange(event.target.value)}
                placeholder="Asunto del correo (opcional)"
                className="h-9.5 min-w-0 flex-1 rounded-xl border border-line bg-surface px-3 text-sm text-ink outline-none transition-colors hover:border-line-strong placeholder:text-muted/70"
              />
              <Button
                size="md"
                variant="secondary"
                onClick={onGenerateSubject}
                loading={subjectLoading}
                disabled={!canGenerateSubject}
                title="Sugerir 3 asuntos con IA"
                icon={<Sparkles aria-hidden className="size-4" />}
              >
                <span className="hidden sm:inline">Generar asunto</span>
                <span className="sm:hidden">Generar</span>
              </Button>
            </div>
          </div>
        ) : null}
      </div>

      {isReport ? <ImageAttachments images={images} onChange={onImagesChange} /> : null}

      {isEmail && subjectOptions.length > 0 ? (
        <div className="animate-rise mt-3 flex flex-wrap items-center gap-2 border-t border-line pt-3">
          <span className="eyebrow">
            Sugerencias
          </span>
          {subjectOptions.map((option) => (
            <button
              key={option}
              type="button"
              onClick={() => onPickSubject(option)}
              className="rounded-full border border-line bg-surface-soft px-3 py-1.5 text-[13px] text-ink-soft transition-colors hover:border-accent hover:text-ink"
            >
              {option}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
