"use client";

// Painel de notas do subtopico, exibido na tela de estudo (app/estudar/[trackId]/[subId]).
//
// Depende do contrato definido pela spec "07-notes-core":
//   components/notes/NotesProvider.tsx exporta:
//     - useNotes(): { notes: Note[]; ready: boolean; create(input): Promise<Note>; ... }
//   lib/types.ts exporta (aditivo):
//     - interface Note { id, title, body, tags, subtopicId?, createdAt, updatedAt, deleted? }
//
// Este componente e retrocompativel: se nao houver notas para o subtopico, so mostra o
// botao de criar. Nao remove nem altera nada da tela de estudo existente.

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo } from "react";
import { useNotes } from "@/components/notes/NotesProvider";
import { getSubRef } from "@/lib/curriculum";

function snippet(body: string, len = 90): string {
  const plain = (body || "")
    .replace(/\[\[([^\]]+)\]\]/g, "$1")
    .replace(/[#*_`>]/g, "")
    .replace(/\s+/g, " ")
    .trim();
  if (plain.length <= len) return plain;
  return plain.slice(0, len).trimEnd() + "…";
}

function formatDate(ts: number): string {
  if (!ts) return "";
  try {
    return new Date(ts).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "2-digit" });
  } catch {
    return "";
  }
}

export default function SubtopicNotes({ subId, trackId }: { subId: string; trackId: string }) {
  const { notes, ready, create } = useNotes();
  const router = useRouter();
  const ref = getSubRef(subId);
  const subTitle = ref?.sub.title ?? subId;

  const items = useMemo(
    () =>
      (notes ?? [])
        .filter((n) => !n.deleted && n.subtopicId === subId)
        .sort((a, b) => b.updatedAt - a.updatedAt),
    [notes, subId]
  );

  async function novaNota() {
    const note = await create({
      title: `Notas — ${subTitle}`,
      body: "",
      tags: [trackId].filter(Boolean),
      subtopicId: subId,
    });
    if (note?.id) router.push(`/notas/${note.id}`);
    else router.push("/notas");
  }

  return (
    <section className="panel p-5">
      <div className="flex items-center justify-between mb-3">
        <h2 className="font-bold">
          🗒️ Notas deste subtópico{items.length > 0 ? ` (${items.length})` : ""}
        </h2>
        <Link href="/notas" className="text-xs text-[var(--color-mut)] hover:text-[var(--color-txt)]">
          Ver todas →
        </Link>
      </div>

      {!ready && <p className="text-sm text-[var(--color-mut)]">Carregando notas…</p>}

      {ready && items.length === 0 && (
        <p className="text-sm text-[var(--color-mut)] mb-3">
          Nenhuma nota vinculada a este subtópico ainda. Anote demonstrações, dúvidas e
          referências cruzadas com <code>[[wikilinks]]</code>.
        </p>
      )}

      {items.length > 0 && (
        <ul className="space-y-2 mb-3">
          {items.map((n) => (
            <li key={n.id}>
              <Link
                href={`/notas/${n.id}`}
                className="block p-3 rounded-xl bg-[var(--color-card)] border border-[var(--color-line)] hover:border-[var(--color-brand)] transition-colors"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="font-medium truncate">{n.title || "Sem título"}</span>
                  <span className="text-[10px] text-[var(--color-mut)] shrink-0">
                    {formatDate(n.updatedAt)}
                  </span>
                </div>
                {n.body?.trim() && (
                  <p className="text-xs text-[var(--color-mut)] mt-1 line-clamp-2">{snippet(n.body)}</p>
                )}
                {n.tags && n.tags.length > 0 && (
                  <div className="flex flex-wrap gap-1 mt-2">
                    {n.tags.map((t) => (
                      <span key={t} className="chip !py-0 !px-1.5 text-[10px]">
                        #{t}
                      </span>
                    ))}
                  </div>
                )}
              </Link>
            </li>
          ))}
        </ul>
      )}

      <button className="btn" onClick={novaNota}>
        + Nova nota deste subtópico
      </button>
    </section>
  );
}
