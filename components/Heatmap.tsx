"use client";

import React from "react";
import type { HeatmapData } from "@/lib/analytics";

const CELL = 12;
const GAP = 3;
const STEP = CELL + GAP;
const TOP = 16; // espaco para rotulos de mes
const LEFT = 22; // espaco para rotulos de dia da semana

// escala de intensidade (vazio → cheio) no verde da marca
const COLORS = ["#161a26", "#0e3b33", "#12695a", "#0fa587", "#00d3a7"];
const DOW = ["", "Seg", "", "Qua", "", "Sex", ""]; // rotula linhas 1,3,5
const MONTHS = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];

function level(minutes: number, max: number): number {
  if (minutes <= 0) return 0;
  const r = minutes / (max || 1);
  if (r < 0.25) return 1;
  if (r < 0.5) return 2;
  if (r < 0.75) return 3;
  return 4;
}

export default function Heatmap({ data }: { data: HeatmapData }) {
  const width = LEFT + data.weeks * STEP;
  const height = TOP + 7 * STEP;

  // rotulos de mes: primeira coluna em que o mes muda
  const monthLabels: { col: number; label: string }[] = [];
  let lastMonth = -1;
  for (const cell of data.cells) {
    if (cell.row !== 0) continue;
    const m = new Date(cell.ts).getUTCMonth();
    if (m !== lastMonth) {
      monthLabels.push({ col: cell.col, label: MONTHS[m] });
      lastMonth = m;
    }
  }

  return (
    <div className="overflow-x-auto">
      <svg
        width={width}
        height={height}
        role="img"
        aria-label={`Atividade de estudo das ultimas ${data.weeks} semanas`}
        style={{ display: "block" }}
      >
        {monthLabels.map((ml, i) => (
          <text
            key={i}
            x={LEFT + ml.col * STEP}
            y={11}
            fontSize={10}
            fill="var(--color-mut)"
          >
            {ml.label}
          </text>
        ))}
        {DOW.map((d, row) =>
          d ? (
            <text
              key={row}
              x={0}
              y={TOP + row * STEP + CELL - 2}
              fontSize={9}
              fill="var(--color-mut)"
            >
              {d}
            </text>
          ) : null
        )}
        {data.cells.map((cell) => {
          if (cell.inFuture) return null;
          const lv = level(cell.minutes, data.maxMinutes);
          const title =
            cell.minutes > 0 || cell.reviews > 0
              ? `${cell.day}: ${cell.minutes} min • ${cell.reviews} revisoes`
              : `${cell.day}: sem estudo`;
          return (
            <rect
              key={cell.day}
              x={LEFT + cell.col * STEP}
              y={TOP + cell.row * STEP}
              width={CELL}
              height={CELL}
              rx={2.5}
              fill={COLORS[lv]}
              stroke={lv === 0 ? "#20263a" : "transparent"}
              strokeWidth={1}
            >
              <title>{title}</title>
            </rect>
          );
        })}
      </svg>
      <div className="flex items-center gap-1.5 mt-2 text-[11px] text-[var(--color-mut)]">
        <span>menos</span>
        {COLORS.map((c, i) => (
          <span
            key={i}
            className="inline-block rounded-[2px]"
            style={{ width: 11, height: 11, background: c, border: i === 0 ? "1px solid #20263a" : "none" }}
          />
        ))}
        <span>mais</span>
      </div>
    </div>
  );
}
