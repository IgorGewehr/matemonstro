import "server-only";
import { randomUUID } from "crypto";
import { and, eq } from "drizzle-orm";
import { getDb } from "@/lib/server/db/client";
import { notes } from "@/lib/server/db/schema";

// Forma "pública" de uma nota (o que a API expõe), alinhada com o CONTRATO.
export interface NoteDTO {
  id: string;
  title: string | null;
  body: string | null;
  tags: string[];
  subtopicId: string | null;
  createdAt: number;
  updatedAt: number;
}

function parseTags(raw: string | null | undefined): string[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function toDTO(row: typeof notes.$inferSelect): NoteDTO {
  return {
    id: row.id,
    title: row.title ?? null,
    body: row.body ?? null,
    tags: parseTags(row.tags as unknown as string | null),
    subtopicId: row.subtopicId ?? null,
    createdAt: row.createdAt as unknown as number,
    updatedAt: row.updatedAt as unknown as number,
  };
}

/** Lista as notas não deletadas do usuário. */
export function listNotes(userId: string): NoteDTO[] {
  const rows = getDb()
    .select()
    .from(notes)
    .where(and(eq(notes.userId, userId), eq(notes.deleted, 0)))
    .all();
  return rows.map(toDTO);
}

/** Busca uma nota do usuário (mesmo se deletada), ou null. */
export function getNoteById(userId: string, id: string): NoteDTO | null {
  const row = getDb()
    .select()
    .from(notes)
    .where(and(eq(notes.id, id), eq(notes.userId, userId)))
    .get();
  return row ? toDTO(row) : null;
}

export interface CreateNoteInput {
  title?: string;
  body?: string;
  subtopicId?: string;
}

/** Cria uma nova nota para o usuário. */
export function createNote(userId: string, input: CreateNoteInput): NoteDTO {
  const now = Date.now();
  const id = randomUUID();
  getDb()
    .insert(notes)
    .values({
      id,
      userId,
      title: input.title ?? null,
      body: input.body ?? null,
      tags: JSON.stringify([]),
      subtopicId: input.subtopicId ?? null,
      createdAt: now,
      updatedAt: now,
      deleted: 0,
    })
    .run();
  return {
    id,
    title: input.title ?? null,
    body: input.body ?? null,
    tags: [],
    subtopicId: input.subtopicId ?? null,
    createdAt: now,
    updatedAt: now,
  };
}

export interface UpdateNoteInput {
  title?: string;
  body?: string;
  tags?: string[];
  subtopicId?: string;
  updatedAt: number;
}

/**
 * Atualiza uma nota respeitando LWW: só grava se `input.updatedAt` for
 * maior ou igual ao `updatedAt` armazenado. Retorna a nota resultante
 * (já mesclada) ou null se não existir/pertencer a outro usuário.
 */
export function updateNote(
  userId: string,
  id: string,
  input: UpdateNoteInput
): NoteDTO | null {
  const existing = getNoteById(userId, id);
  if (!existing || existing.updatedAt === undefined) {
    if (!existing) return null;
  }
  if (existing && input.updatedAt < existing.updatedAt) {
    // Registro remoto mais novo vence (Last-Write-Wins): ignora o patch antigo.
    return existing;
  }

  getDb()
    .update(notes)
    .set({
      title: input.title ?? existing?.title ?? null,
      body: input.body ?? existing?.body ?? null,
      tags: JSON.stringify(input.tags ?? existing?.tags ?? []),
      subtopicId: input.subtopicId ?? existing?.subtopicId ?? null,
      updatedAt: input.updatedAt,
    })
    .where(and(eq(notes.id, id), eq(notes.userId, userId)))
    .run();

  return getNoteById(userId, id);
}

/** Soft-delete: marca deleted=1 e atualiza updatedAt. */
export function softDeleteNote(
  userId: string,
  id: string,
  updatedAt: number = Date.now()
): boolean {
  const existing = getNoteById(userId, id);
  if (!existing) return false;
  getDb()
    .update(notes)
    .set({ deleted: 1, updatedAt })
    .where(and(eq(notes.id, id), eq(notes.userId, userId)))
    .run();
  return true;
}
