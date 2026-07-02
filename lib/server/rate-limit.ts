import "server-only";

// Rate-limit em memória (janela deslizante). Suficiente para o deploy
// single-node deste app (SQLite local); num cluster precisaria de um store
// compartilhado. Limpeza incremental a cada chamada para não vazar memória.

const buckets = new Map<string, number[]>();
let lastSweep = 0;

function sweep(now: number, windowMs: number) {
  // varre no máximo 1x/minuto
  if (now - lastSweep < 60_000) return;
  lastSweep = now;
  for (const [key, arr] of buckets) {
    const alive = arr.filter((t) => now - t < windowMs);
    if (alive.length === 0) buckets.delete(key);
    else buckets.set(key, alive);
  }
}

/**
 * Registra uma tentativa e devolve se ela é permitida.
 * `key` deve identificar o alvo (ex.: `login:<ip>:<email>`).
 */
export function rateLimit(key: string, max: number, windowMs: number): boolean {
  const now = Date.now();
  sweep(now, windowMs);
  const arr = (buckets.get(key) ?? []).filter((t) => now - t < windowMs);
  if (arr.length >= max) {
    buckets.set(key, arr);
    return false;
  }
  arr.push(now);
  buckets.set(key, arr);
  return true;
}

/** IP do cliente a partir dos headers de proxy (fallback "local"). */
export function clientIp(request: Request): string {
  const fwd = request.headers.get("x-forwarded-for");
  if (fwd) return fwd.split(",")[0].trim();
  return request.headers.get("x-real-ip") ?? "local";
}
