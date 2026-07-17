// Meta do dia — a "meta mínima" que é IMPOSSÍVEL de falhar (estilo Duolingo daily
// goal em camadas + piso "Básico: só aparecer"), a redução automática na reentrada
// (welcome-back), o alvo pequeno de revisão (anti-backlog do Anki) e os selos
// cosméticos de longo prazo (Streak Society, mas 100% local e identitário — o tipo
// de recompensa que a literatura NÃO associa a corrosão de motivação intrínseca).
//
// Tudo PURO e derivado de settings + estado já calculado. Nenhum schema novo além
// de campos opcionais em Settings.

import type { Settings } from "./types";

export type GoalTier = "basico" | "casual" | "regular" | "serio" | "intenso";

export interface TierDef {
  id: GoalTier;
  label: string;
  floorMin: number; // minutos que "salvam o dia" — baixo de propósito
  blurb: string;
}

// Mapeamento inspirado nas camadas do Duolingo (Casual~5 / Regular~10 / Sério~15 /
// Intenso~20), com um piso "Básico" de 2 min = literalmente só aparecer.
export const TIERS: TierDef[] = [
  { id: "basico", label: "Básico", floorMin: 2, blurb: "Só aparecer" },
  { id: "casual", label: "Casual", floorMin: 5, blurb: "~5 min" },
  { id: "regular", label: "Regular", floorMin: 10, blurb: "~10 min" },
  { id: "serio", label: "Sério", floorMin: 15, blurb: "~15 min" },
  { id: "intenso", label: "Intenso", floorMin: 20, blurb: "~20 min" },
];

export function tierOf(settings: Settings | undefined): TierDef {
  const id = settings?.dailyGoalTier ?? "casual";
  return TIERS.find((t) => t.id === id) ?? TIERS[1];
}

export interface EffectiveGoal {
  floorMin: number; // meta efetiva de hoje (já com reentrada aplicada)
  label: string; // "Casual", "Modo reentrada"…
  reduced: boolean; // true quando reduzimos por reentrada/chama fria
}

/**
 * Meta efetiva do dia. Se você está voltando de uma pausa (comeback) ou a chama
 * está fria (momentum baixo), a meta cai para o piso mínimo (2 min) SEM culpa —
 * o primeiro retorno não pode pesar. Dado do Duolingo: reativados retêm ~20%
 * menos sem esse cuidado.
 */
export function effectiveDailyGoal(
  settings: Settings | undefined,
  momentumScore: number,
  comeback: boolean
): EffectiveGoal {
  const base = tierOf(settings);
  if (comeback || momentumScore < 20) {
    return {
      floorMin: Math.min(base.floorMin, 2),
      label: "Modo reentrada",
      reduced: base.floorMin > 2,
    };
  }
  return { floorMin: base.floorMin, label: base.label, reduced: false };
}

/** Alvo pequeno e fixo de revisões do dia — some com o "47 atrasados" assustador. */
export function reviewGoal(settings: Settings | undefined): number {
  return Math.max(1, Math.floor(settings?.reviewGoalPerDay ?? 10));
}

// ---- Selos cosméticos (Streak Society local, identitário) ----
export interface Seal {
  id: string;
  label: string;
  glyph: string;
  days: number; // limiar de melhor sequência
}

export const SEALS: Seal[] = [
  { id: "seal-7", label: "Constante", glyph: "🥉", days: 7 },
  { id: "seal-30", label: "Disciplinado", glyph: "🥈", days: 30 },
  { id: "seal-100", label: "Inabalável", glyph: "🥇", days: 100 },
  { id: "seal-365", label: "Lendário", glyph: "👑", days: 365 },
];

/** Selo atual pela melhor sequência já alcançada (null antes do primeiro marco). */
export function currentSeal(bestStreakDays: number): Seal | null {
  let out: Seal | null = null;
  for (const s of SEALS) if (bestStreakDays >= s.days) out = s;
  return out;
}

/** Próximo selo e quanto falta (para dar um alvo visível). */
export function nextSeal(bestStreakDays: number): { seal: Seal; remaining: number } | null {
  for (const s of SEALS) if (bestStreakDays < s.days) return { seal: s, remaining: s.days - bestStreakDays };
  return null;
}
