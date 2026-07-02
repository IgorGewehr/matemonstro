"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useApp } from "@/components/AppState";
import { getTrack } from "@/lib/curriculum";
import { trackProgress } from "@/lib/scheduler";
import { ProgressBar, Difficulty, Stars, phaseColor } from "@/components/ui";
import Markdown from "@/components/Markdown";

export default function TrackPage() {
  const params = useParams<{ id: string }>();
  const { ready, progress } = useApp();
  const track = getTrack(params.id);

  if (!ready) return <div className="panel p-6 text-sm text-[var(--color-mut)]">Carregando…</div>;
  if (!track) return <div className="panel p-6">Trilha não encontrada. <Link className="text-[var(--color-brand)]" href="/trilhas">Voltar</Link></div>;

  const tp = trackProgress(track, progress);

  return (
    <div className="space-y-6">
      <Link href="/trilhas" className="text-sm text-[var(--color-mut)] hover:text-[var(--color-txt)]">← Trilhas</Link>

      <header className="panel p-6" style={{ borderColor: phaseColor(track.phase) + "55" }}>
        <div className="flex items-center gap-2 mb-2">
          <span className="chip" style={{ borderColor: phaseColor(track.phase), color: phaseColor(track.phase) }}>{track.phaseLabel}</span>
          <Difficulty level={track.difficulty} />
          <span className="chip">{Math.round(track.estimatedHours)}h</span>
        </div>
        <h1 className="text-2xl md:text-3xl font-extrabold tracking-tight">{track.title}</h1>
        {track.tagline && <p className="text-[var(--color-mut)] mt-1">{track.tagline}</p>}
        <div className="mt-4">
          <ProgressBar pct={tp.pct} />
          <div className="text-xs text-[var(--color-mut)] mt-1">{tp.done}/{tp.total} subtópicos concluídos</div>
        </div>
        <div className="mt-4">
          <Link href={`/trilha/${track.id}/resumo`} className="btn">
            📄 Cola de revisão
          </Link>
        </div>
      </header>

      <section className="panel p-5">
        <h2 className="font-bold mb-2">Visão geral</h2>
        <Markdown>{track.summary}</Markdown>
        {track.bigPicture && (
          <div className="mt-4 p-4 rounded-xl bg-[var(--color-card)] border border-[var(--color-line2)]">
            <div className="text-xs uppercase tracking-wide text-[var(--color-gold)] mb-1">Por que isso importa</div>
            <Markdown>{track.bigPicture}</Markdown>
          </div>
        )}
        {track.prereqs.length > 0 && (
          <div className="mt-4 flex items-center gap-2 flex-wrap text-sm">
            <span className="text-[var(--color-mut)]">Pré-requisitos:</span>
            {track.prereqs.map((p) => {
              const pt = getTrack(p);
              return (
                <Link key={p} href={`/trilha/${p}`} className="chip hover:border-[var(--color-brand)]">
                  {pt?.title ?? p}
                </Link>
              );
            })}
          </div>
        )}
      </section>

      {/* Subtopicos */}
      <section>
        <h2 className="font-bold mb-3">Aulas / Subtópicos</h2>
        <div className="space-y-2">
          {track.subtopics.map((s, i) => {
            const st = progress.get(s.id)?.status ?? "todo";
            return (
              <Link
                key={s.id}
                href={`/estudar/${track.id}/${s.id}`}
                className="flex items-center gap-3 panel p-4 hover:border-[var(--color-brand)] transition-colors"
              >
                <span className="grid place-items-center w-8 h-8 rounded-lg bg-[var(--color-line)] text-sm font-bold text-[var(--color-mut)]">
                  {i + 1}
                </span>
                <div className="flex-1 min-w-0">
                  <div className="font-semibold">{s.title}</div>
                  {s.tagline && <div className="text-xs text-[var(--color-mut)] truncate">{s.tagline}</div>}
                </div>
                <span className="chip">{s.estimatedHours}h</span>
                <StatusBadge st={st} />
              </Link>
            );
          })}
        </div>
      </section>

      {/* Recursos */}
      <div className="grid md:grid-cols-2 gap-3">
        <section className="panel p-5">
          <h3 className="font-bold mb-3">📚 Livros</h3>
          <ul className="space-y-3">
            {track.primaryBooks.map((b, i) => (
              <li key={i} className="text-sm">
                <div className="font-semibold">{b.title}</div>
                <div className="text-[var(--color-mut)] text-xs">{b.author} {b.chapters && `• caps. ${b.chapters}`}</div>
                {b.note && <div className="text-[var(--color-mut)] text-xs mt-0.5 italic">{b.note}</div>}
              </li>
            ))}
          </ul>
        </section>
        <section className="panel p-5">
          <h3 className="font-bold mb-3">🎓 Recursos livres</h3>
          <ul className="space-y-2">
            {track.freeResources.map((r, i) => (
              <li key={i} className="text-sm flex items-start gap-2">
                <span className="chip !py-0.5">{r.kind}</span>
                <div>
                  <div>{r.title}</div>
                  {r.ref && <div className="text-[var(--color-mut)] text-xs">{r.ref}</div>}
                </div>
              </li>
            ))}
          </ul>
          {track.examRelevance && (
            <div className="mt-4 pt-4 border-t border-[var(--color-line)] text-sm">
              <div className="flex items-center justify-between">
                <span className="text-[var(--color-mut)]">Cai em concurso IF</span>
                <Stars n={track.examRelevance.ifConcurso} />
              </div>
              <div className="flex items-center justify-between mt-1">
                <span className="text-[var(--color-mut)]">Cai em mestrado</span>
                <Stars n={track.examRelevance.mestrado} />
              </div>
              {track.examRelevance.note && <p className="text-xs text-[var(--color-mut)] mt-2">{track.examRelevance.note}</p>}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

function StatusBadge({ st }: { st: string }) {
  if (st === "done") return <span className="chip !border-[var(--color-brand2)] !text-[var(--color-brand2)]">✓ feito</span>;
  if (st === "doing") return <span className="chip !border-[var(--color-brand)] !text-[var(--color-brand)]">em andamento</span>;
  return <span className="chip">a fazer</span>;
}
