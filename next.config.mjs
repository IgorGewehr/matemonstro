import path from "node:path";

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Build standalone (necessario para o Dockerfile copiar .next/standalone/server.js).
  output: "standalone",
  // better-sqlite3 e um modulo nativo: nao deve ser parseado/bundlado pelo webpack.
  serverExternalPackages: ["better-sqlite3"],
  // Fixa a raiz do projeto (evita o aviso de multiplos lockfiles no ambiente).
  outputFileTracingRoot: import.meta.dirname ?? path.dirname(new URL(import.meta.url).pathname),
  // PWA: permite que o service worker registre com escopo raiz e nao seja
  // cacheado agressivamente (spec 12).
  async headers() {
    return [
      {
        source: "/sw.js",
        headers: [
          { key: "Service-Worker-Allowed", value: "/" },
          { key: "Cache-Control", value: "public, max-age=0, must-revalidate" },
        ],
      },
    ];
  },
};

export default nextConfig;
