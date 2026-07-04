"use client";

import { useEffect, useMemo, useState } from "react";
import type { Note } from "@/lib/types";
import { useNotes } from "./NotesProvider";
import { searchNotes, allTagsOf } from "@/lib/notes";

const FOLDER_STATE_KEY = "mm:notas-pastas";
const ROOT_KEY = "__raiz__"; // chave interna p/ destacar a zona de drop da raiz (nunca colide com pastas reais)

interface FolderNode {
  path: string;
  name: string;
  depth: number;
  children: FolderNode[];
}

/** Monta a árvore a partir da lista plana de pastas (já inclui ancestrais e pastas vazias). */
function buildFolderTree(folders: string[]): FolderNode[] {
  const allPaths = new Set<string>();
  for (const f of folders) {
    const segments = f.split("/");
    for (let i = 1; i <= segments.length; i++) allPaths.add(segments.slice(0, i).join("/"));
  }
  const nodeMap = new Map<string, FolderNode>();
  for (const path of allPaths) {
    const segments = path.split("/");
    nodeMap.set(path, { path, name: segments[segments.length - 1], depth: segments.length - 1, children: [] });
  }
  const roots: FolderNode[] = [];
  for (const path of allPaths) {
    const node = nodeMap.get(path)!;
    const segments = path.split("/");
    if (segments.length === 1) {
      roots.push(node);
    } else {
      const parent = nodeMap.get(segments.slice(0, -1).join("/"));
      parent?.children.push(node);
    }
  }
  function sortTree(list: FolderNode[]) {
    list.sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));
    list.forEach((n) => sortTree(n.children));
  }
  sortTree(roots);
  return roots;
}

export default function NoteList({
  selectedId,
  onSelect,
}: {
  selectedId?: string;
  onSelect: (id: string) => void;
}) {
  const { notes, ready, create, remove, folders, createFolder, removeFolder, moveNote } = useNotes();
  const [q, setQ] = useState("");
  const [tagFilter, setTagFilter] = useState<string | null>(null);

  // Expansão de pastas, persistida localmente (chave por caminho; ausente = expandida).
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  useEffect(() => {
    try {
      const raw = localStorage.getItem(FOLDER_STATE_KEY);
      if (raw) setExpanded(JSON.parse(raw));
    } catch {
      /* ignora */
    }
  }, []);
  function toggleFolder(path: string) {
    setExpanded((prev) => {
      const isOpen = prev[path] ?? true;
      const next = { ...prev, [path]: !isOpen };
      try {
        localStorage.setItem(FOLDER_STATE_KEY, JSON.stringify(next));
      } catch {
        /* ignora */
      }
      return next;
    });
  }

  const [openNoteMenu, setOpenNoteMenu] = useState<string | null>(null);
  const [openFolderMenu, setOpenFolderMenu] = useState<string | null>(null);
  const [moveCreateFor, setMoveCreateFor] = useState<string | null>(null);
  const [moveCreateDraft, setMoveCreateDraft] = useState("");
  const [newFolderDraft, setNewFolderDraft] = useState<string | null>(null);
  const [folderError, setFolderError] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState<string | null>(null);

  const live = useMemo(() => notes.filter((n) => !n.deleted), [notes]);

  // Tags do campo + #tags citadas no corpo (estilo Obsidian).
  const allTags = useMemo(() => {
    const s = new Set<string>();
    live.forEach((n) => allTagsOf(n).forEach((t) => s.add(t)));
    return [...s].sort();
  }, [live]);

  const searching = q.trim().length > 0 || tagFilter !== null;

  const filtered = useMemo(() => {
    let list = q.trim() ? searchNotes(live, q) : live;
    if (tagFilter) list = list.filter((n) => allTagsOf(n).includes(tagFilter));
    return [...list].sort((a, b) => b.updatedAt - a.updatedAt);
  }, [live, q, tagFilter]);

  const notesByFolder = useMemo(() => {
    const map = new Map<string, Note[]>();
    for (const n of filtered) {
      if (!n.folder) continue;
      const arr = map.get(n.folder) ?? [];
      arr.push(n);
      map.set(n.folder, arr);
    }
    return map;
  }, [filtered]);

  const rootNotes = useMemo(() => filtered.filter((n) => !n.folder), [filtered]);
  const tree = useMemo(() => buildFolderTree(folders), [folders]);

  const nothingAtAll = live.length === 0 && folders.length === 0;
  const noResults = searching && filtered.length === 0;

  function isExpanded(path: string): boolean {
    if (searching) return true; // busca ativa: mostra tudo, sem colapsos escondendo resultados
    return expanded[path] ?? true;
  }

  function showFolderError(e: unknown, fallback: string) {
    setFolderError(e instanceof Error ? e.message : fallback);
    setTimeout(() => setFolderError(null), 3200);
  }

  async function handleCreate() {
    const n = await create({ title: "Nota sem título", body: "", tags: [] });
    onSelect(n.id);
  }

  // Atalho de teclado: Ctrl/Cmd+N cria uma nota nova. Redepende de create/onSelect
  // (que mudam de identidade a cada atualização de notas) p/ nunca ficar com closure velha.
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if ((e.ctrlKey || e.metaKey) && !e.shiftKey && !e.altKey && e.key.toLowerCase() === "n") {
        e.preventDefault();
        create({ title: "Nota sem título", body: "", tags: [] }).then((n) => onSelect(n.id));
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [create, onSelect]);

  // NOTA DE CONTRATO: CreateNoteInput (NotesProvider) não aceita `folder` — cria-se
  // na raiz e move-se em seguida via moveNote(), em vez de um hack para injetar o
  // campo em create().
  async function handleCreateInFolder(path: string) {
    const n = await create({ title: "Nota sem título", body: "", tags: [] });
    await moveNote(n.id, path);
    onSelect(n.id);
  }

  async function handleMove(noteId: string, folder: string | null) {
    await moveNote(noteId, folder);
    setOpenNoteMenu(null);
  }

  async function handleDelete(noteId: string) {
    if (!window.confirm("Excluir esta nota?")) return;
    setOpenNoteMenu(null);
    await remove(noteId);
  }

  async function confirmMoveCreateFolder(noteId: string) {
    const path = moveCreateDraft.trim();
    setMoveCreateFor(null);
    setMoveCreateDraft("");
    setOpenNoteMenu(null);
    if (!path) return;
    try {
      await createFolder(path);
      await moveNote(noteId, path);
    } catch (e) {
      showFolderError(e, "Não foi possível criar a pasta.");
    }
  }

  async function confirmNewFolder() {
    const path = (newFolderDraft ?? "").trim();
    setNewFolderDraft(null);
    if (!path) return;
    try {
      await createFolder(path);
    } catch (e) {
      showFolderError(e, "Não foi possível criar a pasta.");
    }
  }

  async function handleRemoveFolder(path: string) {
    setOpenFolderMenu(null);
    try {
      await removeFolder(path);
    } catch (e) {
      showFolderError(e, "A pasta não está vazia.");
    }
  }

  function dragOverHandler(key: string) {
    return (e: React.DragEvent) => {
      e.preventDefault();
      e.dataTransfer.dropEffect = "move";
      if (dragOver !== key) setDragOver(key);
    };
  }
  function dragLeaveHandler(key: string) {
    return () => setDragOver((prev) => (prev === key ? null : prev));
  }
  function dropHandler(folder: string | null) {
    return (e: React.DragEvent) => {
      e.preventDefault();
      const id = e.dataTransfer.getData("text/plain");
      setDragOver(null);
      if (id) void moveNote(id, folder);
    };
  }

  function renderNote(n: Note, indentPx: number) {
    const tags = allTagsOf(n);
    return (
      <div key={n.id} className="relative group/note" style={{ paddingLeft: indentPx }}>
        <button
          type="button"
          draggable
          onDragStart={(e) => {
            e.dataTransfer.setData("text/plain", n.id);
            e.dataTransfer.effectAllowed = "move";
          }}
          onClick={() => onSelect(n.id)}
          className={`w-full text-left rounded-xl px-3 py-2 pr-8 transition-all duration-200 border cursor-grab active:cursor-grabbing ${
            selectedId === n.id
              ? "bg-[var(--color-raise)] border-[var(--color-brand)]"
              : "border-transparent hover:bg-[var(--color-raise)]"
          }`}
        >
          <div className="text-sm font-semibold truncate">{n.title || "Sem título"}</div>
          <div className="text-xs text-[var(--color-mut)] truncate mt-0.5">
            {(n.body || "").replace(/\s+/g, " ").slice(0, 70)}
          </div>
          {tags.length > 0 && (
            <div className="flex flex-wrap gap-1 mt-1">
              {tags.slice(0, 4).map((t) => (
                <span key={t} className="text-[10px] text-[var(--color-brand2)]">
                  #{t}
                </span>
              ))}
            </div>
          )}
        </button>
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            setOpenNoteMenu((v) => (v === n.id ? null : n.id));
          }}
          className="absolute right-1.5 top-1.5 w-6 h-6 grid place-items-center rounded-md text-[var(--color-mut)] opacity-0 group-hover/note:opacity-100 focus-visible:opacity-100 hover:bg-[var(--color-well)] hover:text-[var(--color-txt)] transition-opacity"
          title="Mais ações"
          aria-haspopup="menu"
          aria-expanded={openNoteMenu === n.id}
        >
          ⋯
        </button>
        {openNoteMenu === n.id && (
          <div className="notes-wikilink-menu !top-8 !right-1 !max-w-[230px] mm-pop" role="menu">
            <p className="px-2 pt-1 pb-0.5 text-[10px] uppercase tracking-wide text-[var(--color-mut)]">
              Mover para
            </p>
            <button type="button" role="menuitem" onClick={() => handleMove(n.id, null)}>
              ▸ Raiz
            </button>
            {folders.map((f) => (
              <button key={f} type="button" role="menuitem" onClick={() => handleMove(n.id, f)}>
                ▸ {f}
              </button>
            ))}
            {moveCreateFor === n.id ? (
              <input
                autoFocus
                value={moveCreateDraft}
                onChange={(e) => setMoveCreateDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    confirmMoveCreateFolder(n.id);
                  }
                  if (e.key === "Escape") {
                    e.preventDefault();
                    setMoveCreateFor(null);
                    setMoveCreateDraft("");
                  }
                }}
                onBlur={() => {
                  setMoveCreateFor(null);
                  setMoveCreateDraft("");
                }}
                placeholder="Nome da pasta…"
                className="mx-1 my-0.5 rounded-md bg-[var(--color-well)] border border-[var(--color-line)] px-2 py-1 text-xs outline-none focus:border-[var(--color-brand)]"
              />
            ) : (
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  setMoveCreateFor(n.id);
                  setMoveCreateDraft("");
                }}
              >
                + Nova pasta…
              </button>
            )}
            <div className="my-1 border-t border-[var(--color-line)]" />
            <button
              type="button"
              role="menuitem"
              className="!text-[var(--color-warm)]"
              onClick={() => handleDelete(n.id)}
            >
              ✕ Excluir
            </button>
          </div>
        )}
      </div>
    );
  }

  function renderFolder(node: FolderNode): React.ReactNode {
    const notesHere = notesByFolder.get(node.path) ?? [];
    const open = isExpanded(node.path);
    const isDragTarget = dragOver === node.path;
    const basePad = 6 + node.depth * 14;
    return (
      <div key={node.path}>
        <div
          className={`group/folder relative flex items-center gap-1 rounded-lg py-1 pr-1 border transition-colors ${
            isDragTarget
              ? "border-[var(--color-brand)] bg-[var(--color-raise)]"
              : "border-transparent hover:bg-[var(--color-raise)]"
          }`}
          style={{ paddingLeft: basePad }}
          onDragOver={dragOverHandler(node.path)}
          onDragLeave={dragLeaveHandler(node.path)}
          onDrop={dropHandler(node.path)}
        >
          <button
            type="button"
            onClick={() => toggleFolder(node.path)}
            className="shrink-0 w-4 text-[10px] text-[var(--color-mut)]"
            aria-label={open ? "Recolher pasta" : "Expandir pasta"}
          >
            {open ? "▾" : "▸"}
          </button>
          <button
            type="button"
            onClick={() => toggleFolder(node.path)}
            className="flex-1 min-w-0 text-left text-sm font-semibold truncate"
            title={node.path}
          >
            {node.name}
          </button>
          {notesHere.length > 0 && (
            <span className="shrink-0 text-[10px] text-[var(--color-mut)] tabular-nums">{notesHere.length}</span>
          )}
          <button
            type="button"
            onClick={() => handleCreateInFolder(node.path)}
            className="shrink-0 w-5 h-5 grid place-items-center rounded text-[var(--color-mut)] opacity-0 group-hover/folder:opacity-100 focus-visible:opacity-100 hover:bg-[var(--color-well)] hover:text-[var(--color-txt)] transition-opacity"
            title="Nova nota nesta pasta"
          >
            +
          </button>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setOpenFolderMenu((v) => (v === node.path ? null : node.path));
            }}
            className="shrink-0 w-5 h-5 grid place-items-center rounded text-[var(--color-mut)] opacity-0 group-hover/folder:opacity-100 focus-visible:opacity-100 hover:bg-[var(--color-well)] hover:text-[var(--color-txt)] transition-opacity"
            title="Mais ações da pasta"
            aria-haspopup="menu"
            aria-expanded={openFolderMenu === node.path}
          >
            ⋯
          </button>
          {openFolderMenu === node.path && (
            <div className="notes-wikilink-menu !top-8 !right-1 !max-w-[200px] mm-pop" role="menu">
              <button
                type="button"
                role="menuitem"
                className="!text-[var(--color-warm)]"
                onClick={() => handleRemoveFolder(node.path)}
              >
                ✕ Remover pasta
              </button>
            </div>
          )}
        </div>
        {open && (
          <div>
            {node.children.map((child) => renderFolder(child))}
            {notesHere.map((n) => renderNote(n, basePad + 14))}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="panel p-3 flex flex-col gap-3 h-full">
      <button
        type="button"
        className="btn btn-primary w-full !py-2.5 justify-between mm-lift"
        onClick={handleCreate}
        title="Nova nota (Ctrl/⌘+N)"
      >
        <span className="inline-flex items-center gap-2">
          <span className="text-base leading-none">+</span> Nova nota
        </span>
        <span className="text-[10px] font-normal opacity-70 tracking-wide">Ctrl/⌘+N</span>
      </button>

      <input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Buscar notas…"
        className="w-full rounded-lg bg-[var(--color-well)] border border-[var(--color-line)] px-3 py-1.5 text-sm outline-none focus:border-[var(--color-brand)]"
      />

      {allTags.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          <button
            className={`chip !py-0.5 ${tagFilter === null ? "!border-[var(--color-brand)] !text-[var(--color-brand)]" : ""}`}
            onClick={() => setTagFilter(null)}
          >
            todas
          </button>
          {allTags.map((t) => (
            <button
              key={t}
              className={`chip !py-0.5 ${tagFilter === t ? "!border-[var(--color-brand)] !text-[var(--color-brand)]" : ""}`}
              onClick={() => setTagFilter(tagFilter === t ? null : t)}
            >
              #{t}
            </button>
          ))}
        </div>
      )}

      {folderError && <p className="text-[11px] text-[var(--color-warm)] px-1">{folderError}</p>}

      <div className="flex-1 overflow-y-auto -mx-1 px-1 space-y-0.5 mm-stagger">
        {!ready && <p className="text-xs text-[var(--color-mut)] px-2">Carregando…</p>}
        {ready && nothingAtAll && (
          <p className="text-xs text-[var(--color-mut)] px-2">Nenhuma nota ainda. Crie a primeira!</p>
        )}
        {ready && !nothingAtAll && noResults && (
          <p className="text-xs text-[var(--color-mut)] px-2">Nenhum resultado para esta busca.</p>
        )}
        {ready && !noResults && (
          <>
            {tree.map((node) => renderFolder(node))}
            {folders.length > 0 && rootNotes.length > 0 && (
              <p className="px-2 pt-2 pb-0.5 text-[10px] uppercase tracking-wide text-[var(--color-mut)]">Raiz</p>
            )}
            <div
              className={`space-y-0.5 rounded-lg transition-colors ${
                dragOver === ROOT_KEY ? "bg-[var(--color-raise)] ring-1 ring-[var(--color-brand)]" : ""
              }`}
              onDragOver={dragOverHandler(ROOT_KEY)}
              onDragLeave={dragLeaveHandler(ROOT_KEY)}
              onDrop={dropHandler(null)}
            >
              {rootNotes.map((n) => renderNote(n, 4))}
            </div>
          </>
        )}
      </div>

      {(openNoteMenu !== null || openFolderMenu !== null) && (
        <div
          className="fixed inset-0 z-10"
          onClick={() => {
            setOpenNoteMenu(null);
            setOpenFolderMenu(null);
          }}
        />
      )}

      <div className="pt-1 border-t border-[var(--color-line)]">
        {newFolderDraft === null ? (
          <button
            type="button"
            className="text-xs text-[var(--color-mut)] hover:text-[var(--color-txt)] px-1 py-1 transition-colors"
            onClick={() => setNewFolderDraft("")}
          >
            + pasta
          </button>
        ) : (
          <input
            autoFocus
            value={newFolderDraft}
            onChange={(e) => setNewFolderDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                confirmNewFolder();
              }
              if (e.key === "Escape") {
                e.preventDefault();
                setNewFolderDraft(null);
              }
            }}
            onBlur={() => setNewFolderDraft(null)}
            placeholder="Nome da pasta… (Enter confirma, Esc cancela)"
            className="w-full rounded-lg bg-[var(--color-well)] border border-[var(--color-line)] px-2 py-1 text-xs outline-none focus:border-[var(--color-brand)]"
          />
        )}
      </div>
    </div>
  );
}
