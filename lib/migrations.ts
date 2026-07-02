import type { IDBPDatabase, IDBPTransaction } from "idb";

// ---- Migracoes versionadas do IndexedDB ----
//
// Cada entrada do mapa e uma migracao aplicada EM ESCADA a partir de oldVersion:
// para subir de vN para vM roda-se, em ordem, migrations[N+1] ... migrations[M].
// Toda migracao e idempotente (guardas if(!contains)) para tolerar reexecucao.

type UpgradeTx = IDBPTransaction<unknown, string[], "versionchange">;

export type Migration = (db: IDBPDatabase, tx: UpgradeTx) => void;

export const migrations: Record<number, Migration> = {
  // v1: schema original (stores base).
  1: (db) => {
    if (!db.objectStoreNames.contains("progress"))
      db.createObjectStore("progress", { keyPath: "id" });
    if (!db.objectStoreNames.contains("cards"))
      db.createObjectStore("cards", { keyPath: "id" });
    if (!db.objectStoreNames.contains("log"))
      db.createObjectStore("log", { keyPath: "day" });
    if (!db.objectStoreNames.contains("kv")) db.createObjectStore("kv");
  },
  // v2: stores de tentativas/marcacoes/eventos + cache de conteudo, e indice 'due' em cards.
  2: (db, tx) => {
    if (!db.objectStoreNames.contains("attempts"))
      db.createObjectStore("attempts", { keyPath: "id" });
    if (!db.objectStoreNames.contains("marks"))
      db.createObjectStore("marks", { keyPath: "key" });
    if (!db.objectStoreNames.contains("events"))
      db.createObjectStore("events", { keyPath: "id" });
    if (!db.objectStoreNames.contains("content"))
      db.createObjectStore("content", { keyPath: "trackId" });
    // Indice para consultar cartoes vencidos por prazo (usado por specs downstream).
    if (db.objectStoreNames.contains("cards")) {
      const cards = tx.objectStore("cards");
      if (!cards.indexNames.contains("due")) cards.createIndex("due", "due");
    }
  },
};

/**
 * Aplica todas as migracoes necessarias para levar o banco de oldVersion ate newVersion.
 * Chamado de dentro do callback `upgrade` do idb (transacao versionchange ja aberta).
 */
export function runMigrations(
  db: IDBPDatabase,
  oldVersion: number,
  newVersion: number,
  tx: UpgradeTx
): void {
  for (let v = oldVersion + 1; v <= newVersion; v++) {
    const migrate = migrations[v];
    if (migrate) migrate(db, tx);
  }
}

// ---- Normalizacao de backups (importAll) ----

export interface NormalizedBackup {
  progress: unknown[];
  cards: unknown[];
  log: unknown[];
  settings: unknown | undefined;
  attempts: unknown[];
  marks: unknown[];
  events: unknown[];
}

const asArray = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);

/**
 * Normaliza um backup exportado (qualquer versao) para o shape atual antes de gravar.
 * Backups v1 nao possuem attempts/marks/events — os campos ausentes viram arrays vazios,
 * de modo que importar uma base antiga nunca lanca e nunca perde os dados existentes.
 */
export function migrateSnapshot(parsed: unknown): NormalizedBackup {
  const p = (parsed ?? {}) as Record<string, unknown>;
  // `_v` fica disponivel para migracoes de shape futuras (campo -> campo); hoje o
  // shape e aditivo, entao basta garantir os arrays e preservar settings.
  return {
    progress: asArray(p.progress),
    cards: asArray(p.cards),
    log: asArray(p.log),
    settings: p.settings ?? undefined,
    attempts: asArray(p.attempts),
    marks: asArray(p.marks),
    events: asArray(p.events),
  };
}
