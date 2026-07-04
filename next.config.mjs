import path from "node:path";

// Dual-target: BUILD_TARGET=desktop gera export estático (out/) consumido pelo
// Tauri; sem a env var, o build web continua standalone (Docker) byte-equivalente
// ao que sempre foi. Regra do projeto: divergência entre os dois alvos SÓ aqui e
// em lib/platform.ts (runtime).
const isDesktop = process.env.BUILD_TARGET === "desktop";
const root = import.meta.dirname ?? path.dirname(new URL(import.meta.url).pathname);

/** @type {import('next').NextConfig} */
const nextConfig = isDesktop
  ? {
      reactStrictMode: true,
      // Export estático para o asset protocol do Tauri.
      output: "export",
      // Deep-link robusto (hard reload de /trilha/x/ acha o index.html do shell).
      trailingSlash: true,
      outputFileTracingRoot: root,
    }
  : {
      reactStrictMode: true,
      // Build standalone (necessario para o Dockerfile copiar .next/standalone/server.js).
      output: "standalone",
      // better-sqlite3 e um modulo nativo: nao deve ser parseado/bundlado pelo webpack.
      serverExternalPackages: ["better-sqlite3"],
      // Fixa a raiz do projeto (evita o aviso de multiplos lockfiles no ambiente).
      outputFileTracingRoot: root,
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
      async redirects() {
        // /notas/[id] virou /notas/nota?id= (export estático não pré-renderiza
        // ids de runtime). Preserva bookmarks antigos sem capturar as rotas
        // estáticas /notas/grafo e /notas/nota.
        return [
          {
            source: "/notas/:id((?!grafo$|nota$)[^/]+)",
            destination: "/notas/nota?id=:id",
            permanent: false,
          },
        ];
      },
    };

export default nextConfig;
