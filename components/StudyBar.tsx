"use client";

// Barra de estudo: uma linha fina e permanente (desktop) acima do conteúdo com
// as três alavancas de foco — retomar a última aula em 1 clique, a meta do dia
// sempre visível e o modo Foco à mão. Ela INTEGRA o FocusSession existente
// (dispara mm:start-focus; o timer continua sendo o pill flutuante) e some
// junto com a nav no modo imersão (html[data-mm-focus], CSS em globals).

import Link from "next/link";
import { useMemo } from "react";
import { useApp } from "./AppState";
import { getSubRef } from "@/lib/curriculum";
import { computeStreak } from "@/lib/streak";

function todayKey(): string {
  return new Date().toISOString().slice(0, 10);
}

export default function StudyBar() {
  const { ready, progress, log, settings } = useApp();

  // Última aula em andamento (status "doing" mais recente) — o clique de
  // menor fricção para voltar ao fluxo.
  const resume = useMemo(() => {
    if (!ready) return null;
    let best: { id: string; startedAt: number } | null = null;
    for (const p of progress.values()) {
      if (p.status !== "doing") continue;
      const t = p.startedAt ?? 0;
      if (!best || t > best.startedAt) best = { id: p.id, startedAt: t };
    }
    if (!best) return null;
    const ref = getSubRef(best.id);
    if (!ref) return null;
    return {
      href: `/estudar/${ref.track.id}/${ref.sub.id}`,
      title: ref.sub.title,
      track: ref.track.title,
    };
  }, [ready, progress]);

  const todayMin = ready ? (log.get(todayKey())?.minutes ?? 0) : 0;
  const goalMin = Math.max(1, settings.minutesPerDay || 60);
  const pct = Math.max(0, Math.min(100, Math.round((todayMin / goalMin) * 100)));
  const streak = ready ? computeStreak(log, settings).count : 0;

  function startFocus() {
    window.dispatchEvent(
      new CustomEvent("mm:start-focus", { detail: { label: resume?.title ?? "Estudo focado" } })
    );
  }

  return (
    <div className="mm-studybar hidden md:flex items-center gap-4 h-11 shrink-0 px-4 lg:px-6 border-b border-[var(--color-line)] bg-[var(--color-scrim)] backdrop-blur-xl sticky top-0 z-40">
      {resume ? (
        <Link
          href={resume.href}
          className="group flex items-center gap-2 min-w-0 text-sm"
          title={`${resume.track} — voltar para onde você parou`}
        >
          <span className="text-[var(--color-brand)]" aria-hidden="true">▸</span>
          <span className="text-[var(--color-mut)] shrink-0">Continuar</span>
          <span className="truncate font-medium group-hover:text-[var(--color-brand)] transition-colors">
            {resume.title}
          </span>
        </Link>
      ) : (
        <Link
          href="/trilhas"
          className="flex items-center gap-2 text-sm text-[var(--color-mut)] hover:text-[var(--color-txt)] transition-colors"
        >
          <span className="text-[var(--color-brand)]" aria-hidden="true">▸</span>
          Escolher a próxima aula
        </Link>
      )}

      <div className="ml-auto flex items-center gap-4 shrink-0">
        <div
          className="flex items-center gap-2 text-xs text-[var(--color-mut)]"
          title={`${todayMin} de ${goalMin} minutos de estudo hoje`}
        >
          <span>
            <span className="tabular-nums font-semibold text-[var(--color-txt)]">{todayMin}</span>
            <span aria-hidden="true">/</span>
            {goalMin} min
          </span>
          <span
            className="w-14 h-1 rounded-full bg-[var(--color-raise)] overflow-hidden"
            role="progressbar"
            aria-valuenow={pct}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-label="Progresso da meta diária"
          >
            <span
              className="block h-full transition-[width] duration-500"
              style={{ width: `${pct}%`, background: "var(--grad-brand)" }}
            />
          </span>
        </div>

        {streak > 0 && (
          <span className="text-xs" title={`${streak} dia${streak === 1 ? "" : "s"} seguidos de estudo`}>
            <span className="text-[var(--color-warm)]" aria-hidden="true">Δ</span>{" "}
            <span className="tabular-nums font-semibold">{streak}</span>
          </span>
        )}

        <button className="btn !py-1 !px-3 text-xs" onClick={startFocus} title="Sessão de foco (25 ou 50 min)">
          <span className="text-[var(--color-brand)]" aria-hidden="true">◉</span> Foco
        </button>
      </div>
    </div>
  );
}
