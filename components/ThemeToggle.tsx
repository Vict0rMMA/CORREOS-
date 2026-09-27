"use client";

import { useEffect, useState } from "react";
import { Moon, Sun } from "lucide-react";
import { STORAGE_KEYS } from "@/lib/config";

/** Alterna claro/oscuro y lo recuerda en localStorage. */
export function ThemeToggle() {
  const [dark, setDark] = useState(false);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    setDark(document.documentElement.classList.contains("dark"));
    setReady(true);
  }, []);

  const toggle = () => {
    const next = !dark;
    setDark(next);
    document.documentElement.classList.toggle("dark", next);
    try {
      window.localStorage.setItem(STORAGE_KEYS.theme, next ? "dark" : "light");
    } catch {
      /* ignorado */
    }
  };

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={dark ? "Activar tema claro" : "Activar tema oscuro"}
      title={dark ? "Tema claro" : "Tema oscuro"}
      className="grid size-9 place-items-center rounded-xl border border-line bg-surface text-ink-soft transition-colors hover:border-line-strong hover:text-ink"
    >
      {ready && dark ? (
        <Sun aria-hidden className="size-4.5" />
      ) : (
        <Moon aria-hidden className="size-4.5" />
      )}
    </button>
  );
}
