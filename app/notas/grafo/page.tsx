"use client";

import Link from "next/link";
import NotesGraph from "@/components/notes/NotesGraph";

export default function NotesGraphPage() {
  return (
    <div className="flex flex-col h-[calc(100vh-6.5rem)] md:h-[calc(100vh-8.25rem)] -mb-4 mm-enter">
      <div className="flex items-center justify-between flex-wrap gap-2 pb-2">
        <div className="flex items-center gap-3 min-w-0">
          <Link href="/notas" className="text-[var(--color-mut)] hover:text-[var(--color-txt)] text-sm shrink-0">
            ← Notas
          </Link>
          <h1 className="text-xl md:text-2xl font-extrabold tracking-tight truncate">❖ Grafo de notas</h1>
          <p className="hidden lg:block text-[var(--color-mut)] text-xs truncate">
            Notas, aulas e pastas ligadas por [[wikilinks]] e pertencimento — arraste, dê zoom, clique para abrir.
          </p>
        </div>
      </div>

      <div className="flex-1 min-h-0">
        <NotesGraph />
      </div>
    </div>
  );
}
