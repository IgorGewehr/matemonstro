// Implementação desktop (Tauri) do NotesRepo: cada nota é um arquivo .md REAL
// num vault em disco (default ~/Documents/Matemonstro), interoperável com o
// Obsidian. Decisões da arquitetura (2026-07-04):
//  - escrita ATÔMICA: grava "<nome>.md.tmp" e faz rename por cima do destino;
//  - deleção NUNCA destrutiva: move para .trash/ (convenção Obsidian);
//  - debounce de 500 ms por nota no put() (edição de texto), flush em blur/
//    beforeunload;
//  - arquivos criados fora do app sem `id:` no frontmatter ganham id em memória
//    `f:<basename>`; o id só é gravado no arquivo no primeiro save in-app
//    (nunca reescrever arquivo do usuário em leitura);
//  - sem auto-rename quando o título muda (título canônico vive no frontmatter);
//  - rescan() por mtime para captar edições externas (chamado no focus da janela).
//
// Este módulo só é importado dinamicamente quando isTauri() — nunca entra no
// bundle web.

import {
  readDir,
  readTextFile,
  writeTextFile,
  mkdir,
  rename,
  remove as removePath,
  stat,
  exists,
} from "@tauri-apps/plugin-fs";
import { documentDir, join } from "@tauri-apps/api/path";
import { load, type Store } from "@tauri-apps/plugin-store";
import type { Note } from "./types";
import type { NotesRepo } from "./notes-repo";
import { normalizeFolder } from "./notes";
import { serializeNote, parseNoteMd, slugFilename } from "./note-md";

const STORE_FILE = "settings.json"; // app-data do Tauri — FORA do webview
const VAULT_KEY = "vaultPath";
const DEBOUNCE_MS = 500;
const MAX_FOLDER_DEPTH = 4;
// Nomes de diretorio ignorados na varredura (reservados do app / dotfolders,
// interop com Obsidian que tambem usa .obsidian/ etc.).
function isIgnoredDir(name: string): boolean {
  return name.startsWith(".");
}

interface FileMeta {
  dir: string; // pasta normalizada (posix, "" = raiz), relativa ao vault
  filename: string; // so o nome do arquivo (sem diretorio), ex.: "Minha nota.md"
  mtime: number;
  extra: string[]; // linhas de frontmatter desconhecidas (preservadas)
}

let store: Store | null = null;
let vaultDir = ""; // caminho absoluto da raiz do vault
const meta = new Map<string, FileMeta>(); // id -> arquivo
const pending = new Map<string, { note: Note; timer: ReturnType<typeof setTimeout> }>();

async function settingsStore(): Promise<Store> {
  if (!store) store = await load(STORE_FILE);
  return store;
}

/** Caminho absoluto atual do vault (para exibir em /config). */
export async function getVaultPath(): Promise<string> {
  if (vaultDir) return vaultDir;
  const s = await settingsStore();
  const saved = (await s.get<string>(VAULT_KEY)) ?? null;
  vaultDir = saved || (await join(await documentDir(), "Matemonstro"));
  return vaultDir;
}

/** Define uma nova pasta de vault (escolhida via dialog) e persiste fora do webview. */
export async function setVaultPath(path: string): Promise<void> {
  const s = await settingsStore();
  await s.set(VAULT_KEY, path);
  await s.save();
  vaultDir = path;
  meta.clear();
}

async function ensureVault(): Promise<string> {
  const dir = await getVaultPath();
  for (const sub of ["", ".trash", ".matemonstro/backups"]) {
    const p = sub ? await join(dir, sub) : dir;
    if (!(await exists(p))) await mkdir(p, { recursive: true });
  }
  return dir;
}

async function uniqueFilename(dir: string, title: string): Promise<string> {
  const base = slugFilename(title);
  let name = `${base}.md`;
  for (let i = 2; await exists(await join(dir, name)); i++) name = `${base} ${i}.md`;
  return name;
}

/** Caminho absoluto do subdiretório correspondente a uma pasta normalizada ("" = raiz). */
async function folderAbsPath(root: string, folder: string): Promise<string> {
  if (!folder) return root;
  let p = root;
  for (const seg of folder.split("/")) p = await join(p, seg);
  return p;
}

async function writeAtomic(dir: string, filename: string, content: string): Promise<void> {
  const tmp = await join(dir, `${filename}.tmp`);
  const dst = await join(dir, filename);
  await writeTextFile(tmp, content);
  await rename(tmp, dst);
}

async function flushOne(id: string): Promise<void> {
  const p = pending.get(id);
  if (!p) return;
  pending.delete(id);
  clearTimeout(p.timer);
  const root = await ensureVault();
  const folder = normalizeFolder(p.note.folder ?? null) ?? "";
  const targetDir = await folderAbsPath(root, folder);
  if (folder && !(await exists(targetDir))) await mkdir(targetDir, { recursive: true });

  let m = meta.get(id);
  if (!m) {
    m = { dir: folder, filename: await uniqueFilename(targetDir, p.note.title), mtime: 0, extra: [] };
    meta.set(id, m);
  } else if (m.dir !== folder) {
    // A pasta mudou: RENAME atomico do arquivo antigo para o novo diretorio
    // (colisao de nome no destino resolvida por pasta, via uniqueFilename).
    const oldDir = await folderAbsPath(root, m.dir);
    const oldAbs = await join(oldDir, m.filename);
    const newFilename = (await exists(await join(targetDir, m.filename)))
      ? await uniqueFilename(targetDir, p.note.title)
      : m.filename;
    if (await exists(oldAbs)) {
      await rename(oldAbs, await join(targetDir, newFilename));
    }
    m.dir = folder;
    m.filename = newFilename;
  }
  await writeAtomic(targetDir, m.filename, serializeNote(p.note, m.extra));
  try {
    const st = await stat(await join(targetDir, m.filename));
    m.mtime = st.mtime ? new Date(st.mtime).getTime() : Date.now();
  } catch {
    m.mtime = Date.now();
  }
}

/** Descarrega todas as escritas pendentes (blur/beforeunload/fechamento). */
export async function flushAll(): Promise<void> {
  await Promise.all([...pending.keys()].map((id) => flushOne(id)));
}

if (typeof window !== "undefined") {
  window.addEventListener("blur", () => void flushAll());
  window.addEventListener("beforeunload", () => void flushAll());
}

/** Varre um (sub)diretório recursivamente (ignora .trash, .matemonstro e dotfolders; profundidade máx. 4). */
async function collectNotes(
  root: string,
  folder: string,
  notes: Note[],
  seenIds: Set<string>
): Promise<void> {
  const abs = await folderAbsPath(root, folder);
  let entries: Awaited<ReturnType<typeof readDir>>;
  try {
    entries = await readDir(abs);
  } catch (err) {
    console.warn(`Vault: falha ao ler diretorio ${folder || "(raiz)"}`, err);
    return;
  }
  for (const e of entries) {
    if (!e.name) continue;
    if (e.isDirectory) {
      if (isIgnoredDir(e.name)) continue;
      const child = folder ? `${folder}/${e.name}` : e.name;
      if (child.split("/").length > MAX_FOLDER_DEPTH) continue;
      await collectNotes(root, child, notes, seenIds);
      continue;
    }
    if (!e.isFile || !e.name.toLowerCase().endsWith(".md")) continue;
    try {
      const full = await join(abs, e.name);
      const [st, content] = await Promise.all([stat(full), readTextFile(full)]);
      const mtime = st.mtime ? new Date(st.mtime).getTime() : Date.now();
      const { note, extra } = parseNoteMd(e.name, content, mtime);
      // Colisão de id (arquivo copiado à mão, ou mesmo id em pastas distintas):
      // o segundo vira f:<caminho> para não sumir.
      if (seenIds.has(note.id)) {
        note.id = `f:${(folder ? `${folder}/` : "") + e.name.replace(/\.md$/i, "")}`;
      }
      seenIds.add(note.id);
      note.folder = folder || null;
      meta.set(note.id, { dir: folder, filename: e.name, mtime, extra });
      notes.push(note);
    } catch (err) {
      console.warn(`Vault: falha ao ler ${folder ? `${folder}/` : ""}${e.name} (pulado)`, err);
    }
  }
}

async function readVault(): Promise<Note[]> {
  const root = await ensureVault();
  const notes: Note[] = [];
  const seenIds = new Set<string>();
  meta.clear();
  await collectNotes(root, "", notes, seenIds);
  return notes;
}

/** Varre subpastas (só diretórios) recursivamente, mesmas regras de collectNotes. */
async function collectFolders(root: string, folder: string, out: Set<string>): Promise<void> {
  const abs = await folderAbsPath(root, folder);
  let entries: Awaited<ReturnType<typeof readDir>>;
  try {
    entries = await readDir(abs);
  } catch {
    return;
  }
  for (const e of entries) {
    if (!e.isDirectory || !e.name || isIgnoredDir(e.name)) continue;
    const child = folder ? `${folder}/${e.name}` : e.name;
    if (child.split("/").length > MAX_FOLDER_DEPTH) continue;
    out.add(child);
    await collectFolders(root, child, out);
  }
}

export const fsNotesRepo: NotesRepo = {
  async list(): Promise<Note[]> {
    return readVault();
  },

  async put(note: Note): Promise<void> {
    const prev = pending.get(note.id);
    if (prev) clearTimeout(prev.timer);
    pending.set(note.id, {
      note,
      timer: setTimeout(() => void flushOne(note.id), DEBOUNCE_MS),
    });
  },

  async remove(id: string): Promise<void> {
    const p = pending.get(id);
    if (p) {
      clearTimeout(p.timer);
      pending.delete(id);
    }
    const m = meta.get(id);
    if (!m) return;
    const root = await ensureVault();
    const srcDir = await folderAbsPath(root, m.dir);
    const src = await join(srcDir, m.filename);
    if (await exists(src)) {
      // .trash/ é sempre achatado (sem subpastas), convenção Obsidian.
      let dst = await join(root, ".trash", m.filename);
      if (await exists(dst)) {
        dst = await join(root, ".trash", m.filename.replace(/\.md$/i, `-${Date.now()}.md`));
      }
      await rename(src, dst);
    }
    meta.delete(id);
  },

  /** Relê o vault inteiro (mudanças externas: Obsidian, sync de arquivos). */
  async rescan(): Promise<Note[] | null> {
    await flushAll(); // escritas nossas pendentes primeiro (LWW honesto)
    return readVault();
  },

  async listFolders(): Promise<string[]> {
    const root = await ensureVault();
    const set = new Set<string>();
    await collectFolders(root, "", set);
    return [...set].sort((a, b) => a.localeCompare(b));
  },

  async createFolder(path: string): Promise<void> {
    const norm = normalizeFolder(path);
    if (!norm) throw new Error("Caminho de pasta invalido");
    const root = await ensureVault();
    const abs = await folderAbsPath(root, norm);
    await mkdir(abs, { recursive: true });
  },

  async removeFolder(path: string): Promise<void> {
    const norm = normalizeFolder(path);
    if (!norm) return;
    const root = await ensureVault();
    const abs = await folderAbsPath(root, norm);
    if (!(await exists(abs))) return;
    const entries = await readDir(abs);
    if (entries.length > 0) throw new Error("Pasta nao esta vazia");
    await removePath(abs);
  },
};

/**
 * Migração one-shot das notas do IndexedDB (uso web anterior no mesmo webview)
 * para o vault em disco. Flag persistida no plugin-store (fora do webview);
 * o IDB NÃO é apagado — fica como backup passivo. Retorna quantas migrou.
 */
export async function migrateFromIdbOnce(loadIdb: () => Promise<Note[]>): Promise<number> {
  const s = await settingsStore();
  if (await s.get<boolean>("idbNotesMigrated")) return 0;
  const existing = await readVault();
  const ids = new Set(existing.map((n) => n.id));
  let migrated = 0;
  try {
    const idbNotes = (await loadIdb()).filter((n) => !n.deleted && !ids.has(n.id));
    for (const n of idbNotes) {
      await fsNotesRepo.put(n);
      migrated++;
    }
    await flushAll();
  } catch (err) {
    console.warn("Migração IDB→vault: IDB indisponível ou vazio", err);
  }
  await s.set("idbNotesMigrated", true);
  await s.save();
  return migrated;
}

/** Escreve um arquivo utilitário dentro do vault (backups de estado etc.). */
export async function writeVaultFile(relPath: string, content: string): Promise<void> {
  const dir = await ensureVault();
  const parts = relPath.split("/");
  const filename = parts.pop()!;
  let sub = dir;
  for (const p of parts) {
    sub = await join(sub, p);
    if (!(await exists(sub))) await mkdir(sub, { recursive: true });
  }
  await writeAtomic(sub, filename, content);
}

export async function listVaultFiles(relDir: string): Promise<string[]> {
  const dir = await ensureVault();
  const full = await join(dir, relDir);
  if (!(await exists(full))) return [];
  const entries = await readDir(full);
  return entries.filter((e) => e.isFile && e.name).map((e) => e.name!);
}

export async function readVaultFile(relPath: string): Promise<string> {
  const dir = await getVaultPath();
  return readTextFile(await join(dir, relPath));
}
