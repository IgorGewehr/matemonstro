"use client";

import Link from "next/link";
import { useApp } from "@/components/AppState";
import CurriculumMap from "@/components/CurriculumMap";
import { tracks, index, getTrack, isReady } from "@/lib/curriculum";
import { trackProgress, trackUnlocked, overallProgress } from "@/lib/scheduler";
import { phaseColor } from "@/components/ui";

export default function MapaPage() {
  const { progress } = useApp(); // renderiza já; cores/summary atualizam após hidratação
  if (!isReady) return <div className="panel p-6 text-[var(--color-mut)]">Carregando o mapa…</div>;

  const overall = overallProgress(progress);
  const done = tracks.filter((t) => trackProgress(t, progress).pct === 100).length;
  const order = index?.recommendedOrder ?? tracks.map((t) => t.id);
  const nextId = order.find((id) => {
    const t = getTrack(id);
    return t && trackUnlocked(t, progress) && trackProgress(t, progress).pct < 100;
  });
  const next = nextId ? getTrack(nextId) : undefined;

  const legend = [
    { c: phaseColor(0), t: "Fundações" },
    { c: phaseColor(1), t: "Núcleo" },
    { c: phaseColor(2), t: "Avançado" },
  ];

  return (
    <div className="space-y-5">
      <header>
        <h1 className="text-2xl md:text-3xl font-extrabold tracking-tight">🧠 Mapa do conhecimento</h1>
        <p className="text-[var(--color-mut)] text-sm mt-1">
          Seu cérebro matemático em árvore: cada trilha ligada aos seus pré-requisitos. Siga as setas — o que
          brilha e pulsa é seu próximo passo. Clique num nó para abrir a trilha.
        </p>
      </header>

      <div className="grid sm:grid-cols-3 gap-3">
        <div className="panel p-4">
          <div className="text-2xl font-bold">{done}/{tracks.length}</div>
          <div className="text-xs text-[var(--color-mut)]">trilhas concluídas</div>
        </div>
        <div className="panel p-4">
          <div className="text-2xl font-bold">{overall.pct}%</div>
          <div className="text-xs text-[var(--color-mut)]">do currículo total</div>
        </div>
        {next ? (
          <Link href={`/trilha/${next.id}`} className="panel p-4 hover:border-[var(--color-brand)] transition-colors">
            <div className="text-xs text-[var(--color-brand)] mb-0.5">▶ próximo passo</div>
            <div className="font-bold leading-tight text-sm">{next.title}</div>
          </Link>
        ) : (
          <div className="panel p-4">
            <div className="text-sm font-bold text-[var(--color-brand2)]">Tudo liberado! 🎉</div>
          </div>
        )}
      </div>

      <div className="flex items-center gap-4 flex-wrap text-xs text-[var(--color-mut)]">
        {legend.map((l) => (
          <span key={l.t} className="flex items-center gap-1.5">
            <span className="w-3 h-3 rounded-full" style={{ background: l.c }} /> {l.t}
          </span>
        ))}
        <span className="flex items-center gap-1.5">✓ concluída</span>
        <span className="flex items-center gap-1.5">🔒 bloqueada (falta pré-requisito)</span>
      </div>

      <CurriculumMap />
    </div>
  );
}
