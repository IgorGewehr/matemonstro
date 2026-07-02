import "server-only";
import type Database from "better-sqlite3";

/** Adiciona uma coluna se ela ainda nao existir (ALTER TABLE idempotente). */
function ensureColumn(sqlite: Database.Database, table: string, column: string, ddl: string) {
  const cols = sqlite.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[];
  if (!cols.some((c) => c.name === column)) {
    sqlite.exec(`ALTER TABLE ${table} ADD COLUMN ${ddl}`);
  }
}

/**
 * Cria as tabelas do CONTRATO de forma idempotente (CREATE TABLE IF NOT EXISTS).
 * Sem passo de migracao manual: basta reutilizar em qualquer client sqlite novo.
 */
export function ensureSchema(sqlite: Database.Database) {
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      email TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      created_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS sessions (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      expires_at INTEGER NOT NULL,
      created_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_sessions_user_id ON sessions(user_id);

    CREATE TABLE IF NOT EXISTS state (
      user_id TEXT NOT NULL,
      domain TEXT NOT NULL,
      item_key TEXT NOT NULL,
      data TEXT NOT NULL,
      updated_at INTEGER NOT NULL,
      PRIMARY KEY (user_id, domain, item_key)
    );
    CREATE INDEX IF NOT EXISTS idx_state_user_domain ON state(user_id, domain);

    CREATE TABLE IF NOT EXISTS notes (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      title TEXT,
      body TEXT,
      tags TEXT,
      subtopic_id TEXT,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      deleted INTEGER DEFAULT 0
    );
    CREATE INDEX IF NOT EXISTS idx_notes_user_id ON notes(user_id);
  `);

  // ---- Colunas aditivas (contas/seguranca) ----
  // users.recovery_codes: JSON de hashes scrypt dos codigos de recuperacao (reset sem e-mail).
  ensureColumn(sqlite, "users", "recovery_codes", "recovery_codes TEXT");
  ensureColumn(sqlite, "users", "password_updated_at", "password_updated_at INTEGER");
  // sessions: metadados para a lista de "sessoes ativas" e expiracao deslizante.
  ensureColumn(sqlite, "sessions", "last_used_at", "last_used_at INTEGER");
  ensureColumn(sqlite, "sessions", "user_agent", "user_agent TEXT");
}
