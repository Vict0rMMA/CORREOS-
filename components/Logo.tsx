import { cn } from "@/lib/utils";

/** Marca de PAULA CORREOS: un avion en vuelo, el correo que despega. */
export function Logo({ className }: { className?: string }) {
  return (
    <span
      aria-hidden
      className={cn(
        "group grid size-9 shrink-0 place-items-center rounded-xl bg-accent text-accent-ink",
        "shadow-[0_2px_8px_-2px_var(--accent-glow)] transition-transform duration-300",
        "hover:-translate-y-0.5 hover:rotate-3",
        className,
      )}
    >
      <svg viewBox="0 0 24 24" className="size-5 rotate-45" fill="currentColor">
        <path d="M12 2.2c.5 0 .9.4 1 .9l.8 5.6 7.6 4.4c.2.1.3.3.3.5v1.5c0 .3-.3.5-.6.4l-7.1-2 -.5 4.6 2.2 1.7c.1.1.2.2.2.4v1.2c0 .3-.3.5-.6.4L12 20.6l-3.3 1.2c-.3.1-.6-.1-.6-.4v-1.2c0-.2.1-.3.2-.4l2.2-1.7-.5-4.6-7.1 2c-.3.1-.6-.1-.6-.4v-1.5c0-.2.1-.4.3-.5l7.6-4.4L11 3.1c.1-.5.5-.9 1-.9Z" />
      </svg>
    </span>
  );
}

/** Linea de ruta discontinua, el hilo visual que une origen y destino. */
export function FlightPath({ className }: { className?: string }) {
  return <span aria-hidden className={cn("flight-path h-px flex-1", className)} />;
}
