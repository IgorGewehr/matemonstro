"use client";

import Link from "next/link";
import { useApp } from "@/components/AppState";
import { isReady, index, getSubRef, getTrack } from "@/lib/curriculum";
import { todayPlan, overallProgress, projectFinish, totalCurriculumHours } from "@/lib/scheduler";
import { Ring, Stat, ProgressBar, phaseColor, LevelBar } from "@/components/ui";
import { computeXp } from "@/lib/gamification";
import { computeStreak } from "@/lib/streak";
import DailyNoteCard from "@/components/notes/DailyNoteCard";

export default function Dashboard() {
  const { ready, progress, cards, settings, log } = useApp();

  if (!ready) return <Loading />;

  if (!isReady)
    return (
      <div className="panel p-8 text-center">
        <div className="text-5xl mb-3">∑</div>
        <h1 className="text-xl font-bold mb-2">Não consegui carregar o currículo</h1>
        <p className="text-[var(--color-mut)] text-sm">
          Verifique a conexão e recarregue a página — depois da primeira visita o conteúdo fica salvo no aparelho e
          funciona offline.
        </p>
      </div>
    );

  const now = Date.now();
  const plan = todayPlan(cards, progress, settings, now);
  const overall = overallProgress(progress);
  const proj = projectFinish(progress, settings, now);
  const xp = computeXp({ progress, cards, log, settings }, now);
  const streakInfo = computeStreak(log, settings, now);
  const nextMilestone = index?.milestones?.find((m) => {
    const t = getTrack(m.after);
    if (!t) return false;
    return t.subtopics.some((s) => (progress.get(s.id)?.status ?? "todo") !== "done");
  });

  return (
    <div className="space-y-6">
      <header className="flex items-end justify-between flex-wrap gap-3">
        <div>
          <div className="chip mb-2">Hoje • {new Date(now).toLocaleDateString("pt-BR", { weekday: "long", day: "numeric", month: "long" })}</div>
          <h1 className="text-2xl md:text-3xl font-extrabold tracking-tight">
            Bora virar um monstro da matemática. 🦾
          </h1>
        </div>
        <div className="flex items-center gap-3">
          <LevelBar xp={xp} />
          <Ring pct={overall.pct} size={68} />
        </div>
      </header>

      {!settings.onboarded && (
        <Link href="/config" className="panel p-4 flex items-center gap-3 hover:border-[var(--color-brand)] transition-colors">
          <span className="text-2xl">⚙</span>
          <div className="flex-1">
            <div className="font-semibold">Configure seu tempo de estudo</div>
            <div className="text-xs text-[var(--color-mut)]">
              Diz quantos minutos por dia você tem e o app monta o plano em cima disso.
            </div>
          </div>
          <span className="btn btn-primary">Começar →</span>
        </Link>
      )}

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Stat value={`${overall.done}/${overall.total}`} label="subtópicos concluídos" />
        <Stat value={plan.reviews.length} label="revisões para hoje" accent={plan.reviews.length ? "#7c5cff" : undefined} />
        <Stat
          value={`${streakInfo.count}🔥`}
          label={
            streakInfo.status === "at-risk"
              ? "dias seguidos — estude hoje"
              : streakInfo.status === "protected"
                ? "dias seguidos — protegido"
                : "dias seguidos"
          }
          accent={
            streakInfo.status === "at-risk"
              ? "#ffb347"
              : streakInfo.status === "active"
                ? "#00d3a7"
                : undefined
          }
        />
        <Stat
          value={proj.projectedDate ? new Date(proj.projectedDate).toLocaleDateString("pt-BR", { month: "short", year: "numeric" }) : "—"}
          label="conclusão projetada"
          accent={proj.onTrack === false ? "#ff6b6b" : proj.onTrack ? "#00d3a7" : undefined}
        />
      </div>

      {/* Plano de hoje */}
      <section className="panel p-5">
        <div className="flex items-center justify-between mb-4 gap-2 flex-wrap">
          <h2 className="font-bold text-lg">Seu plano de hoje</h2>
          <div className="flex items-center gap-2">
            {(plan.reviews.length > 0 || plan.study.length > 0) && (
              <button
                className="btn btn-primary !py-1.5 text-sm"
                onClick={() => {
                  const first = plan.study[0];
                  const label =
                    plan.reviews.length > 0
                      ? `Revisão espaçada — ${plan.reviews.length} cartões`
                      : (first?.ref.sub.title ?? "Estudo focado");
                  window.dispatchEvent(new CustomEvent("mm:start-focus", { detail: { label } }));
                }}
                title="25 ou 50 min numa coisa só, sem distração"
              >
                ◉ Sessão de foco
              </button>
            )}
            <span className="chip">~{plan.totalMinutes} / {settings.minutesPerDay} min</span>
          </div>
        </div>

        {plan.reviews.length > 0 && (
          <Link href="/revisar" className="flex items-center gap-3 p-3 rounded-xl bg-[var(--color-card)] border border-[var(--color-line)] hover:border-[var(--color-brand)] transition-colors mb-3">
            <span className="text-xl">↻</span>
            <div className="flex-1">
              <div className="font-semibold">Revisão espaçada — {plan.reviews.length} cartões</div>
              <div className="text-xs text-[var(--color-mut)]">Memória primeiro. ~{plan.reviewMinutes} min para fixar o que já viu.</div>
            </div>
            <span className="btn btn-primary">Revisar →</span>
          </Link>
        )}

        {plan.study.length === 0 ? (
          <p className="text-sm text-[var(--color-mut)]">
            Tudo concluído por aqui. Explore as <Link href="/trilhas" className="text-[var(--color-brand)]">trilhas</Link>.
          </p>
        ) : (
          <div className="space-y-2">
            <div className="text-xs uppercase tracking-wide text-[var(--color-mut)] mb-1">Estudar</div>
            {plan.study.map((item) => (
              <Link
                key={item.ref.sub.id}
                href={`/estudar/${item.ref.track.id}/${item.ref.sub.id}`}
                className="flex items-center gap-3 p-3 rounded-xl bg-[var(--color-card)] border border-[var(--color-line)] hover:border-[var(--color-brand)] transition-colors"
              >
                <span className="w-1.5 h-10 rounded-full" style={{ background: phaseColor(item.ref.track.phase) }} />
                <div className="flex-1 min-w-0">
                  <div className="font-semibold truncate">{item.ref.sub.title}</div>
                  <div className="text-xs text-[var(--color-mut)] truncate">
                    {item.ref.track.title} • ~{item.minutes} min{" "}
                    {item.reason === "continuar" && <span className="text-[var(--color-brand2)]">• continuar</span>}
                  </div>
                </div>
                <span className="text-[var(--color-mut)]">→</span>
              </Link>
            ))}
          </div>
        )}
      </section>

      <DailyNoteCard />

      {nextMilestone && (
        <section className="panel p-5 border-[var(--color-line2)]">
          <div className="text-xs uppercase tracking-wide text-[var(--color-gold)] mb-1">Próximo marco</div>
          <div className="font-bold">{nextMilestone.label}</div>
          <p className="text-sm text-[var(--color-mut)] mt-1">{nextMilestone.youCanNow}</p>
        </section>
      )}

      <div className="grid md:grid-cols-2 gap-3">
        <div className="panel p-5">
          <div className="text-sm font-semibold mb-2">Progresso geral</div>
          <ProgressBar pct={overall.pct} />
          <div className="text-xs text-[var(--color-mut)] mt-2">
            {overall.done} de {overall.total} subtópicos • {Math.round(proj.remainingHours)}h restantes de {Math.round(totalCurriculumHours())}h totais
          </div>
        </div>
        <Link href="/plano" className="panel p-5 hover:border-[var(--color-brand)] transition-colors">
          <div className="text-sm font-semibold mb-1">Ritmo</div>
          <div className="text-xs text-[var(--color-mut)] leading-relaxed">
            {proj.weeklyHours.toFixed(1)}h/semana • faltam ~{Math.ceil(proj.weeksLeft)} semanas no ritmo atual.
            {settings.goalDate && proj.onTrack === false && (
              <span className="text-[#ff8080]"> Acelere para bater sua meta.</span>
            )}
            {settings.goalDate && proj.onTrack && <span className="text-[var(--color-brand2)]"> No ritmo para a meta. 💪</span>}
          </div>
          <div className="mt-2 text-[var(--color-brand)] text-sm">Ver plano completo →</div>
        </Link>
      </div>
    </div>
  );
}

function Loading() {
  return (
    <div className="grid place-items-center h-[60vh]">
      <div className="text-center">
        <div className="text-4xl animate-pulse">∑</div>
        <div className="text-[var(--color-mut)] text-sm mt-2">Carregando seu progresso…</div>
      </div>
    </div>
  );
}
