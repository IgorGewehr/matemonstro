"use client";

import Link from "next/link";
import { useApp } from "@/components/AppState";
import { index, getTrack, isReady } from "@/lib/curriculum";
import { overallProgress, projectFinish, trackProgress } from "@/lib/scheduler";
import { ProgressBar, phaseColor } from "@/components/ui";

export default function PlanoPage() {
  const { ready, progress, settings } = useApp();
  if (!ready) return <div className="text-[var(--color-mut)]">Carregando…</div>;
  if (!isReady || !index)
    return <div className="panel p-6 text-[var(--color-mut)]">Currículo ainda não gerado. Rode <code>npm run bundle</code>.</div>;

  const now = Date.now();
  const overall = overallProgress(progress);
  const proj = projectFinish(progress, settings, now);

  function TrackChip({ id }: { id: string }) {
    const t = getTrack(id);
    if (!t) return null;
    const tp = trackProgress(t, progress);
    return (
      <Link href={`/trilha/${id}`} className="chip hover:border-[var(--color-brand)] mm-lift" style={{ borderColor: tp.pct === 100 ? "#00d3a7" : undefined }}>
        {tp.pct === 100 ? "✓ " : ""}{t.title}
      </Link>
    );
  }

  return (
    <div className="space-y-7 mm-enter">
      <header>
        <h1 className="text-2xl md:text-3xl font-extrabold tracking-tight">O Plano</h1>
        <p className="text-[var(--color-mut)] text-sm mt-1">
          O caminho completo, da base ao mestrado em matemática pura. {index.notes}
        </p>
      </header>

      <section className="panel p-5">
        <div className="flex justify-between items-center mb-2">
          <span className="font-semibold">Progresso total</span>
          <span className="text-sm text-[var(--color-mut)]">{overall.pct}%</span>
        </div>
        <ProgressBar pct={overall.pct} />
        <div className="grid grid-cols-3 gap-3 mt-4 text-center">
          <div>
            <div className="text-lg font-bold">{Math.round(proj.remainingHours)}h</div>
            <div className="text-xs text-[var(--color-mut)]">restantes</div>
          </div>
          <div>
            <div className="text-lg font-bold">{proj.weeklyHours.toFixed(1)}h</div>
            <div className="text-xs text-[var(--color-mut)]">por semana</div>
          </div>
          <div>
            <div className="text-lg font-bold">
              {proj.projectedDate ? new Date(proj.projectedDate).toLocaleDateString("pt-BR", { month: "short", year: "numeric" }) : "—"}
            </div>
            <div className="text-xs text-[var(--color-mut)]">conclusão projetada</div>
          </div>
        </div>
      </section>

      {/* Fases */}
      <div className="space-y-7 mm-stagger">
        {index.phases.map((ph) => (
          <section key={ph.id} className="panel p-5">
            <div className="flex items-center gap-2 mb-1">
              <span className="w-2.5 h-2.5 rounded-full" style={{ background: phaseColor(ph.id) }} />
              <h2 className="font-bold">{ph.label}</h2>
            </div>
            <p className="text-sm text-[var(--color-mut)] mb-3">{ph.goal}</p>
            <div className="flex flex-wrap gap-2">
              {ph.trackIds.map((id) => <TrackChip key={id} id={id} />)}
            </div>
          </section>
        ))}
      </div>

      {/* Milestones */}
      {index.milestones?.length > 0 && (
        <section>
          <h2 className="font-bold mb-3">Marcos</h2>
          <div className="space-y-2 mm-stagger">
            {index.milestones.map((m, i) => {
              const t = getTrack(m.after);
              const reached = t ? trackProgress(t, progress).pct === 100 : false;
              return (
                <div key={i} className={`panel p-4 flex gap-3 ${reached ? "border-[var(--color-brand2)]" : ""}`}>
                  <span className={`text-xl ${reached ? "text-[var(--color-brand2)]" : "text-[var(--color-mut)]"}`}>
                    {reached ? "✓" : "○"}
                  </span>
                  <div>
                    <div className="font-semibold">{m.label}</div>
                    <div className="text-sm text-[var(--color-mut)]">{m.youCanNow}</div>
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* Prelims de mestrado */}
      <section className="panel p-5">
        <h2 className="font-bold mb-1">Áreas de prova de mestrado (prelims)</h2>
        <p className="text-xs text-[var(--color-mut)] mb-3">As grandes frentes que toda banca cobra. Domine as três.</p>
        <div className="space-y-3">
          <PrelimRow label="Análise" ids={index.prelimMap.analise} TrackChip={TrackChip} />
          <PrelimRow label="Álgebra" ids={index.prelimMap.algebra} TrackChip={TrackChip} />
          <PrelimRow label="Topologia & Geometria" ids={index.prelimMap.topologiaGeometria} TrackChip={TrackChip} />
        </div>
      </section>

      {/* Concurso IF */}
      {index.ifConcursoCore?.length > 0 && (
        <section className="panel p-5 border-[var(--color-line2)]">
          <h2 className="font-bold mb-1 text-[var(--color-gold)]">Núcleo para concurso de IF</h2>
          <p className="text-xs text-[var(--color-mut)] mb-3">O que mais cai em provas de Instituto Federal — prioridade se um edital estiver chegando.</p>
          <div className="flex flex-wrap gap-2">
            {index.ifConcursoCore.map((id) => <TrackChip key={id} id={id} />)}
          </div>
        </section>
      )}
    </div>
  );
}

function PrelimRow({
  label,
  ids,
  TrackChip,
}: {
  label: string;
  ids: string[];
  TrackChip: (p: { id: string }) => React.ReactNode;
}) {
  return (
    <div>
      <div className="text-sm font-semibold mb-1.5">{label}</div>
      <div className="flex flex-wrap gap-2">{ids.map((id) => <TrackChip key={id} id={id} />)}</div>
    </div>
  );
}
