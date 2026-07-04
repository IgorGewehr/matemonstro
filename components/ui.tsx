"use client";

import React from "react";
import { levelFor } from "@/lib/gamification";

export function ProgressBar({ pct, className }: { pct: number; className?: string }) {
  return (
    <div className={`h-2 w-full rounded-full bg-[var(--color-raise)] overflow-hidden ${className ?? ""}`}>
      <div
        className="h-full rounded-full transition-[width] duration-500 ease-out"
        style={{
          width: `${Math.max(0, Math.min(100, pct))}%`,
          background: "var(--grad-brand)",
        }}
      />
    </div>
  );
}

export function Ring({ pct, size = 56, label }: { pct: number; size?: number; label?: string }) {
  const r = (size - 8) / 2;
  const c = 2 * Math.PI * r;
  const off = c - (Math.max(0, Math.min(100, pct)) / 100) * c;
  return (
    <div className="relative inline-grid place-items-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" strokeWidth={6} className="ring-track" />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          strokeWidth={6}
          strokeLinecap="round"
          stroke="url(#g1)"
          strokeDasharray={c}
          strokeDashoffset={off}
          style={{ transition: "stroke-dashoffset .5s ease" }}
        />
        <defs>
          <linearGradient id="g1" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="var(--color-brand)" />
            <stop offset="100%" stopColor="#00d3a7" />
          </linearGradient>
        </defs>
      </svg>
      <span className="absolute text-[13px] font-bold">{label ?? `${pct}%`}</span>
    </div>
  );
}

const DIFF = ["", "Iniciante", "Tranquilo", "Medio", "Pesado", "Brutal"];
export function Difficulty({ level }: { level: number }) {
  return (
    <span className="chip" title={`Dificuldade ${level}/5`}>
      {"●".repeat(level)}
      <span className="text-[var(--color-mut)]">{"●".repeat(Math.max(0, 5 - level))}</span>
      <span className="ml-1">{DIFF[level] ?? ""}</span>
    </span>
  );
}

export function Stars({ n }: { n: number }) {
  return (
    <span className="text-[var(--color-gold)]" title={`${n}/5`}>
      {"★".repeat(n)}
      <span className="text-[var(--color-line2)]">{"★".repeat(Math.max(0, 5 - n))}</span>
    </span>
  );
}

export function Stat({ value, label, accent }: { value: React.ReactNode; label: string; accent?: string }) {
  return (
    <div className="panel p-4">
      <div className="text-2xl font-bold" style={{ color: accent }}>
        {value}
      </div>
      <div className="text-xs text-[var(--color-mut)] mt-1">{label}</div>
    </div>
  );
}

// Barra de nivel gamificado — derivada do XP (levelFor). Reaproveita o estilo do
// ProgressBar para mostrar o nivel atual e o progresso rumo ao proximo.
export function LevelBar({ xp, className }: { xp: number; className?: string }) {
  const lv = levelFor(xp);
  return (
    <div className={`panel p-3 w-full sm:min-w-[200px] ${className ?? ""}`}>
      <div className="flex items-center justify-between gap-2 mb-1.5">
        <span className="text-[13px] font-bold truncate" title={lv.name}>
          {lv.name}
        </span>
        <span
          className="chip !px-2 !py-0.5 shrink-0"
          style={{ background: "#181b27", color: "var(--color-gold)" }}
        >
          Nv {lv.level}
        </span>
      </div>
      <ProgressBar pct={lv.pct} />
      <div className="text-[11px] text-[var(--color-mut)] mt-1.5">
        {lv.next ? (
          <>
            {lv.xpInto}/{lv.span} XP <span className="opacity-60">→ {lv.next}</span>
          </>
        ) : (
          <>
            {lv.xp} XP • nível máximo <span className="text-[var(--color-gold)]">✦</span>
          </>
        )}
      </div>
    </div>
  );
}

export function phaseColor(phase: number): string {
  return phase === 0 ? "var(--color-brand2)" : phase === 1 ? "var(--color-brand)" : "#f6c453";
}
