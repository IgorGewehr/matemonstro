"use client";

import Link from "next/link";
import NotesGraph from "@/components/notes/NotesGraph";

export default function NotesGraphPage() {
  return (
    <div className="space-y-4 pb-10 mm-enter">
      <div className="flex items-center justify-between text-sm">
        <Link href="/notas" className="text-[var(--color-mut)] hover:text-[var(--color-txt)]">
          ← Todas as notas
        </Link>
      </div>

      <header>
        <h1 className="text-2xl md:text-3xl font-extrabold tracking-tight">❖ Grafo de notas</h1>
        <p className="text-[var(--color-mut)] text-sm mt-1">
          Cada nó é uma nota; as arestas vêm dos [[wikilinks]] no corpo do texto. Clique num nó para abrir a nota.
        </p>
      </header>

      <NotesGraph />
    </div>
  );
}
