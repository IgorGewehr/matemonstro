"use client";

// Card compacto do diário de estudo (dashboard): abre a nota do dia, criando-a
// com o template de reflexão se ainda não existir.

import { useRouter } from "next/navigation";
import { useState } from "react";
import { useNotes } from "./NotesProvider";
import { dailyTitle, dailyTemplate, findDailyNote } from "@/lib/daily";
import { noteHref } from "@/lib/notes";

export default function DailyNoteCard() {
  const router = useRouter();
  const { notes, ready, create } = useNotes();
  const [busy, setBusy] = useState(false);

  const existing = ready ? findDailyNote(notes) : undefined;

  async function open() {
    if (busy) return;
    if (existing) {
      router.push(noteHref(existing.id));
      return;
    }
    setBusy(true);
    try {
      const n = await create({ title: dailyTitle(), body: dailyTemplate(), tags: ["diario"] });
      router.push(noteHref(n.id));
    } finally {
      setBusy(false);
    }
  }

  return (
    <button
      onClick={open}
      disabled={!ready || busy}
      className="panel p-4 w-full text-left flex items-center gap-4 mm-lift hover:border-[var(--color-brand)] group"
    >
      <span
        className="grid place-items-center w-10 h-10 rounded-xl text-lg shrink-0"
        style={{ background: "color-mix(in srgb, var(--color-brand) 13%, transparent)", color: "var(--color-brand)" }}
        aria-hidden="true"
      >
        ✎
      </span>
      <span className="min-w-0 flex-1">
        <span className="block font-bold text-sm">Diário de estudo</span>
        <span className="block text-xs text-[var(--color-mut)] truncate">
          {existing ? "Continuar a entrada de hoje" : "Feche o dia: o que aprendi, onde travei, o que fica aberto"}
        </span>
      </span>
      <span className="text-[var(--color-mut)] group-hover:text-[var(--color-brand)] transition-colors" aria-hidden="true">
        {existing ? "↗" : "+"}
      </span>
    </button>
  );
}
