import "server-only";

import { and, eq } from "drizzle-orm";
import { getDb } from "@/lib/server/db/client";
import { state as stateTable } from "@/lib/server/db/schema";

/**
 * Dominios de estado suportados pela tabela `state`, conforme o CONTRATO.
 * `settings` e um blob unico por usuario (item_key = "").
 */
export type StateDomain =
  | "progress"
  | "cards"
  | "settings"
  | "studylog"
  | "attempts"
  | "marks"
  | "events";

const LIST_DOMAINS: Exclude<StateDomain, "settings">[] = [
  "progress",
  "cards",
  "studylog",
  "attempts",
  "marks",
  "events",
];

/**
 * Um item de estado e um objeto JSON arbitrario (reflete os tipos de
 * lib/types.ts: Progress, Card, Settings, StudyLogEntry, ExerciseAttempt,
 * ExerciseMark, ReviewEvent) que sempre carrega `updatedAt` para LWW.
 */
export interface StateItem {
  updatedAt?: number;
  [key: string]: unknown;
}

export interface StateResponse {
  progress: StateItem[];
  cards: StateItem[];
  settings: StateItem | null;
  studylog: StateItem[];
  attempts: StateItem[];
  marks: StateItem[];
  events: StateItem[];
}

export interface StatePatch {
  progress?: StateItem[];
  cards?: StateItem[];
  settings?: StateItem;
  studylog?: StateItem[];
  attempts?: StateItem[];
  marks?: StateItem[];
  events?: StateItem[];
}

type StateRow = typeof stateTable.$inferSelect;

/**
 * Deriva a chave (item_key) de um item dentro de um dominio, seguindo as
 * convencoes de lib/types.ts:
 * - progress: Progress.id (subtopic id)
 * - cards: Card.id
 * - attempts: ExerciseAttempt.id
 * - events: ReviewEvent.id
 * - marks: ExerciseMark.key
 * - studylog: StudyLogEntry.day (YYYY-MM-DD)
 */
function keyOf(domain: Exclude<StateDomain, "settings">, item: StateItem): string | null {
  switch (domain) {
    case "progress":
    case "cards":
    case "attempts":
    case "events":
      return typeof item.id === "string" || typeof item.id === "number" ? String(item.id) : null;
    case "marks":
      return typeof item.key === "string" || typeof item.key === "number" ? String(item.key) : null;
    case "studylog":
      return typeof item.day === "string" ? item.day : null;
    default:
      return null;
  }
}

function parseRow(row: StateRow): StateItem {
  let parsed: Record<string, unknown> = {};
  try {
    const raw = JSON.parse(row.data as unknown as string);
    if (raw && typeof raw === "object") parsed = raw as Record<string, unknown>;
  } catch {
    parsed = {};
  }
  // `updated_at` (coluna) e sempre a fonte da verdade para LWW/serializacao.
  return { ...parsed, updatedAt: row.updatedAt as unknown as number };
}

function listDomain(userId: string, domain: Exclude<StateDomain, "settings">): StateItem[] {
  const rows = getDb()
    .select()
    .from(stateTable)
    .where(and(eq(stateTable.userId, userId), eq(stateTable.domain, domain)))
    .all() as StateRow[];
  return rows.map(parseRow);
}

function getSettingsRow(userId: string): StateRow | undefined {
  return getDb()
    .select()
    .from(stateTable)
    .where(
      and(
        eq(stateTable.userId, userId),
        eq(stateTable.domain, "settings"),
        eq(stateTable.itemKey, "")
      )
    )
    .get() as StateRow | undefined;
}

/** Retorna todo o estado do usuario, no formato exigido pelo CONTRATO. */
export function getState(userId: string): StateResponse {
  const settingsRow = getSettingsRow(userId);
  return {
    progress: listDomain(userId, "progress"),
    cards: listDomain(userId, "cards"),
    settings: settingsRow ? parseRow(settingsRow) : null,
    studylog: listDomain(userId, "studylog"),
    attempts: listDomain(userId, "attempts"),
    marks: listDomain(userId, "marks"),
    events: listDomain(userId, "events"),
  };
}

/**
 * Upsert de um item por (userId, domain, itemKey) com estrategia LWW:
 * so grava se o updatedAt recebido for >= o armazenado.
 */
function upsertItem(
  userId: string,
  domain: StateDomain,
  itemKey: string,
  item: StateItem,
  fallbackNow: number
): void {
  const incomingUpdatedAt =
    typeof item.updatedAt === "number" ? item.updatedAt : fallbackNow;

  const existing = getDb()
    .select()
    .from(stateTable)
    .where(
      and(
        eq(stateTable.userId, userId),
        eq(stateTable.domain, domain),
        eq(stateTable.itemKey, itemKey)
      )
    )
    .get() as StateRow | undefined;

  if (existing && (existing.updatedAt as unknown as number) > incomingUpdatedAt) {
    // Versao armazenada e mais nova: ignora o patch (Last-Write-Wins).
    return;
  }

  const data = JSON.stringify(item);

  if (existing) {
    getDb()
      .update(stateTable)
      .set({ data, updatedAt: incomingUpdatedAt })
      .where(
        and(
          eq(stateTable.userId, userId),
          eq(stateTable.domain, domain),
          eq(stateTable.itemKey, itemKey)
        )
      )
      .run();
  } else {
    getDb()
      .insert(stateTable)
      .values({ userId, domain, itemKey, data, updatedAt: incomingUpdatedAt })
      .run();
  }
}

/**
 * Aplica um patch parcial de estado do usuario. Cada item de cada dominio
 * (e o blob de settings) e upsertado individualmente respeitando LWW.
 * O userId SEMPRE vem da sessao (chamador), nunca do corpo da requisicao.
 */
export function applyPatch(
  userId: string,
  patch: StatePatch
): { ok: true; serverTime: number } {
  const now = Date.now();

  for (const domain of LIST_DOMAINS) {
    const items = patch[domain];
    if (!Array.isArray(items)) continue;
    for (const item of items) {
      if (!item || typeof item !== "object") continue;
      const itemKey = keyOf(domain, item as StateItem);
      if (itemKey === null) continue;
      upsertItem(userId, domain, itemKey, item as StateItem, now);
    }
  }

  if (patch.settings && typeof patch.settings === "object") {
    upsertItem(userId, "settings", "", patch.settings, now);
  }

  return { ok: true, serverTime: now };
}
