"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import NoteEditor from "@/components/notes/NoteEditor";
import Backlinks from "@/components/notes/Backlinks";
import { useNotes } from "@/components/notes/NotesProvider";

export default function NoteFocusPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { notes, ready } = useNotes();
  const note = notes.find((n) => n.id === id && !n.deleted);

  return (
    <div className="space-y-4 pb-10">
      <div className="flex items-center justify-between text-sm">
        <Link href="/notas" className="text-[var(--color-mut)] hover:text-[var(--color-txt)]">
          ← Todas as notas
        </Link>
        <Link href="/notas/grafo" className="chip">
          ❖ Ver no grafo
        </Link>
      </div>

      {!ready && <div className="panel p-6 text-sm text-[var(--color-mut)]">Carregando…</div>}

      {ready && !note && (
        <div className="panel p-6 text-sm text-[var(--color-mut)]">
          Nota não encontrada. <Link className="text-[var(--color-brand)]" href="/notas">Voltar para notas</Link>
        </div>
      )}

      {note && (
        <>
          <div style={{ height: "70vh" }}>
            <NoteEditor noteId={note.id} onDeleted={() => router.push("/notas")} />
          </div>

          <section className="panel p-4">
            <h2 className="font-bold mb-2 text-sm">🔗 Referenciada em</h2>
            <Backlinks note={note} />
          </section>
        </>
      )}
    </div>
  );
}
