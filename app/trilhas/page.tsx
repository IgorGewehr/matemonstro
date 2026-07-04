"use client";

import Link from "next/link";
import { useApp } from "@/components/AppState";
import { tracksByPhase, isReady } from "@/lib/curriculum";
import { trackProgress, trackUnlocked } from "@/lib/scheduler";
import { ProgressBar, Difficulty, phaseColor } from "@/components/ui";

export default function TrilhasPage() {
  const { ready, progress } = useApp();
  if (!ready) return <div className="text-[var(--color-mut)]">Carregando…</div>;
  if (!isReady)
    return <div className="panel p-6 text-[var(--color-mut)]">Currículo ainda não gerado. Rode <code>npm run bundle</code>.</div>;

  const phases = tracksByPhase();

  return (
    <div className="space-y-8 mm-enter">
      <header>
        <h1 className="text-2xl md:text-3xl font-extrabold tracking-tight">Trilhas</h1>
        <p className="text-[var(--color-mut)] text-sm mt-1">
          Da base ao mestrado em {phases.reduce((s, p) => s + p.tracks.length, 0)} trilhas. Siga a ordem — cada
          uma libera a próxima.
        </p>
      </header>

      {phases.map(({ phase, tracks }) => (
        <section key={phase.id}>
          <div className="flex items-center gap-2 mb-3">
            <span className="w-2.5 h-2.5 rounded-full" style={{ background: phaseColor(phase.id) }} />
            <h2 className="font-bold">{phase.label}</h2>
            <span className="text-xs text-[var(--color-mut)]">{tracks.length} trilhas</span>
          </div>
          {phase.goal && <p className="text-sm text-[var(--color-mut)] mb-4 max-w-2xl">{phase.goal}</p>}

          <div className="grid sm:grid-cols-2 gap-3 mm-stagger">
            {tracks.map((t) => {
              const tp = trackProgress(t, progress);
              const unlocked = trackUnlocked(t, progress);
              const done = tp.done === tp.total && tp.total > 0;
              return (
                <Link
                  key={t.id}
                  href={`/trilha/${t.id}`}
                  className={`panel p-4 group hover:border-[var(--color-brand)] transition-colors relative mm-lift ${
                    !unlocked ? "opacity-70" : ""
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <h3 className="font-bold leading-tight pr-2">{t.title}</h3>
                    {done ? (
                      <span className="chip !border-[var(--color-brand2)] !text-[var(--color-brand2)]">✓</span>
                    ) : !unlocked ? (
                      <span className="chip" title="Pré-requisitos pendentes">bloqueado</span>
                    ) : null}
                  </div>
                  <p className="text-xs text-[var(--color-mut)] mt-1 line-clamp-2">{t.tagline ?? t.summary}</p>
                  <div className="flex items-center gap-2 mt-3 mb-2 flex-wrap">
                    <Difficulty level={t.difficulty} />
                    <span className="chip">{Math.round(t.estimatedHours)}h</span>
                    <span className="chip">{t.subtopics.length} aulas</span>
                  </div>
                  <ProgressBar pct={tp.pct} />
                  <div className="text-[11px] text-[var(--color-mut)] mt-1">
                    {tp.done}/{tp.total} concluídos
                  </div>
                </Link>
              );
            })}
          </div>
        </section>
      ))}
    </div>
  );
}
