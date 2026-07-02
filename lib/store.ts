import { openDB, type IDBPDatabase } from "idb";
import type {
  Progress,
  Card,
  Settings,
  StudyLogEntry,
  ExerciseAttempt,
  ExerciseMark,
  ReviewEvent,
} from "./types";
import { runMigrations, migrateSnapshot } from "./migrations";

const DB_NAME = "matemonstro";
// v3 (spec 06-sync-client): stores adicionais `meta` e `outbox` para
// sincronizacao com o servidor. Criadas de forma idempotente abaixo (nao
// dependem de uma migracao versionada em lib/migrations.ts) para nao exigir
// edicao daquele arquivo, que pertence a outra spec.
const DB_VERSION = 3;

let dbp: Promise<IDBPDatabase> | null = null;

function db() {
  if (typeof window === "undefined") throw new Error("store indisponivel no servidor");
  if (!dbp) {
    dbp = openDB(DB_NAME, DB_VERSION, {
      upgrade(d, oldVersion, newVersion, tx) {
        runMigrations(d, oldVersion, newVersion ?? DB_VERSION, tx);
        // meta: `updatedAt` conhecido por chave (`${domain}::${itemKey}`) —
        // usado para decidir quem vence no merge LWW com o servidor.
        if (!d.objectStoreNames.contains("meta")) d.createObjectStore("meta", { keyPath: "key" });
        // outbox: fila de itens pendentes de push (offline ou deslogado).
        // `put` com o mesmo `id` sobrescreve a entrada anterior, entao um
        // item mutado varias vezes antes do flush so aparece uma vez na fila.
        if (!d.objectStoreNames.contains("outbox")) d.createObjectStore("outbox", { keyPath: "id" });
      },
    });
  }
  return dbp;
}

export const defaultSettings: Settings = {
  minutesPerDay: 60,
  daysPerWeek: 5,
  startDate: Date.now(),
  goalDate: undefined,
  notifications: false,
  onboarded: false,
  // Campos adicionados na v2 — defaults seguros para que toda spec downstream
  // possa ler settings.X sem checagem de undefined.
  requestRetention: 0.9,
  interleave: true,
  parallelTracks: 2,
  maxReviewsPerDay: 120,
  newCardsPerDay: 15,
  calibration: false,
  streakFreezes: 0,
  lastStreakDay: undefined,
  goal: undefined,
  theme: "dark",
};

export interface Snapshot {
  progress: Progress[];
  cards: Card[];
  settings: Settings;
  log: StudyLogEntry[];
  attempts: ExerciseAttempt[];
  marks: ExerciseMark[];
  events: ReviewEvent[];
}

export async function loadSnapshot(): Promise<Snapshot> {
  const d = await db();
  const [progress, cards, log, settings, attempts, marks, events] = await Promise.all([
    d.getAll("progress") as Promise<Progress[]>,
    d.getAll("cards") as Promise<Card[]>,
    d.getAll("log") as Promise<StudyLogEntry[]>,
    d.get("kv", "settings") as Promise<Settings | undefined>,
    d.getAll("attempts") as Promise<ExerciseAttempt[]>,
    d.getAll("marks") as Promise<ExerciseMark[]>,
    d.getAll("events") as Promise<ReviewEvent[]>,
  ]);
  return {
    progress,
    cards,
    log,
    settings: { ...defaultSettings, ...(settings ?? {}) },
    attempts: attempts ?? [],
    marks: marks ?? [],
    events: events ?? [],
  };
}

export async function putProgress(p: Progress) {
  (await db()).put("progress", p);
}

export async function putCards(cards: Card[]) {
  const d = await db();
  const tx = d.transaction("cards", "readwrite");
  await Promise.all([...cards.map((c) => tx.store.put(c)), tx.done]);
}

export async function putCard(c: Card) {
  (await db()).put("cards", c);
}

export async function deleteCards(ids: string[]) {
  const d = await db();
  const tx = d.transaction("cards", "readwrite");
  await Promise.all([...ids.map((id) => tx.store.delete(id)), tx.done]);
}

export async function saveSettings(s: Settings) {
  (await db()).put("kv", s, "settings");
}

export async function putLog(entry: StudyLogEntry) {
  (await db()).put("log", entry);
}

// ---- kv genérico (chaves fora de "settings": histórico de simulados etc.) ----
export async function kvGet<T>(key: string): Promise<T | undefined> {
  return (await db()).get("kv", key) as Promise<T | undefined>;
}
export async function kvSet<T>(key: string, value: T) {
  (await db()).put("kv", value, key);
}

// ---- content (cache do bundle do currículo; keyPath "trackId") ----
export async function contentGet<T>(key: string): Promise<T | undefined> {
  const row = (await (await db()).get("content", key)) as ({ trackId: string } & T) | undefined;
  return row as T | undefined;
}
export async function contentPut(key: string, value: Record<string, unknown>) {
  await (await db()).put("content", { trackId: key, ...value });
}

// ---- attempts (tentativas de exercicio) ----
export async function putAttempt(a: ExerciseAttempt) {
  (await db()).put("attempts", a);
}
export async function getAllAttempts(): Promise<ExerciseAttempt[]> {
  return (await db()).getAll("attempts") as Promise<ExerciseAttempt[]>;
}

// ---- marks (leech / favoritos) ----
export async function putMark(m: ExerciseMark) {
  (await db()).put("marks", m);
}
export async function getAllMarks(): Promise<ExerciseMark[]> {
  return (await db()).getAll("marks") as Promise<ExerciseMark[]>;
}
export async function deleteMark(key: string) {
  (await db()).delete("marks", key);
}

// ---- events (eventos de revisao: predicao/acerto) ----
export async function putEvent(e: ReviewEvent) {
  (await db()).put("events", e);
}
export async function getAllEvents(): Promise<ReviewEvent[]> {
  return (await db()).getAll("events") as Promise<ReviewEvent[]>;
}

export async function exportAll(): Promise<string> {
  const snap = await loadSnapshot();
  return JSON.stringify({ ...snap, _app: "matemonstro", _v: DB_VERSION }, null, 2);
}

export async function importAll(json: string) {
  const parsed = JSON.parse(json);
  const norm = migrateSnapshot(parsed);
  const d = await db();
  const tx = d.transaction(
    ["progress", "cards", "log", "kv", "attempts", "marks", "events"],
    "readwrite"
  );
  await Promise.all([
    tx.objectStore("progress").clear(),
    tx.objectStore("cards").clear(),
    tx.objectStore("log").clear(),
    tx.objectStore("attempts").clear(),
    tx.objectStore("marks").clear(),
    tx.objectStore("events").clear(),
  ]);
  for (const p of norm.progress) tx.objectStore("progress").put(p);
  for (const c of norm.cards) tx.objectStore("cards").put(c);
  for (const l of norm.log) tx.objectStore("log").put(l);
  for (const a of norm.attempts) tx.objectStore("attempts").put(a);
  for (const m of norm.marks) tx.objectStore("marks").put(m);
  for (const e of norm.events) tx.objectStore("events").put(e);
  if (norm.settings) tx.objectStore("kv").put(norm.settings, "settings");
  await tx.done;
}

export async function resetAll() {
  const d = await db();
  const tx = d.transaction(
    ["progress", "cards", "log", "kv", "attempts", "marks", "events", "meta", "outbox"],
    "readwrite"
  );
  await Promise.all([
    tx.objectStore("progress").clear(),
    tx.objectStore("cards").clear(),
    tx.objectStore("log").clear(),
    tx.objectStore("kv").clear(),
    tx.objectStore("attempts").clear(),
    tx.objectStore("marks").clear(),
    tx.objectStore("events").clear(),
    tx.objectStore("meta").clear(),
    tx.objectStore("outbox").clear(),
    tx.done,
  ]);
}

// ---- Sincronizacao (spec 06-sync-client): meta (updatedAt por chave) + outbox ----
//
// `meta` guarda o `updatedAt` mais recente conhecido localmente para cada
// item, por dominio (`progress`, `cards`, `attempts`, `marks`, `events`,
// `studylog`, `settings`). `outbox` e a fila de itens que ainda precisam ser
// enviados ao servidor (offline, deslogado, ou falha de rede); um `put` com
// o mesmo id substitui a entrada anterior, entao a fila nunca duplica o
// mesmo item.

export interface MetaRow {
  key: string; // `${domain}::${itemKey}`
  domain: string;
  itemKey: string;
  updatedAt: number;
}

export interface OutboxRow {
  id: string; // `${domain}::${itemKey}`
  domain: string;
  itemKey: string;
  updatedAt: number;
}

function metaKey(domain: string, itemKey: string): string {
  return `${domain}::${itemKey}`;
}

/** Atualiza apenas o `updatedAt` conhecido (sem enfileirar push) — usado ao
 * aplicar dados que acabaram de chegar do servidor (ja estao sincronizados). */
export async function setMeta(domain: string, itemKey: string, updatedAt: number) {
  const key = metaKey(domain, itemKey);
  await (await db()).put("meta", { key, domain, itemKey, updatedAt } as MetaRow);
}

/** Atualiza o `updatedAt` E enfileira o item para push — usado em toda
 * mutacao local genuina (ou quando o merge LWW decide que o local venceu). */
export async function markDirty(domain: string, itemKey: string, updatedAt: number) {
  const key = metaKey(domain, itemKey);
  const d = await db();
  const tx = d.transaction(["meta", "outbox"], "readwrite");
  tx.objectStore("meta").put({ key, domain, itemKey, updatedAt } as MetaRow);
  tx.objectStore("outbox").put({ id: key, domain, itemKey, updatedAt } as OutboxRow);
  await tx.done;
}

export async function getAllMeta(): Promise<MetaRow[]> {
  return (await db()).getAll("meta") as Promise<MetaRow[]>;
}

export async function getOutbox(): Promise<OutboxRow[]> {
  return (await db()).getAll("outbox") as Promise<OutboxRow[]>;
}

export async function clearOutboxEntries(ids: string[]) {
  const d = await db();
  const tx = d.transaction("outbox", "readwrite");
  await Promise.all([...ids.map((id) => tx.store.delete(id)), tx.done]);
}

export async function clearOutbox() {
  await (await db()).clear("outbox");
}
