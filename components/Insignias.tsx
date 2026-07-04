"use client";

// Insígnias pixel art "Matemático Nível 1-5" (specs em lib/insignias.ts; arte
// em lib/insignias-art.ts). Renderizadas inline (SVG próprio, estático e
// confiável — gerado pelo nosso pipeline, sem input de usuário).

import React from "react";
import type { TierState } from "@/lib/insignias";
import { INSIGNIA_SVG } from "@/lib/insignias-art";

/** A arte de uma insígnia, quadrada, escala pelo container. */
export function InsigniaArt({ level, size = 96 }: { level: number; size?: number }) {
  const svg = INSIGNIA_SVG[level];
  if (!svg) return null;
  return (
    <span
      aria-hidden
      className="inline-block leading-none [&>svg]:w-full [&>svg]:h-full"
      style={{ width: size, height: size, imageRendering: "pixelated" }}
      dangerouslySetInnerHTML={{ __html: svg }}
    />
  );
}

/** Card de uma insígnia na página de conquistas. */
export function InsigniaCard({ tier }: { tier: TierState }) {
  const pct = tier.subsTotal > 0 ? Math.round((tier.subsDone / tier.subsTotal) * 100) : 0;
  return (
    <div
      className={`panel p-4 flex flex-col items-center text-center gap-2 transition-all mm-lift ${
        tier.unlocked ? "border-[var(--color-gold)] mm-shine" : ""
      }`}
      title={tier.unlocked ? "Insígnia conquistada" : tier.era}
    >
      <div
        className={tier.unlocked ? "" : "opacity-45"}
        style={tier.unlocked ? undefined : { filter: "grayscale(0.85)" }}
      >
        <InsigniaArt level={tier.level} size={88} />
      </div>
      <div className="text-[10px] uppercase tracking-widest text-[var(--color-mut)]">
        Matemático Nível {tier.level}
      </div>
      <div className="font-bold text-sm leading-tight">{tier.name}</div>
      <div className="text-xs text-[var(--color-mut)] leading-snug">{tier.subtitle}</div>
      <div className="w-full mt-auto pt-2">
        {tier.unlocked ? (
          <div className="chip !px-2 !py-0.5 !text-[var(--color-gold)] w-full justify-center">
            ✦ Conquistada
          </div>
        ) : (
          <>
            <div className="h-1.5 rounded-full bg-[var(--color-well)] overflow-hidden">
              <div
                className="h-full rounded-full bg-[var(--color-brand)] transition-all"
                style={{ width: `${pct}%` }}
              />
            </div>
            <div className="text-[10px] text-[var(--color-mut)] mt-1">
              {tier.done}/{tier.total} trilhas · {pct}% dos subtópicos
            </div>
          </>
        )}
      </div>
    </div>
  );
}
