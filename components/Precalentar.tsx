"use client";

import { useEffect } from "react";

/**
 * Llama a /api/calentar al abrir la pagina.
 *
 * Asi la primera correccion o traduccion no tiene que esperar a que el
 * servidor arranque: para cuando se pulsa un boton, ya esta despierto.
 */
export function Precalentar() {
  useEffect(() => {
    const lanzar = () => {
      fetch("/api/calentar", { cache: "no-store" })
        // Hay que consumir la respuesta: si no, la conexion se queda abierta.
        .then((respuesta) => respuesta.text())
        .catch(() => {
          // Si falla no pasa nada: era solo para adelantar trabajo.
        });
    };

    // Se espera a que la pagina termine de cargar para no competir con ella.
    if (document.readyState === "complete") lanzar();
    else window.addEventListener("load", lanzar, { once: true });

    return () => window.removeEventListener("load", lanzar);
  }, []);

  return null;
}
