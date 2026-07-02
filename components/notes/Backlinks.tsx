"use client";

import Link from "next/link";
import { useNotes } from "./NotesProvider";
import { getBacklinks } from "@/lib/notes";
import { curriculumRefsOf, subHref } from "@/lib/notes-curriculum";
import { useCurriculumReady } from "@/lib/useCurriculum";
import type { Note } from "@/lib/types";

export default function Backlinks({ note }: { note: Note }) {
  const { notes } = useNotes();
  useCurriculumReady(); // re-renderiza quando o currículo (runtime) chega
  const backlinks = getBacklinks(note, notes);
  const lessons = curriculumRefsOf(note);

  if (backlinks.length === 0 && lessons.length === 0) {
    return (
      <p className="text-xs text-[var(--color-mut)]">
        Nenhuma nota referencia esta ainda — use [[{note.title}]] em outra nota. Você também pode citar aulas do
        currículo com [[Título da aula]].
      </p>
    );
  }

  return (
    <div className="space-y-2">
      {backlinks.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {backlinks.map((n) => (
            <Link
              key={n.id}
              href={`/notas/${n.id}`}
              className="chip hover:!border-[var(--color-brand)] hover:!text-[var(--color-brand)]"
            >
              ← {n.title || "Sem título"}
            </Link>
          ))}
        </div>
      )}
      {lessons.length > 0 && (
        <div className="flex flex-wrap gap-1.5 items-center">
          <span className="text-[11px] text-[var(--color-mut)]">Aulas citadas:</span>
          {lessons.map((ref) => (
            <Link
              key={ref.sub.id}
              href={subHref(ref)}
              className="chip hover:!border-[var(--color-brand2)] hover:!text-[var(--color-brand2)]"
            >
              ▤ {ref.sub.title}
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
