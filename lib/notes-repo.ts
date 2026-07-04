// Porta de persistência das notas. Duas implementações:
//  - notes-repo-idb.ts (web): IndexedDB — o comportamento histórico, intacto;
//  - notes-repo-fs.ts (desktop/Tauri): arquivos .md reais num vault em disco,
//    interoperável com o Obsidian.
// O NotesProvider escolhe em runtime via isTauri() e não sabe mais de I/O.

import type { Note } from "./types";

export interface NotesRepo {
  /** Todas as notas (INCLUINDO soft-deletadas no caso do IDB — bookkeeping de sync). */
  list(): Promise<Note[]>;
  put(note: Note): Promise<void>;
  /** Remoção definitiva do storage (o fs move para .trash/, nunca destrutivo). */
  remove(id: string): Promise<void>;
  /** Releitura de mudanças externas (Obsidian). No IDB é no-op e retorna null. */
  rescan?(): Promise<Note[] | null>;
}
