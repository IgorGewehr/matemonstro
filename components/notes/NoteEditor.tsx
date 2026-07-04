"use client";

import { useEffect, useMemo, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from "react";
import Markdown from "@/components/Markdown";
import FormulaToolbar from "./FormulaToolbar";
import { useNotes } from "./NotesProvider";
import { allTagsOf, suggestLinks, type LinkSuggestion } from "@/lib/notes";
import { renderNoteMarkdown, curriculumLinkCandidates } from "@/lib/notes-curriculum";
import { NOTE_TEMPLATES } from "@/lib/note-templates";
import type { Note } from "@/lib/types";

const SAVE_DEBOUNCE_MS = 600;

export function noteToMarkdown(note: Note): string {
  const front = [
    "---",
    `title: ${note.title || "Sem título"}`,
    note.tags?.length ? `tags: [${note.tags.join(", ")}]` : "tags: []",
    `updated: ${new Date(note.updatedAt).toISOString()}`,
    "---",
    "",
  ].join("\n");
  return front + (note.body ?? "");
}

export function downloadTextFile(filename: string, content: string, mime = "text/markdown") {
  if (typeof window === "undefined") return;
  const blob = new Blob([content], { type: `${mime};charset=utf-8` });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function slug(title: string) {
  return (
    title
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/(^-|-$)/g, "") || "nota"
  );
}

// Encontra o token "[[...]]" (ainda não fechado) imediatamente antes do cursor,
// para acionar o autocomplete de wikilinks.
function findOpenWikilink(text: string, caret: number): { start: number; query: string } | null {
  const uptoCaret = text.slice(0, caret);
  const openIdx = uptoCaret.lastIndexOf("[[");
  if (openIdx === -1) return null;
  const between = uptoCaret.slice(openIdx + 2);
  if (between.includes("]]") || between.includes("\n")) return null;
  return { start: openIdx + 2, query: between };
}

// Verifica se o cursor está dentro de um bloco $$...$$ ainda aberto, para o
// atalho de Tab "pular para fora" da fórmula.
function insideDollarBlock(text: string, caret: number): number | null {
  const before = text.slice(0, caret);
  const opens = before.split("$$").length - 1;
  if (opens % 2 === 0) return null; // fora de um bloco (ou nenhum aberto)
  const closeIdx = text.indexOf("$$", caret);
  if (closeIdx === -1) return null;
  return closeIdx + 2;
}

// Candidato do autocomplete de [[wikilink]]: outra nota ou uma aula do currículo.
interface LinkCandidate {
  key: string;
  kind: "nota" | "aula";
  label: string;
  detail?: string;
  insert: string; // texto inserido dentro do [[...]]
}

export default function NoteEditor({
  noteId,
  onDeleted,
}: {
  noteId: string;
  onDeleted?: () => void;
}) {
  const { notes, ready, update, remove } = useNotes();
  const note = notes.find((n) => n.id === noteId);

  const [title, setTitle] = useState(note?.title ?? "");
  const [body, setBody] = useState(note?.body ?? "");
  const [tagsInput, setTagsInput] = useState((note?.tags ?? []).join(", "));
  const [saved, setSaved] = useState(true);
  const [linkQuery, setLinkQuery] = useState<{ start: number; query: string } | null>(null);
  const [linkSel, setLinkSel] = useState(0);
  const [pendingSelection, setPendingSelection] = useState<{ start: number; end: number } | null>(null);
  const [templatesOpen, setTemplatesOpen] = useState(false);
  // Barra de fórmulas retrátil: fechada por padrão (3 linhas de botões comiam
  // o espaço do editor); a preferência persiste.
  const [toolbarOpen, setToolbarOpen] = useState(false);
  useEffect(() => {
    try {
      setToolbarOpen(localStorage.getItem("mm:notas-toolbar") === "on");
    } catch {
      /* ignora */
    }
  }, []);
  function toggleToolbar() {
    setToolbarOpen((v) => {
      try {
        localStorage.setItem("mm:notas-toolbar", v ? "off" : "on");
      } catch {
        /* ignora */
      }
      return !v;
    });
  }

  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    setTitle(note?.title ?? "");
    setBody(note?.body ?? "");
    setTagsInput((note?.tags ?? []).join(", "));
    setSaved(true);
    setLinkQuery(null);
    setTemplatesOpen(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [noteId]);

  useEffect(() => {
    if (pendingSelection && textareaRef.current) {
      textareaRef.current.focus();
      textareaRef.current.setSelectionRange(pendingSelection.start, pendingSelection.end);
      setPendingSelection(null);
    }
  }, [pendingSelection, body]);

  const tags = useMemo(
    () =>
      tagsInput
        .split(",")
        .map((t) => t.trim())
        .filter(Boolean),
    [tagsInput]
  );

  // #tags digitadas no corpo também contam (estilo Obsidian).
  const effectiveTags = useMemo(
    () => allTagsOf({ ...(note ?? ({} as Note)), tags, body }),
    [note, tags, body]
  );
  const bodyOnlyTags = useMemo(
    () => effectiveTags.filter((t) => !tags.map((x) => x.toLowerCase()).includes(t)),
    [effectiveTags, tags]
  );

  const wordCount = useMemo(() => {
    const trimmed = body.trim();
    return trimmed ? trimmed.split(/\s+/).length : 0;
  }, [body]);

  // Links sugeridos: titulos de outras notas citados no corpo, ainda sem [[...]].
  const linkSuggestions = useMemo<LinkSuggestion[]>(
    () => (note ? suggestLinks({ ...note, title, body, tags }, notes) : []),
    [note, title, body, tags, notes]
  );

  // Debounce: só persiste depois de um período sem digitar.
  useEffect(() => {
    if (!note) return;
    if (title === note.title && body === note.body && tagsInput === (note.tags ?? []).join(", ")) return;
    setSaved(false);
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      update(noteId, { title, body, tags }).then(() => setSaved(true));
    }, SAVE_DEBOUNCE_MS);
    return () => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [title, body, tagsInput]);

  const wikilinkCandidates = useMemo<LinkCandidate[]>(() => {
    if (!linkQuery) return [];
    const q = linkQuery.query.trim().toLowerCase();
    const currentFolder = note?.folder ?? null;
    const noteCands: LinkCandidate[] = notes
      .filter((n) => n.id !== noteId && !n.deleted)
      .filter((n) => !q || n.title.toLowerCase().includes(q))
      // Ranking: notas da mesma pasta da nota atual primeiro, depois por recencia.
      .slice()
      .sort((a, b) => {
        const aSame = (a.folder ?? null) === currentFolder;
        const bSame = (b.folder ?? null) === currentFolder;
        if (aSame !== bSame) return aSame ? -1 : 1;
        return b.updatedAt - a.updatedAt;
      })
      .slice(0, 6)
      .map((n) => ({
        key: `n-${n.id}`,
        kind: "nota" as const,
        label: n.title || "Sem título",
        detail: n.folder || undefined,
        insert: n.title || "Sem título",
      }));
    // Aulas do currículo entram com 2+ caracteres (evita listar o currículo inteiro).
    const currCands: LinkCandidate[] =
      q.length >= 2
        ? curriculumLinkCandidates(q, 4).map((c) => ({
            key: `c-${c.subId}`,
            kind: "aula" as const,
            label: c.title,
            detail: c.trackTitle,
            insert: `sub:${c.subId}|${c.title}`,
          }))
        : [];
    return [...noteCands, ...currCands];
  }, [linkQuery, notes, noteId]);

  useEffect(() => {
    setLinkSel(0);
  }, [linkQuery?.query, linkQuery?.start]);

  function onBodyChange(next: string, caret?: number) {
    setBody(next);
    const pos = caret ?? textareaRef.current?.selectionStart ?? next.length;
    setLinkQuery(findOpenWikilink(next, pos));
  }

  function selectWikilink(cand: LinkCandidate) {
    if (!linkQuery) return;
    const ta = textareaRef.current;
    const caret = ta?.selectionStart ?? linkQuery.start + linkQuery.query.length;
    const next = body.slice(0, linkQuery.start) + cand.insert + "]]" + body.slice(caret);
    const cursor = linkQuery.start + cand.insert.length + 2;
    setBody(next);
    setLinkQuery(null);
    setPendingSelection({ start: cursor, end: cursor });
  }

  // Envolve a primeira ocorrencia sugerida em [[...]] (preservando o texto
  // original como esta, so muda a caixa se necessario) e persiste de imediato.
  async function acceptLinkSuggestion(s: LinkSuggestion) {
    const matched = body.slice(s.index, s.index + s.title.length);
    if (!matched) return;
    const next = body.slice(0, s.index) + "[[" + matched + "]]" + body.slice(s.index + matched.length);
    if (saveTimer.current) clearTimeout(saveTimer.current);
    setBody(next);
    setSaved(false);
    const persisted = await update(noteId, { title, body: next, tags });
    if (persisted) setSaved(true);
  }

  function insertTemplate(templateBody: string) {
    const ta = textareaRef.current;
    const at = ta?.selectionStart ?? body.length;
    const before = body.slice(0, at);
    const needsGap = before.trim().length > 0 && !before.endsWith("\n\n");
    const inserted = (needsGap ? (before.endsWith("\n") ? "\n" : "\n\n") : "") + templateBody + "\n";
    const next = before + inserted + body.slice(at);
    setBody(next);
    setTemplatesOpen(false);
    setPendingSelection({ start: at + inserted.length, end: at + inserted.length });
  }

  function wrapSelection(before: string, after: string, placeholder: string) {
    const ta = textareaRef.current;
    if (!ta) return;
    const start = ta.selectionStart ?? body.length;
    const end = ta.selectionEnd ?? body.length;
    const selected = body.slice(start, end) || placeholder;
    const next = body.slice(0, start) + before + selected + after + body.slice(end);
    setBody(next);
    setPendingSelection({ start: start + before.length, end: start + before.length + selected.length });
  }

  function onKeyDown(e: ReactKeyboardEvent<HTMLTextAreaElement>) {
    if (linkQuery && wikilinkCandidates.length > 0) {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setLinkSel((s) => (s + 1) % wikilinkCandidates.length);
        return;
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        setLinkSel((s) => (s - 1 + wikilinkCandidates.length) % wikilinkCandidates.length);
        return;
      }
      if (e.key === "Enter" || e.key === "Tab") {
        e.preventDefault();
        selectWikilink(wikilinkCandidates[Math.min(linkSel, wikilinkCandidates.length - 1)]);
        return;
      }
    }
    const mod = e.ctrlKey || e.metaKey;
    if (mod && e.key.toLowerCase() === "b") {
      e.preventDefault();
      wrapSelection("**", "**", "negrito");
      return;
    }
    if (mod && e.key.toLowerCase() === "m") {
      e.preventDefault();
      wrapSelection("$$", "$$", "formula");
      return;
    }
    if (e.key === "Tab") {
      const ta = e.currentTarget;
      const caret = ta.selectionStart;
      const jumpTo = insideDollarBlock(body, caret);
      e.preventDefault();
      if (jumpTo !== null) {
        setPendingSelection({ start: jumpTo, end: jumpTo });
      } else {
        const next = body.slice(0, caret) + "  " + body.slice(ta.selectionEnd);
        setBody(next);
        setPendingSelection({ start: caret + 2, end: caret + 2 });
      }
      return;
    }
    if (e.key === "Escape" && linkQuery) {
      setLinkQuery(null);
    }
  }

  async function handleDelete() {
    if (!window.confirm("Excluir esta nota?")) return;
    await remove(noteId);
    onDeleted?.();
  }

  function handleExport() {
    if (!note) return;
    downloadTextFile(`${slug(title || note.title)}.md`, noteToMarkdown({ ...note, title, body, tags }));
  }

  if (!ready) return <div className="panel p-6 text-sm text-[var(--color-mut)]">Carregando…</div>;
  if (!note)
    return (
      <div className="panel p-6 text-sm text-[var(--color-mut)]">
        Nota não encontrada. Selecione outra na lista à esquerda.
      </div>
    );

  return (
    <div className="notes-editor panel p-4 flex flex-col gap-3 h-full mm-enter">
      <div className="flex items-center gap-2">
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Título da nota"
          className="flex-1 bg-transparent text-lg font-bold outline-none placeholder:text-[var(--color-mut)]"
        />
        <span className="text-xs text-[var(--color-mut)] whitespace-nowrap">{saved ? "Salvo ✓" : "salvando…"}</span>
        <div className="relative">
          <button
            className="btn !py-1.5 !px-2.5 text-xs"
            onClick={() => setTemplatesOpen((v) => !v)}
            aria-expanded={templatesOpen}
            aria-haspopup="menu"
            title="Inserir template matemático"
          >
            ≔ Template
          </button>
          {templatesOpen && (
            <div className="notes-wikilink-menu !top-9 !right-0 !max-w-[300px] mm-pop" role="menu">
              {NOTE_TEMPLATES.map((t) => (
                <button key={t.id} type="button" role="menuitem" onClick={() => insertTemplate(t.body)}>
                  <span className="font-semibold">
                    {t.icon} {t.label}
                  </span>
                  <span className="block text-[11px] text-[var(--color-mut)]">{t.hint}</span>
                </button>
              ))}
            </div>
          )}
        </div>
        <button className="btn !py-1.5 !px-2.5 text-xs" onClick={handleExport} title="Exportar .md">
          .md
        </button>
        <button className="btn !py-1.5 !px-2.5 text-xs" onClick={handleDelete} title="Excluir nota">
          ✕
        </button>
      </div>

      <input
        value={tagsInput}
        onChange={(e) => setTagsInput(e.target.value)}
        placeholder="tags separadas por vírgula (ex: analise, limites) — #tags no corpo também contam"
        className="w-full rounded-lg bg-[var(--color-well)] border border-[var(--color-line)] px-3 py-1.5 text-xs outline-none focus:border-[var(--color-brand)]"
      />

      <div className="flex items-center gap-2 min-w-0">
        <button
          className={`btn !py-1 !px-2.5 text-xs shrink-0 ${toolbarOpen ? "!border-[var(--color-brand)] !text-[var(--color-brand)]" : ""}`}
          onClick={toggleToolbar}
          aria-expanded={toolbarOpen}
          title="Barra de fórmulas LaTeX"
        >
          ∑ Fórmulas {toolbarOpen ? "▴" : "▾"}
        </button>
        <p className="text-[11px] text-[var(--color-mut)] truncate">
          Ctrl+B negrito · Ctrl+M fórmula · <code>[[</code> liga notas e aulas ·{" "}
          <code>&gt; [!teorema]</code> destaca
        </p>
      </div>

      {toolbarOpen && (
        <FormulaToolbar
          textareaRef={textareaRef}
          value={body}
          onInsert={(next, s, en) => {
            setBody(next);
            setPendingSelection({ start: s, end: en });
          }}
        />
      )}

      <div className="notes-split flex-1 grid md:grid-cols-2 gap-3 min-h-[320px]">
        <div className="relative">
          <textarea
            ref={textareaRef}
            value={body}
            onChange={(e) => onBodyChange(e.target.value, e.target.selectionStart)}
            onKeyUp={(e) => {
              if (e.key === "ArrowUp" || e.key === "ArrowDown") return; // navegação do menu de wikilink
              const t = e.currentTarget;
              setLinkQuery(findOpenWikilink(t.value, t.selectionStart));
            }}
            onKeyDown={onKeyDown}
            onClick={(e) => {
              const t = e.currentTarget;
              setLinkQuery(findOpenWikilink(t.value, t.selectionStart));
            }}
            placeholder={
              "Escreva em markdown + LaTeX ($…$ ou $$…$$).\nUse [[Título]] para linkar outra nota ou uma aula.\nUse > [!teorema] / [!definicao] / [!demonstracao] para blocos."
            }
            className="notes-textarea w-full h-full min-h-[300px] rounded-xl bg-[var(--color-well)] border border-[var(--color-line)] p-3 text-sm font-mono outline-none focus:border-[var(--color-brand)] resize-none"
          />
          {linkQuery && wikilinkCandidates.length > 0 && (
            <div className="notes-wikilink-menu mm-pop" role="listbox" aria-label="Sugestões de link">
              {wikilinkCandidates.map((c, i) => (
                <button
                  key={c.key}
                  type="button"
                  role="option"
                  aria-selected={i === linkSel}
                  className={i === linkSel ? "is-active" : undefined}
                  onMouseEnter={() => setLinkSel(i)}
                  onClick={() => selectWikilink(c)}
                >
                  <span>{c.label}</span>
                  <span className="block text-[10px] text-[var(--color-mut)]">
                    {c.kind === "aula" ? `aula · ${c.detail}` : c.detail ? `nota · ${c.detail}` : "nota"}
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>
        <div className="notes-preview rounded-xl bg-[var(--color-well)] border border-[var(--color-line)] p-3 overflow-y-auto">
          <Markdown>{body ? renderNoteMarkdown(body, notes) : "*A pré-visualização aparece aqui…*"}</Markdown>
        </div>
      </div>

      {linkSuggestions.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5 text-[11px] text-[var(--color-mut)]">
          <span>Ligar:</span>
          {linkSuggestions.map((s) => (
            <button
              key={s.noteId}
              type="button"
              onClick={() => acceptLinkSuggestion(s)}
              className="chip !py-0.5 !px-2 mm-lift transition-colors hover:!border-[var(--color-brand)] hover:!text-[var(--color-brand)]"
              title={`Ligar a "${s.title}"`}
            >
              {s.title}
            </button>
          ))}
        </div>
      )}

      <div className="flex items-center justify-between text-[11px] text-[var(--color-mut)]">
        <span>
          {wordCount} palavra{wordCount === 1 ? "" : "s"} · {body.length} caractere{body.length === 1 ? "" : "s"}
        </span>
        {bodyOnlyTags.length > 0 && (
          <span className="truncate">
            #tags do corpo:{" "}
            {bodyOnlyTags.slice(0, 6).map((t) => (
              <span key={t} className="text-[var(--color-brand2)] mr-1.5">
                #{t}
              </span>
            ))}
          </span>
        )}
      </div>
    </div>
  );
}
