"use client";

import { useMemo, useState } from "react";
import { useNotes } from "./NotesProvider";
import { searchNotes, allTagsOf } from "@/lib/notes";

export default function NoteList({
  selectedId,
  onSelect,
}: {
  selectedId?: string;
  onSelect: (id: string) => void;
}) {
  const { notes, ready, create } = useNotes();
  const [q, setQ] = useState("");
  const [tagFilter, setTagFilter] = useState<string | null>(null);

  const live = useMemo(() => notes.filter((n) => !n.deleted), [notes]);

  // Tags do campo + #tags citadas no corpo (estilo Obsidian).
  const allTags = useMemo(() => {
    const s = new Set<string>();
    live.forEach((n) => allTagsOf(n).forEach((t) => s.add(t)));
    return [...s].sort();
  }, [live]);

  const filtered = useMemo(() => {
    let list = q.trim() ? searchNotes(live, q) : live;
    if (tagFilter) list = list.filter((n) => allTagsOf(n).includes(tagFilter));
    return [...list].sort((a, b) => b.updatedAt - a.updatedAt);
  }, [live, q, tagFilter]);

  async function handleCreate() {
    const n = await create({ title: "Nota sem título", body: "", tags: [] });
    onSelect(n.id);
  }

  return (
    <div className="panel p-3 flex flex-col gap-3 h-full">
      <div className="flex items-center gap-2">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Buscar notas…"
          className="flex-1 rounded-lg bg-[var(--color-well)] border border-[var(--color-line)] px-3 py-1.5 text-sm outline-none focus:border-[var(--color-brand)]"
        />
        <button className="btn btn-primary !py-1.5 !px-2.5 text-sm" onClick={handleCreate} title="Nova nota">
          + Nota
        </button>
      </div>

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

      <div className="flex-1 overflow-y-auto -mx-1 px-1 space-y-1 mm-stagger">
        {!ready && <p className="text-xs text-[var(--color-mut)] px-2">Carregando…</p>}
        {ready && filtered.length === 0 && (
          <p className="text-xs text-[var(--color-mut)] px-2">Nenhuma nota ainda. Crie a primeira!</p>
        )}
        {filtered.map((n) => (
          <button
            key={n.id}
            onClick={() => onSelect(n.id)}
            className={`w-full text-left rounded-xl px-3 py-2 transition-all duration-200 border ${
              selectedId === n.id
                ? "bg-[var(--color-raise)] border-[var(--color-brand)]"
                : "border-transparent hover:bg-[var(--color-raise)]"
            }`}
          >
            <div className="text-sm font-semibold truncate">{n.title || "Sem título"}</div>
            <div className="text-xs text-[var(--color-mut)] truncate mt-0.5">
              {(n.body || "").replace(/\s+/g, " ").slice(0, 70)}
            </div>
            {allTagsOf(n).length > 0 && (
              <div className="flex flex-wrap gap-1 mt-1">
                {allTagsOf(n)
                  .slice(0, 4)
                  .map((t) => (
                    <span key={t} className="text-[10px] text-[var(--color-brand2)]">
                      #{t}
                    </span>
                  ))}
              </div>
            )}
          </button>
        ))}
      </div>
    </div>
  );
}
