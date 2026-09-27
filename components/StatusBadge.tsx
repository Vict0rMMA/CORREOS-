import { AlertCircle, Check, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Status } from "@/types";

const LABELS: Partial<Record<Status, string>> = {
  loading: "Procesando...",
  done: "Listo",
  error: "Error",
  copied: "Copiado",
  empty: "Sin texto",
};

export function StatusBadge({ status }: { status: Status }) {
  const label = LABELS[status];
  if (!label) return null;

  return (
    <span
      role="status"
      className={cn(
        "animate-fade inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] font-medium",
        status === "error"
          ? "bg-danger/10 text-danger"
          : status === "loading"
            ? "bg-accent-soft text-accent"
            : "bg-surface-soft text-muted",
      )}
    >
      {status === "loading" ? (
        <Loader2 aria-hidden className="size-3 animate-spin" />
      ) : status === "error" ? (
        <AlertCircle aria-hidden className="size-3" />
      ) : status === "done" || status === "copied" ? (
        <Check aria-hidden className="size-3 text-success" />
      ) : null}
      {label}
    </span>
  );
}
