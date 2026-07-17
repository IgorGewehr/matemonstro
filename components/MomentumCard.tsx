"use client";

// MomentumCard — o primeiro olhar da home. Mede a CHAMA (aparecer, não completar),
// mostra o quanto pouquinhos somaram, e oferece o gatilho de 2 minutos que garante
// uma vitória hoje. É a peça central contra a procrastinação.

import Link from "next/link";
import { useMemo } from "react";
import { useApp } from "./AppState";
import { computeMomentum, tierLabel, momentumNudge } from "@/lib/momentum";
import { computeStreak, bestStreak } from "@/lib/streak";
import { currentSeal } from "@/lib/dailygoal";

function formatMin(m: number): string {
  if (m < 60) return `${Math.round(m)} min`;
  const h = m / 60;
  return `${h.toFixed(h < 10 ? 1 : 0)} h`;
}

const TIER_COLOR: Record<string, string> = {
  "em-chamas": "#ff7a45",
  quente: "#f6c453",
  morno: "#00d3a7",
  frio: "#6b7280",
};

export default function MomentumCard() {
  const { ready, log, settings } = useApp();
  const m = useMemo(
    () => (ready ? computeMomentum(log, settings) : null),
    [ready, log, settings]
  );
  const streakCount = useMemo(
    () => (ready ? computeStreak(log, settings).count : 0),
    [ready, log, settings]
  );
  const record = useMemo(() => (ready ? bestStreak(log, settings) : 0), [ready, log, settings]);
  if (!m) return null;

  const seal = currentSeal(record);
  const t = tierLabel(m.tier);
  const color = TIER_COLOR[m.tier] ?? "#6b7280";
  const nudge = momentumNudge(m);

  return (
    <section className="panel p-5 mm-lift" style={{ borderColor: m.studiedToday ? undefined : color }}>
      {m.comeback && (
        <div
          className="mb-3 rounded-xl px-3 py-2 text-sm font-medium"
          style={{ background: "color-mix(in srgb, #00d3a7 14%, transparent)", color: "#00d3a7" }}
        >
          Bom te ver de volta depois de {m.daysSinceLast} dias. Sem culpa — o que conta é você estar aqui agora.
        </div>
      )}

      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-3 min-w-0">
          <span className="text-3xl leading-none" aria-hidden="true">{t.glyph}</span>
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-bold text-lg">Momentum</span>
              <span className="chip !py-0.5" style={{ color }}>{t.label}</span>
              {seal && (
                <span className="chip !py-0.5" title={`Selo ${seal.label} — sua melhor sequência`}>
                  {seal.glyph} {seal.label}
                </span>
              )}
            </div>
            <p className="text-xs text-[var(--color-mut)] mt-0.5">{nudge}</p>
          </div>
        </div>

        {!m.studiedToday ? (
          <Link href="/relampago" className="btn btn-primary shrink-0" title="Uma sessão-relâmpago de ~2 minutos">
            ⚡ Começar — 2 min
          </Link>
        ) : (
          <div className="flex items-center gap-2 shrink-0">
            <span className="chip !text-[#00d3a7] !border-[#00d3a7]" title={`${m.todayMinutes} min hoje`}>
              ✓ hoje já contou
            </span>
            <Link href="/relampago" className="btn !py-1.5 text-sm" title="Bônus: mais uma dose rápida">
              ⚡ +2 min
            </Link>
          </div>
        )}
      </div>

      {/* Barra de momentum */}
      <div className="mt-4">
        <div className="h-2 w-full rounded-full bg-[var(--color-raise)] overflow-hidden">
          <div
            className="h-full transition-[width] duration-700"
            style={{ width: `${m.score}%`, background: `linear-gradient(90deg, ${color}, color-mix(in srgb, ${color} 60%, #fff))` }}
          />
        </div>
      </div>

      {/* Acumulação: pouquinhos que somam */}
      <div className="mt-4 grid grid-cols-3 gap-2 text-center">
        <div className="rounded-xl bg-[var(--color-well)] border border-[var(--color-line)] p-2.5">
          <div className="font-bold tabular-nums">{formatMin(m.totalMinutes)}</div>
          <div className="text-[10px] text-[var(--color-mut)] uppercase tracking-wide">somados na vida</div>
        </div>
        <div className="rounded-xl bg-[var(--color-well)] border border-[var(--color-line)] p-2.5">
          <div className="font-bold tabular-nums">{m.totalDays}</div>
          <div className="text-[10px] text-[var(--color-mut)] uppercase tracking-wide">dias no jogo</div>
        </div>
        <div className="rounded-xl bg-[var(--color-well)] border border-[var(--color-line)] p-2.5">
          <div className="font-bold tabular-nums">{m.weekDays}/7</div>
          <div className="text-[10px] text-[var(--color-mut)] uppercase tracking-wide">dias na semana</div>
        </div>
      </div>

      {record > 0 && (
        <p className="mt-3 text-center text-xs text-[var(--color-mut)]">
          🏆 Melhor sequência: <strong className="text-[var(--color-txt)]">{record} {record === 1 ? "dia" : "dias"}</strong>
          {streakCount === 0
            ? " — continua de pé. Uma pausa não apaga o que você construiu."
            : streakCount < record
              ? ` · sequência atual: ${streakCount}`
              : " · e você está nela agora."}
        </p>
      )}

      {settings.anchorText && settings.anchorText.trim() && (
        <p className="mt-2 text-center text-xs text-[var(--color-mut)]">
          ⛓ Seu gatilho: depois de <strong className="text-[var(--color-txt)]">{settings.anchorText}</strong>
          {settings.anchorTime ? `, às ${settings.anchorTime}` : ""} — 2 minutos.
        </p>
      )}
    </section>
  );
}
