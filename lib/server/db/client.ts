import "server-only";
import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { ensureSchema } from "./migrate";
import * as schema from "./schema";

declare global {
  // eslint-disable-next-line no-var
  var __matemonstroSqlite: Database.Database | undefined;
}

// Caches em nivel de modulo: validos pela vida do processo (dev e prod).
let sqliteInstance: Database.Database | undefined;
let dbInstance: ReturnType<typeof drizzle<typeof schema>> | undefined;

/**
 * Abre (ou reaproveita) a conexao sqlite e roda o init idempotente do schema.
 * IMPORTANTE: so deve ser chamada em runtime (dentro de route handlers).
 * Se virasse efeito colateral de top-level do modulo, o `next build` (que
 * importa os route handlers para coletar metadados) acabaria abrindo o
 * arquivo do banco durante o build.
 */
function getSqlite(): Database.Database {
  if (sqliteInstance) return sqliteInstance;

  // Reaproveita a conexao entre hot-reloads em dev (evita "database is locked").
  if (globalThis.__matemonstroSqlite) {
    sqliteInstance = globalThis.__matemonstroSqlite;
    return sqliteInstance;
  }

  // Caminho do arquivo SQLite (CONTRATO): process.env.DB_PATH || cwd()+'/.data/matemonstro.db'
  const dbPath = process.env.DB_PATH || path.join(process.cwd(), ".data", "matemonstro.db");

  // Garante que a pasta existe antes de abrir o arquivo.
  const dir = path.dirname(dbPath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  const sqlite = new Database(dbPath);
  sqlite.pragma("journal_mode = WAL");
  sqlite.pragma("foreign_keys = ON");

  // Init idempotente: roda na primeira conexao real (runtime), nunca no build.
  ensureSchema(sqlite);

  sqliteInstance = sqlite;
  if (process.env.NODE_ENV !== "production") {
    globalThis.__matemonstroSqlite = sqlite;
  }
  return sqlite;
}

/** Instancia lazy do drizzle: so abre a conexao/roda o schema no primeiro uso real. */
export function getDb(): ReturnType<typeof drizzle<typeof schema>> {
  if (!dbInstance) {
    dbInstance = drizzle(getSqlite(), { schema });
  }
  return dbInstance;
}

/** Acesso lazy ao handle sqlite bruto (mesma regra: so abre no primeiro uso). */
export function getRawSqlite(): Database.Database {
  return getSqlite();
}

export { schema };
export const { users, sessions, state, notes } = schema;
