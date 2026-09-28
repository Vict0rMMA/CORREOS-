/**
 * Service worker minimo.
 *
 * Su unico objetivo es que el navegador permita instalar la aplicacion y que,
 * sin conexion, se abra igual para poder consultar lo guardado.
 *
 * Siempre intenta la red primero, asi que nunca se queda con una version
 * vieja: la cache es solo el paracaidas.
 */

const CACHE = "paula-v1";
const SHELL = ["/", "/manifest.webmanifest", "/icon-192.png", "/icon-512.png"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE).then((cache) => cache.addAll(SHELL)).then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;

  // Las peticiones a la IA nunca se guardan ni se sirven de la cache.
  if (request.method !== "GET" || new URL(request.url).pathname.startsWith("/api/")) return;

  event.respondWith(
    fetch(request)
      .then((response) => {
        if (response.ok && new URL(request.url).origin === self.location.origin) {
          const copia = response.clone();
          caches.open(CACHE).then((cache) => cache.put(request, copia));
        }
        return response;
      })
      .catch(async () => {
        const guardada = await caches.match(request);
        if (guardada) return guardada;
        // Sin conexion y sin copia: al menos se abre la pagina principal.
        if (request.mode === "navigate") {
          const inicio = await caches.match("/");
          if (inicio) return inicio;
        }
        return Response.error();
      }),
  );
});
