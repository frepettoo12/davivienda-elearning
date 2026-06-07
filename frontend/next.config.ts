import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Permite levantar una 2ª instancia de `next dev` (otro puerto) con su propio
  // directorio de build → evita el lock "Another next dev server is already running".
  // Uso: NEXT_DISTDIR=.next-solicitante next dev -p 3001
  distDir: process.env.NEXT_DISTDIR || ".next",
};

export default nextConfig;
