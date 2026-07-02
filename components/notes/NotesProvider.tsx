"use client";

// Contexto de notas (estilo Obsidian): cache local no IndexedDB SEMPRE (funciona
// offline e ate deslogado, so-local) + sincronizacao com /api/notes quando
// logado (pull no mount/login, push nas mutacoes), com LWW por updatedAt.
//
// Contrato consumido por components/notes/{NoteList,NoteEditor,Backlinks,
// NotesGraph,SubtopicNotes}.tsx e app/notas/**: useNotes() devolve
// { notes, ready, create, update, remove, get }.

import React, { createContext, useContext, useEffect, useMemo, useRef, useState } from "react";
import { openDB, type IDBPDatabase } from "idb";
import type { Note } from "@/lib/types";
import { useAuth } from "@/components/auth/AuthProvider";

const DB_NAME = "matemonstro-notes";
const DB_VERSION = 1;
const STORE = "notes";

let dbp: Promise<IDBPDatabase> | null = null;

function notesDB() {
  if (typeof window === "undefined") throw new Error("NotesProvider indisponivel no servidor");
  if (!dbp) {
    dbp = openDB(DB_NAME, DB_VERSION, {
      upgrade(db) {
        if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE, { keyPath: "id" });
      },
    });
  }
  return dbp;
}

function newId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return `note-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

// ---- cache local (IndexedDB) — inclui notas soft-deletadas, usadas so para bookkeeping de sync ----

async function loadLocalAll(): Promise<Note[]> {
  const d = await notesDB();
  return (await d.getAll(STORE)) as Note[];
}

async function putLocal(note: Note): Promise<void> {
  (await notesDB()).put(STORE, note);
}

async function deleteLocalHard(id: string): Promise<void> {
  (await notesDB()).delete(STORE, id);
}

// ---- API server (/api/notes) — so chamada quando ha usuario logado ----

interface NoteDTO {
  id: string;
  title: string | null;
  body: string | null;
  tags: string[];
  subtopicId: string | null;
  createdAt: number;
  updatedAt: number;
}

function dtoToNote(dto: NoteDTO, extra?: Partial<Note>): Note {
  return {
    id: dto.id,
    title: dto.title ?? "",
    body: dto.body ?? "",
    tags: dto.tags ?? [],
    subtopicId: dto.subtopicId ?? null,
    createdAt: dto.createdAt,
    updatedAt: dto.updatedAt,
    deleted: false,
    ...extra,
  };
}

async function apiList(): Promise<NoteDTO[] | null> {
  const res = await fetch("/api/notes", { credentials: "same-origin" });
  if (!res.ok) return null;
  return (await res.json()) as NoteDTO[];
}

async function apiCreate(input: {
  title?: string;
  body?: string;
  subtopicId?: string | null;
}): Promise<NoteDTO | null> {
  const res = await fetch("/api/notes", {
    method: "POST",
    credentials: "same-origin",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      title: input.title,
      body: input.body,
      subtopicId: input.subtopicId ?? undefined,
    }),
  });
  if (!res.ok) return null;
  return (await res.json()) as NoteDTO;
}

async function apiUpdate(
  id: string,
  input: { title?: string; body?: string; tags?: string[]; subtopicId?: string | null; updatedAt: number }
): Promise<NoteDTO | null> {
  const res = await fetch(`/api/notes/${id}`, {
    method: "PUT",
    credentials: "same-origin",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      title: input.title,
      body: input.body,
      tags: input.tags,
      subtopicId: input.subtopicId ?? undefined,
      updatedAt: input.updatedAt,
    }),
  });
  if (!res.ok) return null;
  return (await res.json()) as NoteDTO;
}

async function apiDelete(id: string): Promise<boolean> {
  try {
    const res = await fetch(`/api/notes/${id}`, { method: "DELETE", credentials: "same-origin" });
    return res.ok;
  } catch {
    return false;
  }
}

// ---- Contexto ----

export interface CreateNoteInput {
  title?: string;
  body?: string;
  tags?: string[];
  subtopicId?: string | null;
}

export interface NotesCtx {
  notes: Note[];
  ready: boolean;
  create: (input?: CreateNoteInput) => Promise<Note>;
  update: (id: string, patch: Partial<Pick<Note, "title" | "body" | "tags" | "subtopicId">>) => Promise<Note | undefined>;
  remove: (id: string) => Promise<void>;
  get: (id: string) => Note | undefined;
}

const Ctx = createContext<NotesCtx | null>(null);

export function NotesProvider({ children }: { children: React.ReactNode }) {
  const { user, ready: authReady } = useAuth();
  const [notes, setNotes] = useState<Note[]>([]);
  const [ready, setReady] = useState(false);
  const notesRef = useRef<Note[]>([]);
  notesRef.current = notes;

  // Carrega o cache local (funciona deslogado/offline; e a fonte de verdade
  // ate uma sincronizacao bem-sucedida trocar o que for necessario).
  useEffect(() => {
    let alive = true;
    loadLocalAll()
      .then((all) => {
        if (!alive) return;
        setNotes(all.filter((n) => !n.deleted));
      })
      .catch((e) => {
        console.error("Falha ao carregar notas locais", e);
      })
      .finally(() => {
        if (alive) setReady(true);
      });
    return () => {
      alive = false;
    };
  }, []);

  // Ao logar (ou ja estar logado no mount), sincroniza com o servidor: LWW por
  // updatedAt, empurra notas locais nunca sincronizadas e adota o que vier do
  // servidor quando for mais novo.
  useEffect(() => {
    if (!authReady || !user) return;
    let alive = true;
    (async () => {
      try {
        const serverDtos = await apiList();
        if (!serverDtos) return; // sem sessao valida ou rede fora: mantem so-local
        const serverNotes = serverDtos.map((d) => dtoToNote(d));
        const serverMap = new Map(serverNotes.map((n) => [n.id, n]));
        const localAll = await loadLocalAll();
        const localIds = new Set(localAll.map((n) => n.id));
        const final = new Map<string, Note>();

        for (const local of localAll) {
          const server = serverMap.get(local.id);
          if (server) {
            if (local.updatedAt > server.updatedAt) {
              // Local mais novo: propaga pro servidor.
              if (local.deleted) {
                await apiDelete(local.id);
              } else {
                await apiUpdate(local.id, {
                  title: local.title,
                  body: local.body,
                  tags: local.tags,
                  subtopicId: local.subtopicId,
                  updatedAt: local.updatedAt,
                });
              }
              final.set(local.id, local);
            } else {
              final.set(local.id, server);
            }
            continue;
          }
          // Servidor nao tem esse id: ou foi deletado la, ou nunca foi sincronizado.
          if (local.deleted) continue; // nada a fazer, so descarta do cache
          const created = await apiCreate({
            title: local.title,
            body: local.body,
            subtopicId: local.subtopicId,
          });
          if (!created) {
            final.set(local.id, local); // sem rede: tenta de novo na proxima sincronizacao
            continue;
          }
          let synced = dtoToNote(created);
          if (local.tags.length > 0) {
            const withTags = await apiUpdate(synced.id, {
              title: synced.title,
              body: synced.body,
              tags: local.tags,
              subtopicId: synced.subtopicId,
              updatedAt: synced.updatedAt,
            });
            if (withTags) synced = dtoToNote(withTags);
            else synced = { ...synced, tags: local.tags };
          }
          await deleteLocalHard(local.id); // o id local (gerado no cliente) da lugar ao id do servidor
          final.set(synced.id, synced);
        }

        for (const server of serverNotes) {
          if (!localIds.has(server.id) && !final.has(server.id)) final.set(server.id, server);
        }

        const merged = [...final.values()];
        await Promise.all(merged.map((n) => putLocal(n)));
        if (!alive) return;
        setNotes(merged.filter((n) => !n.deleted));
      } catch (e) {
        console.error("Falha ao sincronizar notas com o servidor", e);
      }
    })();
    return () => {
      alive = false;
    };
  }, [authReady, user?.id]);

  async function create(input: CreateNoteInput = {}): Promise<Note> {
    const now = Date.now();
    const localId = newId();
    let note: Note = {
      id: localId,
      title: input.title ?? "",
      body: input.body ?? "",
      tags: input.tags ?? [],
      subtopicId: input.subtopicId ?? null,
      createdAt: now,
      updatedAt: now,
      deleted: false,
    };
    await putLocal(note);
    setNotes((prev) => [...prev, note]);

    if (user) {
      const created = await apiCreate({ title: note.title, body: note.body, subtopicId: note.subtopicId });
      if (created) {
        let synced = dtoToNote(created);
        if (note.tags.length > 0) {
          const withTags = await apiUpdate(synced.id, {
            title: synced.title,
            body: synced.body,
            tags: note.tags,
            subtopicId: synced.subtopicId,
            updatedAt: synced.updatedAt,
          });
          synced = withTags ? dtoToNote(withTags) : { ...synced, tags: note.tags };
        }
        // Troca o id gerado no cliente pelo id definitivo do servidor.
        await deleteLocalHard(localId);
        await putLocal(synced);
        note = synced;
        setNotes((prev) => prev.map((n) => (n.id === localId ? synced : n)));
      }
    }
    return note;
  }

  async function update(
    id: string,
    patch: Partial<Pick<Note, "title" | "body" | "tags" | "subtopicId">>
  ): Promise<Note | undefined> {
    const current = notesRef.current.find((n) => n.id === id);
    if (!current) return undefined;
    const now = Date.now();
    let merged: Note = { ...current, ...patch, updatedAt: now };
    await putLocal(merged);
    setNotes((prev) => prev.map((n) => (n.id === id ? merged : n)));

    if (user) {
      const dto = await apiUpdate(id, {
        title: merged.title,
        body: merged.body,
        tags: merged.tags,
        subtopicId: merged.subtopicId,
        updatedAt: now,
      });
      if (dto) {
        // Se o servidor tinha uma versao mais nova (LWW), adota-a; senao, o dto
        // reflete exatamente o que acabamos de enviar.
        const reconciled = dtoToNote(dto, dto.updatedAt > now ? undefined : { tags: merged.tags });
        if (reconciled.updatedAt !== merged.updatedAt) {
          await putLocal(reconciled);
          merged = reconciled;
          setNotes((prev) => prev.map((n) => (n.id === id ? reconciled : n)));
        }
      }
    }
    return merged;
  }

  async function remove(id: string): Promise<void> {
    const current = notesRef.current.find((n) => n.id === id);
    const now = Date.now();
    const deletedNote: Note = current
      ? { ...current, deleted: true, updatedAt: now }
      : { id, title: "", body: "", tags: [], subtopicId: null, createdAt: now, updatedAt: now, deleted: true };
    await putLocal(deletedNote);
    setNotes((prev) => prev.filter((n) => n.id !== id));
    if (user) await apiDelete(id);
  }

  function get(id: string): Note | undefined {
    return notesRef.current.find((n) => n.id === id);
  }

  const value = useMemo<NotesCtx>(
    () => ({ notes, ready, create, update, remove, get }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [notes, ready]
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useNotes(): NotesCtx {
  const c = useContext(Ctx);
  if (!c) throw new Error("useNotes deve ser usado dentro de <NotesProvider>");
  return c;
}
