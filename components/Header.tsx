"use client";

import { Settings } from "lucide-react";
import { FlightPath, Logo } from "@/components/Logo";
import { ThemeToggle } from "@/components/ThemeToggle";
import { APP_NAME, APP_TAGLINE } from "@/lib/config";

export function Header({ onOpenSettings }: { onOpenSettings: () => void }) {
  return (
    <header className="print-hidden sticky top-0 z-30 border-b border-line bg-canvas/85 backdrop-blur-md">
      <div className="mx-auto flex h-16 w-full max-w-[1400px] items-center gap-3 px-4 sm:px-6">
        <Logo />
        <div className="min-w-0">
          <p className="title-serif truncate text-[23px] text-ink">{APP_NAME}</p>
          <p className="hidden truncate text-[11px] tracking-[0.02em] text-muted sm:block">
            {APP_TAGLINE}
          </p>
        </div>

        <FlightPath className="mx-4 hidden sm:block" />

        <div className="ml-auto flex items-center gap-2">
          <ThemeToggle />
          <button
            type="button"
            onClick={onOpenSettings}
            aria-label="Abrir configuración"
            title="Configuración"
            className="grid size-9 place-items-center rounded-xl border border-line bg-surface text-ink-soft transition-colors hover:border-line-strong hover:text-ink"
          >
            <Settings aria-hidden className="size-4.5" />
          </button>
        </div>
      </div>
    </header>
  );
}
