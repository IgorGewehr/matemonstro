/*
 * Matemonstro — Service Worker (app-shell, sem dependências).
 *
 * Estratégias:
 *  - Navegações (páginas/rotas): StaleWhileRevalidate, com fallback para a
 *    shell '/' quando offline e a rota não estiver em cache.
 *  - Estáticos same-origin (_next/static, .js, .css, imagens, manifest):
 *    StaleWhileRevalidate.
 *  - KaTeX / fontes / assets cross-origin (CDN, fonts): CacheFirst (imutáveis).
 *
 * Bump a versão para invalidar caches antigos numa nova publicação.
 */
const VERSION = "mm-v1";
const SHELL_CACHE = `${VERSION}-shell`;
const RUNTIME_CACHE = `${VERSION}-runtime`;
const ASSET_CACHE = `${VERSION}-assets`;

// Essencial pré-cacheado no install (best-effort, falhas individuais são ignoradas).
const PRECACHE_URLS = [
  "/",
  "/manifest.webmanifest",
  "/icons/icon-192.png",
  "/icons/icon-512.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(SHELL_CACHE);
      await Promise.allSettled(PRECACHE_URLS.map((u) => cache.add(u)));
      await self.skipWaiting();
    })()
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keep = new Set([SHELL_CACHE, RUNTIME_CACHE, ASSET_CACHE]);
      const keys = await caches.keys();
      await Promise.all(keys.filter((k) => !keep.has(k)).map((k) => caches.delete(k)));
      await self.clients.claim();
    })()
  );
});

function isFontOrKatex(url) {
  return (
    /\.(woff2?|ttf|otf|eot)$/i.test(url.pathname) ||
    url.pathname.includes("katex") ||
    url.hostname.includes("fonts.gstatic.com") ||
    url.hostname.includes("fonts.googleapis.com") ||
    url.hostname.includes("cdn.jsdelivr.net")
  );
}

function isStaticAsset(url) {
  return (
    url.pathname.startsWith("/_next/static/") ||
    url.pathname.startsWith("/icons/") ||
    /\.(js|css|json|webmanifest|png|jpe?g|svg|gif|webp|avif|ico)$/i.test(url.pathname)
  );
}

async function staleWhileRevalidate(request, cacheName) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request);
  const network = fetch(request)
    .then((resp) => {
      if (resp && resp.ok && (resp.type === "basic" || resp.type === "cors")) {
        cache.put(request, resp.clone());
      }
      return resp;
    })
    .catch(() => undefined);
  return cached || (await network) || Response.error();
}

async function cacheFirst(request, cacheName) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request);
  if (cached) return cached;
  try {
    const resp = await fetch(request);
    if (resp && (resp.ok || resp.type === "opaque")) cache.put(request, resp.clone());
    return resp;
  } catch {
    return cached || Response.error();
  }
}

async function handleNavigate(request) {
  const cache = await caches.open(SHELL_CACHE);
  try {
    const resp = await fetch(request);
    if (resp && resp.ok) cache.put(request, resp.clone());
    return resp;
  } catch {
    const cached = await cache.match(request);
    if (cached) return cached;
    const shell = await cache.match("/");
    if (shell) return shell;
    return new Response("Offline. Reabra quando tiver conexão.", {
      status: 503,
      headers: { "Content-Type": "text/plain; charset=utf-8" },
    });
  }
}

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;

  let url;
  try {
    url = new URL(request.url);
  } catch {
    return;
  }
  // Ignora esquemas não-http (chrome-extension, etc.).
  if (url.protocol !== "http:" && url.protocol !== "https:") return;

  // Navegações (documentos/rotas).
  if (request.mode === "navigate") {
    event.respondWith(handleNavigate(request));
    return;
  }

  // Fontes / KaTeX / assets imutáveis cross-origin.
  if (isFontOrKatex(url)) {
    event.respondWith(cacheFirst(request, ASSET_CACHE));
    return;
  }

  // Estáticos same-origin.
  if (url.origin === self.location.origin && isStaticAsset(url)) {
    event.respondWith(staleWhileRevalidate(request, RUNTIME_CACHE));
    return;
  }
});
