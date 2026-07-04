"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import NoteList from "@/components/notes/NoteList";
import NoteEditor from "@/components/notes/NoteEditor";
import { useNotes } from "@/components/notes/NotesProvider";
import { buildZip, notesToVaultFiles, vaultFileName } from "@/lib/vault-export";

const LIST_KEY = "mm:notas-lista"; // "on" | "off"

export default function NotasPage() {
  const { notes, ready } = useNotes();
  const [selectedId, setSelectedId] = useState<string | undefined>(undefined);
  // Coluna da lista retrátil: escrita imersiva usa a largura inteira.
  const [showList, setShowList] = useState(true);
  useEffect(() => {
    try {
      setShowList(localStorage.getItem(LIST_KEY) !== "off");
    } catch {
      /* ignora */
    }
  }, []);
  function toggleList() {
    setShowList((v) => {
      try {
        localStorage.setItem(LIST_KEY, v ? "off" : "on");
      } catch {
        /* ignora */
      }
      return !v;
    });
  }

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
    <div className="flex flex-col h-[calc(100vh-6.5rem)] md:h-[calc(100vh-5.5rem)] -mb-4 mm-enter">
      <div className="flex items-center justify-between flex-wrap gap-2 pb-3">
        <div className="flex items-center gap-3 min-w-0">
          <h1 className="text-xl md:text-2xl font-extrabold tracking-tight">Notas</h1>
          <p className="hidden lg:block text-[var(--color-mut)] text-xs truncate">
            Markdown + LaTeX ao vivo, [[wikilinks]] e grafo — {live.length}{" "}
            {live.length === 1 ? "nota" : "notas"}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            className="btn text-sm hidden md:inline-flex"
            onClick={toggleList}
            aria-pressed={!showList}
            title={showList ? "Esconder a lista (escrita imersiva)" : "Mostrar a lista de notas"}
          >
            {showList ? "⟨ Lista" : "⟩ Lista"}
          </button>
          <Link href="/notas/grafo" className="btn text-sm">
            ❖ Grafo
          </Link>
          <button
            className="btn text-sm"
            onClick={exportVault}
            disabled={live.length === 0}
            title="Um .md por nota, wikilinks preservados — abre direto no Obsidian"
          >
            Vault
          </button>
        </div>
      </div>

      <div
        className={`grid gap-4 items-stretch flex-1 min-h-0 ${
          showList ? "md:grid-cols-[280px_minmax(0,1fr)]" : "md:grid-cols-[minmax(0,1fr)]"
        }`}
      >
        {/* Mobile: lista sempre empilhada (h-48); desktop: coluna retrátil. */}
        <div className={`min-h-0 h-48 md:h-full ${showList ? "" : "md:hidden"}`}>
          <NoteList selectedId={selectedId} onSelect={setSelectedId} />
        </div>
        <div className="min-h-0 h-full">
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
