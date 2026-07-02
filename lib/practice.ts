import type { ExerciseAttempt } from "@/lib/types";

export const DAY = 86_400_000;

export type PracticeGrade = "acertei" | "quase" | "errei";

/**
 * Item de prática normalizado a partir de um Exercise do currículo (ou de
 * Track.examBank). O `exKey` é a chave estável que amarra o item às tentativas
 * gravadas em ExerciseAttempt.exKey.
 */
export interface PracticeItem {
  exKey: string;
  subId: string;
  trackId: string;
  trackTitle: string;
  subTitle: string;
  prompt: string;
  hint?: string;
  solution?: string;
  steps?: string[];
  difficulty: number; // 1-5
  source?: { exam: string; year?: number; institution?: string };
  tags?: string[];
  /** exames a que a trilha do item pertence (derivado de ifConcursoCore/prelimMap) */
  exams: ("if" | "mestrado")[];
}

export interface PracticeFilters {
  trackId?: string; // "" ou undefined = todas
  difficulty?: number; // 0/undefined = todas
  exam?: "if" | "mestrado" | "all";
  source?: string; // valor de source.exam; "" = todas
}

export interface PracticeStats {
  totalAttempts: number;
  distinctPracticed: number;
  correct: number; // total de tentativas "acertei"
  wrong: number; // total de tentativas "errei"
  accuracy: number; // 0-1 sobre todas as tentativas graduadas
  streak: number; // acertos consecutivos a partir da tentativa mais recente
}

/** Chave estável de um exercício de subtópico dentro do índice do subtópico. */
export function exerciseKey(subId: string, index: number): string {
  return `${subId}::ex::${index}`;
}

/** Última tentativa (maior ts) por exKey. */
export function latestByExKey(attempts: ExerciseAttempt[]): Map<string, ExerciseAttempt> {
  const m = new Map<string, ExerciseAttempt>();
  for (const a of attempts) {
    const cur = m.get(a.exKey);
    if (!cur || a.ts > cur.ts) m.set(a.exKey, a);
  }
  return m;
}

export function matchesFilters(item: PracticeItem, f: PracticeFilters): boolean {
  if (f.trackId && item.trackId !== f.trackId) return false;
  if (f.difficulty && item.difficulty !== f.difficulty) return false;
  if (f.exam && f.exam !== "all" && !item.exams.includes(f.exam)) return false;
  if (f.source) {
    if (!item.source || item.source.exam !== f.source) return false;
  }
  return true;
}

function stateRank(item: PracticeItem, latest: Map<string, ExerciseAttempt>): number {
  const a = latest.get(item.exKey);
  if (!a) return 2; // nunca praticado
  if (a.grade === "errei") return 0; // errados primeiro (do pior para o melhor)
  if (a.grade === "quase") return 1;
  return 3; // acertei — vem por último
}

/**
 * Monta a fila de prática: exercícios que casam com os filtros e que estão
 * "vencidos" (nunca praticados ou com due <= now). Ordena do pior para o melhor
 * (errei → quase → novos → acertei), depois por vencimento e dificuldade.
 * Função pura.
 */
export function buildPracticeQueue(
  items: PracticeItem[],
  attempts: ExerciseAttempt[],
  filters: PracticeFilters,
  now: number
): PracticeItem[] {
  const latest = latestByExKey(attempts);
  const pool = items.filter((it) => {
    if (!matchesFilters(it, filters)) return false;
    const a = latest.get(it.exKey);
    return !a || a.due <= now;
  });
  return pool.sort((x, y) => {
    const r = stateRank(x, latest) - stateRank(y, latest);
    if (r !== 0) return r;
    const dx = latest.get(x.exKey)?.due ?? 0;
    const dy = latest.get(y.exKey)?.due ?? 0;
    if (dx !== dy) return dx - dy;
    return x.difficulty - y.difficulty;
  });
}

/**
 * SRS leve para prática. Gera o próximo ExerciseAttempt com `due` calculado a
 * partir da nota e do intervalo anterior (se houver). Função pura — o `id` é
 * determinístico (exKey + ts). Grade→intervalo:
 *   errei → ~10 min (reaparece na mesma deck)
 *   quase → 1 dia
 *   acertei → dobra o intervalo anterior (mín. 2 dias, teto 180)
 */
export function gradePractice(
  item: PracticeItem,
  grade: PracticeGrade,
  latest: ExerciseAttempt | undefined,
  now: number
): ExerciseAttempt {
  const prevInterval = latest ? Math.max(0, (latest.due - latest.ts) / DAY) : 0;
  let interval: number;
  if (grade === "errei") interval = 10 / 1440;
  else if (grade === "quase") interval = 1;
  else interval = prevInterval >= 1 ? Math.min(180, Math.round(prevInterval * 2.5)) : 2;
  return {
    id: `${item.exKey}::${now}`,
    exKey: item.exKey,
    subId: item.subId,
    trackId: item.trackId,
    grade,
    ts: now,
    due: now + interval * DAY,
  };
}

/** Estatísticas de acerto e sequência a partir do histórico de tentativas. Pura. */
export function practiceStats(attempts: ExerciseAttempt[]): PracticeStats {
  const total = attempts.length;
  const correct = attempts.filter((a) => a.grade === "acertei").length;
  const wrong = attempts.filter((a) => a.grade === "errei").length;
  const sorted = [...attempts].sort((a, b) => b.ts - a.ts);
  let streak = 0;
  for (const a of sorted) {
    if (a.grade === "acertei") streak++;
    else break;
  }
  return {
    totalAttempts: total,
    distinctPracticed: new Set(attempts.map((a) => a.exKey)).size,
    correct,
    wrong,
    accuracy: total ? correct / total : 0,
    streak,
  };
}

/** Quantos itens estão vencidos/pendentes agora dado o conjunto de itens. Puro. */
export function duePracticeCount(
  items: PracticeItem[],
  attempts: ExerciseAttempt[],
  now: number
): number {
  const latest = latestByExKey(attempts);
  return items.reduce((n, it) => {
    const a = latest.get(it.exKey);
    return n + (!a || a.due <= now ? 1 : 0);
  }, 0);
}
