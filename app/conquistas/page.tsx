"use client";

import { useMemo } from "react";
import { useApp } from "@/components/AppState";
import { LevelBar, Stat } from "@/components/ui";
import {
  computeXp,
  computeStats,
  listAchievements,
  levelFor,
} from "@/lib/gamification";

export default function ConquistasPage() {
  const { ready, progress, cards, log, settings } = useApp();

  const derived = useMemo(() => {
    if (!ready) return null;
    const input = { progress, cards, log, settings };
    const now = Date.now();
    const xp = computeXp(input, now);
    return {
      xp,
      level: levelFor(xp),
      stats: computeStats(input, now),
      achievements: listAchievements(input, now),
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, progress, cards, log, settings]);

  if (!ready || !derived) {
    return (
      <div className="grid place-items-center h-[60vh]">
        <div className="text-center">
          <div className="text-4xl animate-pulse">✦</div>
          <div className="text-[var(--color-mut)] text-sm mt-2">Carregando conquistas…</div>
        </div>
      </div>
    );
  }

  const { xp, stats, achievements } = derived;
  const unlocked = achievements.filter((a) => a.unlocked).length;

  return (
    <div className="space-y-6">
      <header className="flex items-end justify-between flex-wrap gap-3">
        <div>
          <div className="chip mb-2">Conquistas ✦</div>
          <h1 className="text-2xl md:text-3xl font-extrabold tracking-tight">
            Sua jornada de monstro
          </h1>
          <p className="text-sm text-[var(--color-mut)] mt-1">
            Tudo aqui é derivado do seu progresso real — subtópicos, revisões e sequência.
          </p>
        </div>
        <LevelBar xp={xp} />
      </header>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Stat value={`${xp}`} label="XP total" accent="var(--color-gold)" />
        <Stat
          value={`${unlocked}/${achievements.length}`}
          label="conquistas"
          accent={unlocked ? "var(--color-brand)" : undefined}
        />
        <Stat value={`${stats.streak}🔥`} label="dias seguidos" />
        <Stat value={`${stats.reviewCount}`} label="revisões feitas" />
      </div>

      <section>
        <div className="text-xs uppercase tracking-wide text-[var(--color-mut)] mb-3">
          Medalhas
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
          {achievements.map((a) => (
            <div
              key={a.id}
              className={`panel p-4 flex flex-col gap-2 transition-colors ${
                a.unlocked ? "border-[var(--color-brand)]" : "opacity-55"
              }`}
              title={a.unlocked ? "Desbloqueada" : "Bloqueada"}
            >
              <div className="flex items-center justify-between">
                <span
                  className={`text-3xl ${a.unlocked ? "" : "grayscale"}`}
                  aria-hidden
                  style={a.unlocked ? undefined : { filter: "grayscale(1) opacity(0.6)" }}
                >
                  {a.icon}
                </span>
                {a.unlocked ? (
                  <span className="chip !px-2 !py-0.5 !text-[var(--color-brand2)]">✓</span>
                ) : (
                  <span className="chip !px-2 !py-0.5 text-[var(--color-mut)]">🔒</span>
                )}
              </div>
              <div className="font-bold text-sm">{a.title}</div>
              <div className="text-xs text-[var(--color-mut)] leading-snug">{a.desc}</div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
