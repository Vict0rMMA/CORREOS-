"use client";

import { ChevronDown } from "lucide-react";
import { useId } from "react";
import { cn } from "@/lib/utils";

export interface SelectOption<T extends string> {
  id: T;
  label: string;
}

interface SelectProps<T extends string> {
  label: string;
  value: T;
  options: readonly SelectOption<T>[];
  onChange: (value: T) => void;
  className?: string;
}

export function Select<T extends string>({
  label,
  value,
  options,
  onChange,
  className,
}: SelectProps<T>) {
  const id = useId();

  return (
    <div className={cn("flex min-w-0 flex-col gap-1.5", className)}>
      <label
        htmlFor={id}
        className="eyebrow"
      >
        {label}
      </label>
      <div className="relative">
        <select
          id={id}
          value={value}
          onChange={(event) => onChange(event.target.value as T)}
          className={cn(
            // min-w-0: un <select> nativo no baja de la anchura de su opcion mas
            // larga y desbordaria la pantalla en moviles estrechos.
            "h-9.5 w-full min-w-0 cursor-pointer appearance-none rounded-xl border border-line bg-surface",
            "pl-3 pr-8 text-sm text-ink transition-colors hover:border-line-strong",
          )}
        >
          {options.map((option) => (
            <option key={option.id} value={option.id}>
              {option.label}
            </option>
          ))}
        </select>
        <ChevronDown
          aria-hidden
          className="pointer-events-none absolute right-2.5 top-1/2 size-4 -translate-y-1/2 text-muted"
        />
      </div>
    </div>
  );
}
