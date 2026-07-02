"use client";

import { useRouter } from "next/navigation";
import { useApp } from "./AppState";
import { tracks, index } from "@/lib/curriculum";
import { trackProgress, trackUnlocked } from "@/lib/scheduler";
import { phaseColor } from "./ui";
import type { Track } from "@/lib/types";

const NW = 172; // largura do nó
const NH = 58; // altura do nó
const GX = 74; // gap horizontal entre camadas
const GY = 20; // gap vertical
const PAD = 28;

const byId = new Map(tracks.map((t) => [t.id, t]));

// profundidade = maior cadeia de pré-requisitos (layout em camadas, esq→dir)
const depthMemo = new Map<string, number>();
function depth(id: string, seen: Set<string> = new Set()): number {
  if (depthMemo.has(id)) return depthMemo.get(id)!;
  const t = byId.get(id);
  if (!t || seen.has(id)) return 0;
  seen.add(id);
  const preds = t.prereqs.filter((p) => byId.has(p));
  const d = preds.length ? 1 + Math.max(...preds.map((p) => depth(p, new Set(seen)))) : 0;
  depthMemo.set(id, d);
  return d;
}

const layers: Track[][] = [];
for (const t of tracks) {
  const d = depth(t.id);
  (layers[d] ||= []).push(t);
}
for (let i = 0; i < layers.length; i++) if (!layers[i]) layers[i] = []; // densifica buracos
layers.forEach((layer) => layer.sort((a, b) => a.phase - b.phase || a.title.localeCompare(b.title)));

const pos = new Map<string, { x: number; y: number }>();
layers.forEach((layer, l) =>
  layer.forEach((t, i) => pos.set(t.id, { x: PAD + l * (NW + GX), y: PAD + i * (NH + GY) }))
);
const W = PAD * 2 + layers.length * (NW + GX) - GX;
const H = PAD * 2 + Math.max(1, ...layers.map((l) => l.length)) * (NH + GY) - GY;

function truncate(s: string, n: number) {
  return s.length > n ? s.slice(0, n - 1) + "…" : s;
}

export default function CurriculumMap() {
  const router = useRouter();
  const { progress } = useApp(); // progress vazio antes da hidratação; o grafo pinta e depois atualiza cores

  const state = (t: Track) => {
    const tp = trackProgress(t, progress);
    const unlocked = trackUnlocked(t, progress);
    if (tp.pct === 100) return { kind: "done" as const, pct: 100 };
    if (unlocked) return { kind: tp.pct > 0 ? ("started" as const) : ("frontier" as const), pct: tp.pct };
    return { kind: "locked" as const, pct: tp.pct };
  };

  // próximo passo = primeira trilha liberada e não concluída na ordem recomendada
  const order = index?.recommendedOrder ?? tracks.map((t) => t.id);
  const nextId = order.find((id) => {
    const t = byId.get(id);
    return t && trackUnlocked(t, progress) && trackProgress(t, progress).pct < 100;
  });

  return (
    <div className="overflow-auto panel p-2" style={{ maxHeight: "72vh" }}>
      <svg width={W} height={H} style={{ display: "block", minWidth: W }}>
        <defs>
          <filter id="glow" x="-40%" y="-40%" width="180%" height="180%">
            <feGaussianBlur stdDeviation="3.5" result="b" />
            <feMerge>
              <feMergeNode in="b" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        {/* arestas (pré-requisitos) */}
        {tracks.map((t) =>
          t.prereqs
            .filter((p) => pos.has(p) && pos.has(t.id))
            .map((p) => {
              const a = pos.get(p)!;
              const b = pos.get(t.id)!;
              const sx = a.x + NW;
              const sy = a.y + NH / 2;
              const tx = b.x;
              const ty = b.y + NH / 2;
              const st = state(t);
              const stroke =
                st.kind === "done" ? "#00d3a7" : st.kind === "locked" ? "#2a2f42" : phaseColor(t.phase);
              return (
                <path
                  key={`${p}-${t.id}`}
                  d={`M ${sx} ${sy} C ${sx + GX / 2} ${sy}, ${tx - GX / 2} ${ty}, ${tx} ${ty}`}
                  fill="none"
                  stroke={stroke}
                  strokeWidth={1.5}
                  strokeOpacity={st.kind === "locked" ? 0.35 : 0.6}
                />
              );
            })
        )}

        {/* nós */}
        {tracks.map((t) => {
          const p = pos.get(t.id);
          if (!p) return null;
          const st = state(t);
          const pc = phaseColor(t.phase);
          const tp = trackProgress(t, progress);
          const isNext = t.id === nextId;
          const fill =
            st.kind === "done" ? `${pc}33` : st.kind === "locked" ? "var(--color-panel)" : `${pc}1f`;
          const stroke =
            st.kind === "done" ? "#00d3a7" : st.kind === "locked" ? "#2a2f42" : isNext ? pc : `${pc}99`;
          return (
            <g
              key={t.id}
              transform={`translate(${p.x},${p.y})`}
              style={{ cursor: "pointer", opacity: st.kind === "locked" ? 0.55 : 1 }}
              onClick={() => router.push(`/trilha/${t.id}`)}
            >
              <title>{`${t.title} — ${tp.done}/${tp.total} aulas${st.kind === "locked" ? " (bloqueada: faça os pré-requisitos)" : isNext ? " • PRÓXIMO PASSO" : ""}`}</title>
              <rect
                width={NW}
                height={NH}
                rx={12}
                fill={fill}
                stroke={stroke}
                strokeWidth={isNext || st.kind === "done" ? 2 : 1.2}
                filter={isNext || st.kind === "done" ? "url(#glow)" : undefined}
              >
                {isNext && (
                  <animate attributeName="stroke-opacity" values="1;0.35;1" dur="1.8s" repeatCount="indefinite" />
                )}
              </rect>
              <circle cx={14} cy={16} r={4} fill={pc} />
              <text x={26} y={20} fontSize={11} fill="var(--color-txt)" fontWeight={700}>
                {truncate(t.title, 21)}
              </text>
              <text x={12} y={38} fontSize={10} fill="var(--color-mut)">
                {st.kind === "done" ? "✓ concluída" : st.kind === "locked" ? "🔒 bloqueada" : isNext ? "▶ próximo passo" : `${tp.done}/${tp.total} aulas`}
              </text>
              {/* barra de progresso */}
              <rect x={12} y={46} width={NW - 24} height={4} rx={2} fill="var(--color-raise)" />
              <rect x={12} y={46} width={(NW - 24) * (tp.pct / 100)} height={4} rx={2} fill={st.kind === "done" ? "#00d3a7" : pc} />
            </g>
          );
        })}
      </svg>
    </div>
  );
}
