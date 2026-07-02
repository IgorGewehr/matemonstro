import "server-only";
import { sqliteTable, text, integer, primaryKey } from "drizzle-orm/sqlite-core";

// ---- Tabelas do CONTRATO de arquitetura (autoritativo) ----
// Ver CONTRATO no prompt do workflow: users, sessions, state (uniforme), notes.

export const users = sqliteTable("users", {
  id: text("id").primaryKey(), // uuid
  email: text("email").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  createdAt: integer("created_at").notNull(),
  // JSON array de hashes scrypt dos codigos de recuperacao (reset sem e-mail).
  recoveryCodes: text("recovery_codes"),
  passwordUpdatedAt: integer("password_updated_at"),
});

export const sessions = sqliteTable("sessions", {
  id: text("id").primaryKey(), // token
  userId: text("user_id").notNull(),
  expiresAt: integer("expires_at").notNull(),
  createdAt: integer("created_at").notNull(),
  lastUsedAt: integer("last_used_at"),
  userAgent: text("user_agent"),
});

// Guarda TODO o estado de estudo de forma uniforme.
// domain in {progress,cards,attempts,marks,events,studylog}; settings usa domain='settings' item_key=''.
export const state = sqliteTable(
  "state",
  {
    userId: text("user_id").notNull(),
    domain: text("domain").notNull(),
    itemKey: text("item_key").notNull(),
    data: text("data").notNull(), // json
    updatedAt: integer("updated_at").notNull(),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.userId, t.domain, t.itemKey] }),
  })
);

export const notes = sqliteTable("notes", {
  id: text("id").primaryKey(), // uuid
  userId: text("user_id").notNull(),
  title: text("title"),
  body: text("body"),
  tags: text("tags"), // json array
  subtopicId: text("subtopic_id"),
  createdAt: integer("created_at").notNull(),
  updatedAt: integer("updated_at").notNull(),
  deleted: integer("deleted").default(0),
});
