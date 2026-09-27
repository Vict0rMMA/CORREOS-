import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/** Tarjeta base de los dos paneles principales. */
export function Panel({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <section
      className={cn(
        "glass flex min-w-0 flex-col overflow-hidden rounded-2xl border border-line shadow-panel",
        className,
      )}
    >
      {children}
    </section>
  );
}

export function PanelHeader({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-14 flex-wrap items-center gap-x-3 gap-y-2 border-b border-line px-4 py-3 sm:px-5">
      {children}
    </div>
  );
}

export function PanelTitle({ children }: { children: ReactNode }) {
  return (
    <h2 className="eyebrow">{children}</h2>
  );
}

export function PanelFooter({ children }: { children: ReactNode }) {
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-2 border-t border-line bg-surface-soft px-3 py-3 sm:px-4">
      {children}
    </div>
  );
}
