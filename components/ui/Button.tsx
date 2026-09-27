"use client";

import type { ButtonHTMLAttributes, ReactNode } from "react";
import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

type Variant = "primary" | "secondary" | "ghost" | "quiet";
type Size = "sm" | "md" | "lg";

const VARIANTS: Record<Variant, string> = {
  primary:
    "bg-accent text-accent-ink hover:brightness-[1.08] active:brightness-95 " +
    // Brillo interior arriba + sombra del color del acento: da volumen sin gradiente evidente.
    "shadow-[inset_0_1px_0_rgb(255_255_255/0.18),0_1px_2px_rgb(14_26_43/0.16),0_6px_16px_-8px_var(--accent-glow)]",
  secondary:
    "bg-surface text-ink border border-line hover:border-line-strong hover:bg-surface-soft " +
    "shadow-[0_1px_1px_rgb(14_26_43/0.03)]",
  ghost: "text-ink-soft hover:bg-surface-soft hover:text-ink",
  quiet:
    "bg-surface-soft text-ink-soft border border-transparent hover:border-line hover:text-ink",
};

const SIZES: Record<Size, string> = {
  sm: "h-8.5 px-3 text-[13px] gap-1.5 rounded-[10px]",
  md: "h-10 px-4 text-sm gap-2 rounded-xl",
  lg: "h-11 px-5 text-[15px] gap-2 rounded-xl",
};

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  loading?: boolean;
  icon?: ReactNode;
}

export function Button({
  variant = "secondary",
  size = "md",
  loading = false,
  icon,
  className,
  children,
  disabled,
  ...rest
}: ButtonProps) {
  return (
    <button
      type="button"
      disabled={disabled || loading}
      className={cn(
        "inline-flex select-none items-center justify-center whitespace-nowrap font-medium",
        "transition-[background-color,border-color,color,transform,filter] duration-150",
        "active:scale-[0.985] disabled:pointer-events-none disabled:opacity-45",
        VARIANTS[variant],
        SIZES[size],
        className,
      )}
      {...rest}
    >
      {loading ? (
        <Loader2 aria-hidden className="size-4 animate-spin" />
      ) : (
        icon
      )}
      {children}
    </button>
  );
}
