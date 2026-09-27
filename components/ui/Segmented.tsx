"use client";

import { cn } from "@/lib/utils";

interface SegmentedProps<T extends string> {
  value: T;
  options: readonly { id: T; label: string }[];
  onChange: (value: T) => void;
  ariaLabel: string;
  className?: string;
}

export function Segmented<T extends string>({
  value,
  options,
  onChange,
  ariaLabel,
  className,
}: SegmentedProps<T>) {
  return (
    <div
      role="radiogroup"
      aria-label={ariaLabel}
      className={cn(
        "inline-flex rounded-xl border border-line bg-surface-soft p-1",
        className,
      )}
    >
      {options.map((option) => {
        const active = option.id === value;
        return (
          <button
            key={option.id}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => onChange(option.id)}
            className={cn(
              "rounded-[9px] px-3.5 py-2.5 text-[13px] font-medium transition-all duration-200 sm:py-1.5",
              active
                ? "bg-surface text-ink shadow-[0_1px_2px_rgb(14_26_43/0.10),0_0_0_1px_rgb(14_26_43/0.04)]"
                : "text-muted hover:text-ink",
            )}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
