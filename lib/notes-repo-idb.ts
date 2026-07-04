// Implementação web do NotesRepo: IndexedDB. Código movido VERBATIM de
// components/notes/NotesProvider.tsx (comportamento idêntico ao histórico).
import { openDB, type IDBPDatabase } from "idb";
import type { Note } from "./types";
import type { NotesRepo } from "./notes-repo";

const DB_NAME = "matemonstro-notes";
const DB_VERSION = 1;
const STORE = "notes";

let dbp: Promise<IDBPDatabase> | null = null;

function notesDB() {
  if (typeof window === "undefined") throw new Error("NotesRepo indisponivel no servidor");
  if (!dbp) {
    dbp = openDB(DB_NAME, DB_VERSION, {
      upgrade(db) {
        if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE, { keyPath: "id" });
      },
    });
  }
  return dbp;
}

export const idbNotesRepo: NotesRepo = {
  async list(): Promise<Note[]> {
    const d = await notesDB();
    return (await d.getAll(STORE)) as Note[];
  },
  async put(note: Note): Promise<void> {
    (await notesDB()).put(STORE, note);
  },
  async remove(id: string): Promise<void> {
    (await notesDB()).delete(STORE, id);
  },
};
