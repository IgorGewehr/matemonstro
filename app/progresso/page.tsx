"use client";

import { useApp } from "@/components/AppState";
import { curriculum, tracks, isReady } from "@/lib/curriculum";
import { projectFinish } from "@/lib/scheduler";
import { Stat, ProgressBar, phaseColor } from "@/components/ui";
import Heatmap from "@/components/Heatmap";
import {
  heatmapBuckets,
  hoursByArea,
  retentionStats,
  dueForecast,
  trackMasteryPct,
} from "@/lib/analytics";

function fmtH(h: number): string {
  if (h < 1) return `${Math.round(h * 60)}min`;
  return `${h.toFixed(h < 10 ? 1 : 0)}h`;
}

export default function ProgressoPage() {
  const { ready, progress, cards, log, events, settings } = useApp();

  if (!ready) return <div className="text-[var(--color-mut)]">Carregando…</div>;
  if (!isReady)
    return (
      <div className="panel p-6 text-[var(--color-mut)]">
        Currículo ainda não gerado. Rode <code>npm run bundle</code>.
      </div>
    );

  const now = Date.now();
  const heat = heatmapBuckets(log, 26, now);
  const areas = hoursByArea(progress, curriculum);
  const stats = retentionStats(cards, events ?? [], now);
  const forecast = dueForecast(cards, now, 30);
  const proj = projectFinish(progress, settings, now);

  return (
    <div className="space-y-7 mm-enter">
      <header>
        <h1 className="text-2xl md:text-3xl font-extrabold tracking-tight">Progresso</h1>
        <p className="text-[var(--color-mut)] text-sm mt-1">
          Não é sobre cobertura — é sobre o que a sua memória realmente segura.
        </p>
      </header>

      {/* 1 — Heatmap */}
      <section className="panel p-5">
        <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
          <h2 className="font-bold text-lg">Sua constância</h2>
          <div className="flex gap-2">
            <span className="chip">{heat.activeDays} dias ativos</span>
            <span className="chip">{Math.round(heat.totalMinutes)} min</span>
            <span className="chip">{heat.totalReviews} revisões</span>
          </div>
        </div>
        <Heatmap data={heat} />
      </section>

      {/* 2 — Horas por área */}
      <section className="panel p-5">
        <h2 className="font-bold text-lg mb-4">Onde foram suas horas</h2>
        {areas.every((a) => a.doneHours === 0) ? (
          <p className="text-sm text-[var(--color-mut)]">
            Ainda não há subtópicos concluídos. Conclua um para ver as horas somarem aqui.
          </p>
        ) : (
          <div className="space-y-4">
            {areas.map((a) => {
              const pct = a.totalHours ? (a.doneHours / a.totalHours) * 100 : 0;
              return (
                <div key={a.phaseId}>
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="flex items-center gap-2 font-semibold text-sm">
                      <span className="w-2.5 h-2.5 rounded-full" style={{ background: phaseColor(a.phaseId) }} />
                      {a.label}
                    </span>
                    <span className="text-xs text-[var(--color-mut)]">
                      {fmtH(a.doneHours)} / {fmtH(a.totalHours)}
                    </span>
                  </div>
                  <ProgressBar pct={pct} />
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* 3 — Saúde da memória */}
      <section className="panel p-5">
        <h2 className="font-bold text-lg mb-4">Saúde da memória</h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mm-stagger">
          <Stat
            value={`${Math.round(stats.matureRatio * 100)}%`}
            label={`cartões maduros (${stats.mature}/${stats.total})`}
            accent={stats.matureRatio >= 0.5 ? "#00d3a7" : undefined}
          />
          <Stat value={stats.avgEase.toFixed(2)} label="facilidade média" />
          <Stat value={stats.totalLapses} label="tropeços (lapses)" accent={stats.totalLapses > 0 ? "#ffb347" : undefined} />
          <Stat
            value={stats.leechCount}
            label="cartões-sanguessuga"
            accent={stats.leechCount > 0 ? "#ff6b6b" : undefined}
          />
        </div>

        {/* Forecast 30 dias */}
        <div className="mt-5">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-semibold">Carga de revisão — próximos 30 dias</span>
            <span className="text-xs text-[var(--color-mut)]">
              {forecast.overdue > 0 && <span className="text-[#ff8080]">{forecast.overdue} vencidos • </span>}
              {forecast.total} agendados
            </span>
          </div>
          <div className="flex items-end gap-[3px] h-24">
            {forecast.buckets.map((b) => {
              const h = forecast.max ? (b.count / forecast.max) * 100 : 0;
              return (
                <div
                  key={b.offset}
                  className="flex-1 rounded-t-[2px] bg-[var(--color-brand)] min-h-[2px] transition-all"
                  style={{ height: `${Math.max(b.count ? 6 : 2, h)}%`, opacity: b.count ? 0.9 : 0.25 }}
                  title={`${b.day}: ${b.count} revisões`}
                />
              );
            })}
          </div>
          <div className="flex justify-between text-[11px] text-[var(--color-mut)] mt-1">
            <span>hoje</span>
            <span>+30 dias</span>
          </div>
        </div>
      </section>

      {/* 4 — Retenção verdadeira e por trilha */}
      <section className="panel p-5">
        <h2 className="font-bold text-lg mb-1">Retenção real</h2>
        {stats.recallRate === null ? (
          <p className="text-sm text-[var(--color-mut)] mb-4">
            Ainda sem histórico de revisões calibradas. Enquanto isso, sua retrievability média
            estimada é <strong className="text-[var(--color-txt)]">{Math.round(stats.avgRetrievability * 100)}%</strong>.
          </p>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mb-4">
            <Stat
              value={`${Math.round((stats.recallRate ?? 0) * 100)}%`}
              label={`acerto em revisões (${stats.recalled}/${stats.reviewsLogged})`}
              accent="#00d3a7"
            />
            <Stat value={`${Math.round(stats.avgRetrievability * 100)}%`} label="retrievability média estimada" />
            {stats.avgDifficulty !== null && (
              <Stat value={stats.avgDifficulty.toFixed(1)} label="dificuldade média" />
            )}
          </div>
        )}

        <div className="text-sm font-semibold mb-2 mt-2">Domínio por trilha</div>
        <div className="space-y-3">
          {tracks
            .map((t) => ({ t, pct: trackMasteryPct(t, progress, cards, now) }))
            .filter(({ t }) =>
              t.subtopics.some((s) => (progress.get(s.id)?.status ?? "todo") !== "todo")
            )
            .sort((a, b) => b.pct - a.pct)
            .map(({ t, pct }) => (
              <div key={t.id}>
                <div className="flex items-center justify-between mb-1.5">
                  <span className="flex items-center gap-2 text-sm">
                    <span className="w-2 h-2 rounded-full" style={{ background: phaseColor(t.phase) }} />
                    {t.title}
                  </span>
                  <span className="text-xs text-[var(--color-mut)]">{pct}%</span>
                </div>
                <ProgressBar pct={pct} />
              </div>
            ))}
          {tracks.every((t) => t.subtopics.every((s) => (progress.get(s.id)?.status ?? "todo") === "todo")) && (
            <p className="text-sm text-[var(--color-mut)]">
              Comece uma trilha para acompanhar seu domínio (cobertura × memória) aqui.
            </p>
          )}
        </div>
      </section>

      {/* 5 — Projeção */}
      <section className="panel p-5">
        <h2 className="font-bold text-lg mb-3">Projeção</h2>
        <div className="grid grid-cols-3 gap-3 text-center">
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
              {proj.projectedDate
                ? new Date(proj.projectedDate).toLocaleDateString("pt-BR", { month: "short", year: "numeric" })
                : "—"}
            </div>
            <div className="text-xs text-[var(--color-mut)]">conclusão projetada</div>
          </div>
        </div>
      </section>
    </div>
  );
}
