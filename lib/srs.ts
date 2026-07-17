import type { Card, Flashcard } from "./types";

export const DAY = 86_400_000;

export type Grade = "errei" | "dificil" | "bom" | "facil";

/** Nota do usuario -> rating FSRS (1=Again, 2=Hard, 3=Good, 4=Easy). */
const GRADE_RATING: Record<Grade, 1 | 2 | 3 | 4> = {
  errei: 1,
  dificil: 2,
  bom: 3,
  facil: 4,
};

/** q do SM-2 (mantemos card.ease vivo por retrocompatibilidade/leech). */
const GRADE_Q: Record<Grade, number> = {
  errei: 1,
  dificil: 3,
  bom: 4,
  facil: 5,
};

// ---- Parametros do FSRS-lite -------------------------------------------------

const LEARNING_STEP_MIN = 10; // 1 passo de aprendizado: ~10 min
const RELEARN_STEP_MIN = 10; // relearning: ~10 min
const MIN_D = 1;
const MAX_D = 10;
const DEFAULT_RETENTION = 0.9;
/** Fracao da estabilidade preservada num lapso (relearning NAO reseta como novato). */
const LAPSE_RETAIN = 0.35;
const MIN_RELEARN_S = 0.5;
/** Ganho de estabilidade por revisao bem-sucedida. */
const STAB_GAIN = 0.35;

const MIN10 = LEARNING_STEP_MIN / 1440; // 10 min em dias
const REMIN10 = RELEARN_STEP_MIN / 1440;

export function newCard(
  subId: string,
  trackId: string,
  fc: Flashcard,
  i: number,
  now: number
): Card {
  return {
    id: `${subId}::${i}`,
    subId,
    trackId,
    front: fc.front,
    back: fc.back,
    ease: 2.5,
    interval: 0,
    reps: 0,
    lapses: 0,
    due: now, // cartao novo vence imediatamente (entra na fila de hoje)
    createdAt: now,
    state: "new",
    stability: undefined,
    difficulty: undefined,
    step: 0,
  };
}

export interface ReviewOpts {
  requestRetention?: number;
  /**
   * Fator global de escala de intervalo (spec Quant: calibracao personalizada).
   * 1 = comportamento padrao. <1 encurta intervalos (usuario esquece mais rapido),
   * >1 alonga. Calibrado por lib/fsrs-optimize.ts a partir do historico real e
   * aplicado opt-in via settings.fsrsIntervalScale. NAO altera stability/difficulty.
   */
  intervalScale?: number;
}

// ---- Helpers puros -----------------------------------------------------------

const clampD = (d: number) => Math.min(MAX_D, Math.max(MIN_D, d));

function initialDifficulty(rating: 1 | 2 | 3 | 4): number {
  // Again mais dificil, Easy mais facil.
  return clampD(8 - (rating - 1) * 1.4);
}

/** Deriva dificuldade de um cartao SM-2 legado a partir do ease. */
function difficultyFromEase(ease: number): number {
  // ease 2.5 -> ~4 ; ease 1.3 -> 10
  return clampD(10 - (ease - 1.3) * 5);
}

/** Estado efetivo tolerando cartoes antigos sem os campos novos. */
function effectiveState(
  card: Card
): "new" | "learning" | "review" | "relearning" {
  if (card.state) return card.state;
  if (card.stability == null) {
    if ((card.reps ?? 0) === 0 && (card.interval ?? 0) === 0) return "new";
    return "review"; // SM-2 legado com progresso -> migra como review
  }
  return "review";
}

/** Hash FNV-1a determinístico para o fuzz por card.id. */
function hashStr(s: string): number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** Fator de fuzz determinístico em [0.95, 1.05) — irmãos nao coincidem. */
function fuzzFactor(id: string): number {
  const u = (hashStr(id) % 1000) / 1000;
  return 0.95 + u * 0.1;
}

/**
 * Intervalo (em dias, fracionario) para atingir a retencao desejada dado S.
 * t = S * ln(rr)/ln(0.9). Aplica fuzz ±5% determinístico por card.id.
 */
function scheduleDays(
  stability: number,
  rr: number,
  id: string,
  scale = 1
): number {
  const base = (stability * Math.log(rr)) / Math.log(0.9);
  return Math.max(0.5, base * scale * fuzzFactor(id));
}

/** Retrievability atual R = 0.9^(diasDecorridos/S). */
export function retrievability(card: Card, now: number): number {
  const s = card.stability ?? (card.interval > 0 ? card.interval : null);
  const state = effectiveState(card);
  if (s == null || s <= 0) return state === "new" ? 0 : 1;
  const last = card.lastReview ?? card.due - card.interval * DAY;
  const elapsed = Math.max(0, (now - last) / DAY);
  return Math.pow(0.9, elapsed / s);
}

/** Cartao "leech": erra cronicamente / muito dificil. */
export function isLeech(card: Card): boolean {
  return (
    (card.lapses ?? 0) >= 2 ||
    (card.difficulty != null && card.difficulty >= 7) ||
    card.ease <= 1.5
  );
}

/** Proxima dificuldade apos revisao bem-sucedida (rating 2..4). */
function nextDifficulty(d: number, rating: 1 | 2 | 3 | 4): number {
  // Good mantem, Hard sobe, Easy desce.
  const delta = (3 - rating) * 0.6;
  return clampD(d + delta);
}

/** Ganho de estabilidade numa revisao bem-sucedida. */
function nextStability(
  s: number,
  d: number,
  r: number,
  rating: 1 | 2 | 3 | 4
): number {
  const hardPenalty = rating === 2 ? 0.6 : 1;
  const easyBonus = rating === 4 ? 1.4 : 1;
  const inc =
    1 +
    STAB_GAIN *
      (11 - d) *
      Math.pow(s, -0.25) *
      (Math.exp((1 - r) * 2) - 1 + 0.4) *
      hardPenalty *
      easyBonus;
  return s * Math.max(inc, 1.02);
}

/** Ajuste de ease (SM-2) mantido vivo para leech/preview. */
function nextEase(ease: number, grade: Grade): number {
  const q = GRADE_Q[grade];
  const e = ease + (0.1 - (5 - q) * (0.08 + (5 - q) * 0.02));
  return e < 1.3 ? 1.3 : e;
}

// ---- Revisao -----------------------------------------------------------------

/**
 * Atualiza um cartao apos a revisao usando um modelo FSRS-lite:
 * learning/relearning steps, estabilidade/dificuldade, fuzz e meta de retencao.
 * Retrocompatível: cartoes SM-2 legados migram na 1a revisao; a 4a posicao
 * (opts) e opcional, entao chamadas antigas review(card, grade, now) seguem valendo.
 */
export function review(
  card: Card,
  grade: Grade,
  now: number,
  opts?: ReviewOpts
): Card {
  const rr = opts?.requestRetention ?? DEFAULT_RETENTION;
  const scale = opts?.intervalScale ?? 1;
  const rating = GRADE_RATING[grade];
  const state = effectiveState(card);
  const ease = nextEase(card.ease, grade);

  // Migracao de cartao SM-2 legado que ja esta "maduro".
  let stability = card.stability;
  let difficulty = card.difficulty;
  if (stability == null && (state === "review" || state === "relearning")) {
    stability = Math.max(card.interval, 0.5);
    difficulty = difficultyFromEase(card.ease);
  }

  // ---- Learning / New ----
  if (state === "new" || state === "learning") {
    const d = difficulty ?? initialDifficulty(rating);

    if (rating === 1) {
      // Again: recomeca o passo de aprendizado (~10 min).
      return {
        ...card,
        ease,
        state: "learning",
        step: 0,
        difficulty: clampD(d + 0.5),
        interval: MIN10,
        lastReview: now,
        due: now + MIN10 * DAY,
      };
    }

    const step = card.step ?? 0;
    const graduatesNow = rating === 4 || step >= 1; // 1 unico passo de 10 min

    if (!graduatesNow) {
      // Bom no 1o toque: reaparece em ~10 min antes de graduar.
      return {
        ...card,
        ease,
        state: "learning",
        step: step + 1,
        difficulty: d,
        interval: MIN10,
        lastReview: now,
        due: now + MIN10 * DAY,
      };
    }

    // Gradua para review.
    const s = rating === 4 ? 4 : 1;
    const days = scheduleDays(s, rr, card.id, scale);
    return {
      ...card,
      ease,
      state: "review",
      step: undefined,
      stability: s,
      difficulty: d,
      reps: (card.reps ?? 0) + 1,
      interval: Math.max(1, Math.round(days)),
      lastReview: now,
      due: now + days * DAY,
    };
  }

  // ---- Relearning ----
  if (state === "relearning") {
    const s = stability ?? Math.max(card.interval, MIN_RELEARN_S);
    const d = difficulty ?? initialDifficulty(rating);

    if (rating === 1) {
      // Again de novo: continua em relearning, reduz um pouco mais a estabilidade.
      const rs = Math.max(s * LAPSE_RETAIN, MIN_RELEARN_S);
      return {
        ...card,
        ease,
        state: "relearning",
        step: 0,
        stability: rs,
        difficulty: clampD(d + 0.5),
        interval: REMIN10,
        lastReview: now,
        due: now + REMIN10 * DAY,
      };
    }

    // Acertou: volta a review com a estabilidade (ja reduzida), NAO reseta.
    const days = scheduleDays(s, rr, card.id, scale);
    return {
      ...card,
      ease,
      state: "review",
      step: undefined,
      stability: s,
      difficulty: d,
      reps: (card.reps ?? 0) + 1,
      interval: Math.max(1, Math.round(days)),
      lastReview: now,
      due: now + days * DAY,
    };
  }

  // ---- Review ----
  const s = stability ?? Math.max(card.interval, 0.5);
  const d = difficulty ?? difficultyFromEase(card.ease);

  if (rating === 1) {
    // Lapso: entra em relearning com estabilidade reduzida (nao volta a 1 dia).
    const rs = Math.max(s * LAPSE_RETAIN, MIN_RELEARN_S);
    return {
      ...card,
      ease,
      state: "relearning",
      step: 0,
      stability: rs,
      difficulty: clampD(d + 1),
      reps: card.reps ?? 0,
      lapses: (card.lapses ?? 0) + 1,
      interval: REMIN10,
      lastReview: now,
      due: now + REMIN10 * DAY,
    };
  }

  // Recall bem-sucedido: atualiza D e S, agenda pelo alvo de retencao.
  const r = retrievability(card, now);
  const nd = nextDifficulty(d, rating);
  const ns = nextStability(s, nd, r, rating);
  const days = scheduleDays(ns, rr, card.id, scale);
  return {
    ...card,
    ease,
    state: "review",
    step: undefined,
    stability: ns,
    difficulty: nd,
    reps: (card.reps ?? 0) + 1,
    interval: Math.max(1, Math.round(days)),
    lastReview: now,
    due: now + days * DAY,
  };
}

export function dueCards(cards: Card[], now: number): Card[] {
  return cards.filter((c) => c.due <= now).sort((a, b) => a.due - b.due);
}

export function dueSoon(cards: Card[], now: number, withinDays: number): Card[] {
  const limit = now + withinDays * DAY;
  return cards.filter((c) => c.due > now && c.due <= limit);
}

export function describeInterval(card: Card): string {
  if (card.interval < 1) return "~10 min";
  if (card.interval === 1) return "1 dia";
  if (card.interval < 30) return `${Math.round(card.interval)} dias`;
  if (card.interval < 365) return `${Math.round(card.interval / 30)} meses`;
  return `${(card.interval / 365).toFixed(1)} anos`;
}
