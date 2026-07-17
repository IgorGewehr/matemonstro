// Momentum — a métrica que VALORIZA APARECER, não completar.
//
// Problema que resolve: a gamificação por "subtópico concluído" (unidade grande)
// não se move para quem está desmotivado, confirmando "não adianta". Momentum
// inverte isso: cada DIA em que você tocou no app conta por inteiro (binário,
// não por volume) — 5 minutos valem tanto quanto uma hora para manter a chama.
// Assim a barra sobe já na primeira sessão curta, e sessões curtas viram hábito.
//
// Funções PURAS (sem DOM/IndexedDB), derivadas só do store `log` + settings —
// nenhum campo novo de schema, retrocompatível com qualquer backup.

import type { StudyLogEntry, Settings } from "./types";

const DAY = 86_400_000;

function dayKey(ts: number): string {
  return new Date(ts).toISOString().slice(0, 10);
}

export type MomentumTier = "frio" | "morno" | "quente" | "em-chamas";

export interface MomentumInfo {
  /** 0-100. Aparecer hoje já dá um salto visível; consistência satura em 100. */
  score: number;
  tier: MomentumTier;
  studiedToday: boolean;
  todayMinutes: number;
  // --- Acumulação ("gota a gota vira oceano") ---
  totalMinutes: number; // minutos somados na vida toda
  totalDays: number; // dias distintos com estudo
  weekMinutes: number; // minutos nos últimos 7 dias
  weekDays: number; // dias ativos nos últimos 7
  // --- Narrativa anti-culpa ---
  /** Voltou após uma pausa (>=2 dias) — momento de celebrar o retorno, não punir. */
  comeback: boolean;
  /** Dias desde o último estudo ANTES de hoje (null se nunca estudou antes). */
  daysSinceLast: number | null;
}

// Meia-vida do momentum: sem estudar, cai ~pela metade a cada 3 dias. Suave o
// bastante para uma folga não zerar tudo; firme para premiar a regularidade.
const HALF_LIFE_DAYS = 3;
const WINDOW = 21; // dias considerados no score

export function computeMomentum(
  log: Map<string, StudyLogEntry>,
  _settings?: Settings,
  now: number = Date.now()
): MomentumInfo {
  const decay = Math.pow(0.5, 1 / HALF_LIFE_DAYS);

  // Score: soma ponderada por recência dos dias estudados na janela, normalizada
  // para que "estudar todos os dias" => 100. Contribuição BINÁRIA (estudou ou não),
  // então uma sessão de 5 min conta igual a uma longa.
  let raw = 0;
  let norm = 0;
  for (let d = 0; d < WINDOW; d++) {
    const w = Math.pow(decay, d);
    norm += w;
    if (log.has(dayKey(now - d * DAY))) raw += w;
  }
  const score = Math.max(0, Math.min(100, Math.round((raw / norm) * 100)));

  const tier: MomentumTier =
    score >= 75 ? "em-chamas" : score >= 45 ? "quente" : score >= 20 ? "morno" : "frio";

  const todayEntry = log.get(dayKey(now));
  const studiedToday = !!todayEntry;
  const todayMinutes = todayEntry?.minutes ?? 0;

  // Acumulação total.
  let totalMinutes = 0;
  for (const e of log.values()) totalMinutes += e.minutes || 0;
  const totalDays = log.size;

  // Últimos 7 dias.
  let weekMinutes = 0;
  let weekDays = 0;
  for (let d = 0; d < 7; d++) {
    const e = log.get(dayKey(now - d * DAY));
    if (e) {
      weekMinutes += e.minutes || 0;
      weekDays++;
    }
  }

  // Dias desde o último estudo antes de hoje (para detectar retorno).
  let daysSinceLast: number | null = null;
  for (let d = 1; d <= 366; d++) {
    if (log.has(dayKey(now - d * DAY))) {
      daysSinceLast = d;
      break;
    }
  }
  const comeback = studiedToday && daysSinceLast !== null && daysSinceLast >= 2;

  return {
    score,
    tier,
    studiedToday,
    todayMinutes,
    totalMinutes,
    totalDays,
    weekMinutes,
    weekDays,
    comeback,
    daysSinceLast,
  };
}

/** Rótulo humano do tier, com emoji. */
export function tierLabel(tier: MomentumTier): { label: string; glyph: string } {
  switch (tier) {
    case "em-chamas":
      return { label: "Em chamas", glyph: "🔥" };
    case "quente":
      return { label: "Quente", glyph: "✨" };
    case "morno":
      return { label: "Aquecendo", glyph: "🌱" };
    default:
      return { label: "Frio", glyph: "❄️" };
  }
}

/**
 * Frase curta e honesta para o estado atual — o que dizer AGORA para reduzir a
 * energia de ativação. Sem culpa; foco em "só começar".
 */
export function momentumNudge(m: MomentumInfo): string {
  if (m.comeback) return "Você voltou. Isso é o que importa — 2 minutos e a chama reacende.";
  if (!m.studiedToday && m.score === 0) return "Comece com 2 minutos. Só isso. O resto vem depois.";
  if (!m.studiedToday && m.tier === "em-chamas") return "Não deixe esfriar: 2 minutos mantêm você em chamas.";
  if (!m.studiedToday) return "Um toque agora e o dia de hoje já conta. 2 minutos bastam.";
  if (m.studiedToday && m.tier === "em-chamas") return "Hoje já contou e você está voando. Cada pedacinho soma.";
  return "Hoje já contou. Gota a gota vira oceano.";
}
