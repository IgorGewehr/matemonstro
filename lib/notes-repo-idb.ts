// Implementação web do NotesRepo: IndexedDB. Código movido VERBATIM de
// components/notes/NotesProvider.tsx (comportamento idêntico ao histórico),
// com o objectStore "folders" aditivo para pastas (bookkeeping de pastas
// vazias — pastas com notas são derivadas de note.folder).
import { openDB, type IDBPDatabase } from "idb";
import type { Note } from "./types";
import type { NotesRepo } from "./notes-repo";
import { normalizeFolder } from "./notes";

const DB_NAME = "matemonstro-notes";
const DB_VERSION = 2;
const STORE = "notes";
const FOLDERS_STORE = "folders";

let dbp: Promise<IDBPDatabase> | null = null;

function notesDB() {
  if (typeof window === "undefined") throw new Error("NotesRepo indisponivel no servidor");
  if (!dbp) {
    dbp = openDB(DB_NAME, DB_VERSION, {
      upgrade(db) {
        if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE, { keyPath: "id" });
        if (!db.objectStoreNames.contains(FOLDERS_STORE)) {
          db.createObjectStore(FOLDERS_STORE, { keyPath: "path" });
        }
      },
    });
  }
  return dbp;
}

/** "A/B/C" -> ["A", "A/B", "A/B/C"] (ancestrais inclusive, para listagem em arvore). */
function folderAncestors(path: string): string[] {
  const segments = path.split("/");
  const out: string[] = [];
  for (let i = 1; i <= segments.length; i++) out.push(segments.slice(0, i).join("/"));
  return out;
}

export const idbNotesRepo: NotesRepo = {
  async list(): Promise<Note[]> {
    const d = await notesDB();
    return (await d.getAll(STORE)) as Note[];
  },
  async put(note: Note): Promise<void> {
    const normalized: Note = { ...note, folder: normalizeFolder(note.folder ?? null) };
    (await notesDB()).put(STORE, normalized);
  },
  async remove(id: string): Promise<void> {
    (await notesDB()).delete(STORE, id);
  },
  async listFolders(): Promise<string[]> {
    const d = await notesDB();
    const [stored, notes] = await Promise.all([
      d.getAll(FOLDERS_STORE) as Promise<{ path: string }[]>,
      d.getAll(STORE) as Promise<Note[]>,
    ]);
    const set = new Set<string>();
    for (const f of stored) if (f?.path) set.add(f.path);
    for (const n of notes) {
      if (n.deleted) continue;
      const folder = normalizeFolder(n.folder ?? null);
      if (!folder) continue;
      for (const anc of folderAncestors(folder)) set.add(anc);
    }
    return [...set].sort((a, b) => a.localeCompare(b));
  },
  async createFolder(path: string): Promise<void> {
    const norm = normalizeFolder(path);
    if (!norm) throw new Error("Caminho de pasta invalido");
    const d = await notesDB();
    await Promise.all(folderAncestors(norm).map((anc) => d.put(FOLDERS_STORE, { path: anc })));
  },
  async removeFolder(path: string): Promise<void> {
    const norm = normalizeFolder(path);
    if (!norm) return;
    const [notes, allFolders] = await Promise.all([idbNotesRepo.list(), idbNotesRepo.listFolders()]);
    const hasNotes = notes.some((n) => !n.deleted && normalizeFolder(n.folder ?? null) === norm);
    const hasSubfolders = allFolders.some((f) => f !== norm && f.startsWith(`${norm}/`));
    if (hasNotes || hasSubfolders) throw new Error("Pasta nao esta vazia");
    const d = await notesDB();
    await d.delete(FOLDERS_STORE, norm);
  },
};
