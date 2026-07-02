// ---- Sincronizacao cliente <-> servidor (spec 06-sync-client) ----
//
// Camada fina de rede (pull/push) + utilitarios genericos de merge LWW
// (last-write-wins por `updatedAt`) usados por components/AppState.tsx.
//
// Este modulo e client-only (usa fetch/navigator) mas nao depende de nenhuma
// API exclusiva de browser no import-time, entao pode ser importado com
// seguranca tanto em componentes client quanto (em teoria) em testes node.

import type {
  Progress,
  Card,
  Settings,
  StudyLogEntry,
  ExerciseAttempt,
  ExerciseMark,
  ReviewEvent,
} from "./types";

// Todo item trafegado com o servidor carrega seu proprio `updatedAt` (LWW),
// mesmo que o tipo local (lib/types.ts) ainda nao declare esse campo — ver
// nota de integracao no retorno desta spec sobre adicionar `updatedAt?`
// opcional aos tipos correspondentes.
export type Synced<T> = T & { updatedAt: number };

export type Domain = "progress" | "cards" | "attempts" | "marks" | "events" | "studylog" | "settings";

export interface StatePatch {
  progress?: Synced<Progress>[];
  cards?: Synced<Card>[];
  settings?: Synced<Settings>;
  studylog?: Synced<StudyLogEntry>[];
  attempts?: Synced<ExerciseAttempt>[];
  marks?: Synced<ExerciseMark>[];
  events?: Synced<ReviewEvent>[];
}

export interface StatePullResult {
  progress: Synced<Progress>[];
  cards: Synced<Card>[];
  settings: Synced<Settings> | null;
  studylog: Synced<StudyLogEntry>[];
  attempts: Synced<ExerciseAttempt>[];
  marks: Synced<ExerciseMark>[];
  events: Synced<ReviewEvent>[];
}

export interface PushResult {
  ok: true;
  serverTime: number;
}

/**
 * GET /api/state. Retorna `null` quando nao ha sessao (401) — chamador deve
 * tratar como "nada a sincronizar" sem lancar erro (usuario deslogado).
 */
export async function pullState(): Promise<StatePullResult | null> {
  const res = await fetch("/api/state", { credentials: "include" });
  if (res.status === 401) return null;
  if (!res.ok) throw new Error(`pullState: HTTP ${res.status}`);
  return (await res.json()) as StatePullResult;
}

/**
 * POST /api/state com um patch parcial. Retorna `null` em 401 (sessao caiu
 * entre o enfileiramento e o flush — outbox permanece intacta para retry
 * apos novo login).
 */
export async function pushState(patch: StatePatch): Promise<PushResult | null> {
  if (!Object.keys(patch).length) return { ok: true, serverTime: Date.now() };
  const res = await fetch("/api/state", {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(patch),
  });
  if (res.status === 401) return null;
  if (!res.ok) throw new Error(`pushState: HTTP ${res.status}`);
  return (await res.json()) as PushResult;
}

export function isOnline(): boolean {
  return typeof navigator === "undefined" ? true : navigator.onLine;
}

/**
 * Resultado de mesclar o snapshot local com o que veio do servidor para UM
 * dominio: `merged` e o mapa final (chave -> item com updatedAt) que deve
 * ser gravado de volta no IndexedDB local, e `dirty` sao as chaves em que o
 * LOCAL venceu (mais novo, ou o servidor nunca teve aquele item) — precisam
 * ser reenviadas ao servidor (outbox) para convergir.
 */
export interface MergeResult<T> {
  merged: Map<string, Synced<T>>;
  dirty: string[];
}

/**
 * Merge LWW generico por chave. `localMeta` e o `updatedAt` conhecido de
 * cada chave local (persistido na store `meta` do IndexedDB); quando ausente
 * assume-se `0` para itens vindos do servidor (servidor sempre vence contra
 * um item local nunca rastreado) e `now` para itens so-locais (nunca
 * sincronizados; precisam subir).
 */
export function mergeDomain<T>(
  keyOf: (item: T) => string,
  localMap: Map<string, T>,
  localMeta: Map<string, number>,
  remoteItems: Synced<T>[],
  now: number
): MergeResult<T> {
  const merged = new Map<string, Synced<T>>();

  for (const remote of remoteItems) {
    const key = keyOf(remote);
    const localUpdatedAt = localMeta.get(key) ?? 0;
    if (remote.updatedAt >= localUpdatedAt) {
      merged.set(key, remote);
    }
    // Senao: o local e mais novo — mantido abaixo, no loop de `localMap`.
  }

  const dirty: string[] = [];
  for (const [key, item] of localMap) {
    if (merged.has(key)) continue; // servidor ja venceu para esta chave
    const updatedAt = localMeta.get(key) ?? now;
    merged.set(key, { ...(item as object), updatedAt } as Synced<T>);
    dirty.push(key);
  }

  return { merged, dirty };
}

/** Mesma logica de mergeDomain, mas para um blob singleton (settings). */
export function mergeSingleton<T>(
  local: T | null,
  localUpdatedAt: number | undefined,
  remote: Synced<T> | null,
  now: number
): { merged: Synced<T> | null; dirty: boolean } {
  if (!remote) {
    if (!local) return { merged: null, dirty: false };
    return { merged: { ...(local as object), updatedAt: localUpdatedAt ?? now } as Synced<T>, dirty: true };
  }
  if (!local) return { merged: remote, dirty: false };
  const localAt = localUpdatedAt ?? 0;
  if (remote.updatedAt >= localAt) return { merged: remote, dirty: false };
  return { merged: { ...(local as object), updatedAt: localAt } as Synced<T>, dirty: true };
}

/** Remove o campo `updatedAt` antes de gravar de volta no shape local (lib/types.ts). */
export function stripUpdatedAt<T extends object>(item: Synced<T>): T {
  const { updatedAt, ...rest } = item as Synced<T> & Record<string, unknown>;
  void updatedAt;
  return rest as T;
}

/**
 * Agendador de push com debounce simples (~1.5s por padrao). Cada `schedule()`
 * reinicia o timer; `flushNow()` cancela o timer pendente e executa na hora
 * (usado ao sair da pagina / logout).
 */
export function createPushScheduler(flush: () => void, delayMs = 1500) {
  let timer: ReturnType<typeof setTimeout> | null = null;
  return {
    schedule() {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        timer = null;
        flush();
      }, delayMs);
    },
    cancel() {
      if (timer) {
        clearTimeout(timer);
        timer = null;
      }
    },
    flushNow() {
      if (timer) {
        clearTimeout(timer);
        timer = null;
      }
      flush();
    },
  };
}

export type SyncStatus = "offline" | "disabled" | "idle" | "syncing" | "error";
