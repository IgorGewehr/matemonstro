"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import NoteList from "@/components/notes/NoteList";
import NoteEditor from "@/components/notes/NoteEditor";
import { useNotes } from "@/components/notes/NotesProvider";
import { buildZip, notesToVaultFiles, vaultFileName } from "@/lib/vault-export";

export default function NotasPage() {
  const { notes, ready } = useNotes();
  const [selectedId, setSelectedId] = useState<string | undefined>(undefined);

  const live = useMemo(() => notes.filter((n) => !n.deleted), [notes]);

  useEffect(() => {
    if (!ready) return;
    if (selectedId && live.some((n) => n.id === selectedId)) return;
    setSelectedId(live[0]?.id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, live.length]);

  // Vault Obsidian de verdade: um .md por nota, wikilinks intactos, num .zip.
  function exportVault() {
    if (live.length === 0) return;
    const blob = buildZip(notesToVaultFiles(live));
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = vaultFileName();
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="space-y-4 pb-10">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h1 className="text-2xl md:text-3xl font-extrabold tracking-tight">🗒 Notas</h1>
          <p className="text-[var(--color-mut)] text-sm mt-1">
            Um Obsidian pra matemático: markdown + LaTeX ao vivo, [[wikilinks]] e grafo.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link href="/notas/grafo" className="btn text-sm">
            ❖ Grafo
          </Link>
          <button
            className="btn text-sm"
            onClick={exportVault}
            disabled={live.length === 0}
            title="Um .md por nota, wikilinks preservados — abre direto no Obsidian"
          >
            ⬇ Vault (.zip)
          </button>
        </div>
      </div>

      <div className="grid md:grid-cols-[280px_1fr] gap-4 items-start" style={{ minHeight: "70vh" }}>
        <div className="md:sticky md:top-4" style={{ height: "72vh" }}>
          <NoteList selectedId={selectedId} onSelect={setSelectedId} />
        </div>
        <div style={{ height: "72vh" }}>
          {selectedId ? (
            <NoteEditor noteId={selectedId} onDeleted={() => setSelectedId(undefined)} />
          ) : (
            <div className="panel p-8 h-full grid place-items-center text-center">
              <div>
                <p className="text-[var(--color-mut)] mb-3">
                  {ready ? "Selecione uma nota ou crie a primeira." : "Carregando notas…"}
                </p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
