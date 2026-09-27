import path from "node:path";
import { fileURLToPath } from "node:url";
import type { NextConfig } from "next";

const projectRoot = path.dirname(fileURLToPath(import.meta.url));

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // Fija la raiz del proyecto: evita que Turbopack suba al directorio del usuario
  // si encuentra un package-lock.json por encima de esta carpeta.
  turbopack: { root: projectRoot },
};

export default nextConfig;
