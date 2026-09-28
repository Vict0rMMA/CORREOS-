"use client";

import { useEffect } from "react";

/** Registra el service worker que permite instalar la aplicacion. */
export function ServiceWorker() {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    // En desarrollo estorba: cachearia codigo que cambia a cada rato.
    if (process.env.NODE_ENV !== "production") return;

    const registrar = () => {
      navigator.serviceWorker.register("/sw.js").catch((error) => {
        console.error("[paula] no se pudo registrar el service worker:", error);
      });
    };

    if (document.readyState === "complete") registrar();
    else window.addEventListener("load", registrar, { once: true });
  }, []);

  return null;
}
