import type { Track, Progress, Card, Settings } from "./types";
import { tracks, flatSubtopics, getTrack, index, type SubRef } from "./curriculum";
import { dueCards, DAY } from "./srs";

export interface PlanItem {
  ref: SubRef;
  reason: "continuar" | "proximo";
  minutes: number;
}

export interface TodayPlan {
  reviews: Card[];
  reviewMinutes: number;
  study: PlanItem[];
  studyMinutes: number;
  totalMinutes: number;
}

const MIN_PER_REVIEW = 0.5;

// Defaults defensivos (a spec 01 tambem os garante em defaultSettings, mas
// bases antigas / chamadas sem esses campos precisam de fallback seguro).
const DEFAULT_PARALLEL_TRACKS = 2;
const DEFAULT_MAX_REVIEWS = 120;
const DEFAULT_NEW_CARDS = 15;

export function statusOf(progress: Map<string, Progress>, subId: string) {
  return progress.get(subId)?.status ?? "todo";
}

// Fila de revisao do dia, ja com o teto de maxReviewsPerDay aplicado. Fonte
// UNICA usada pela home, pelo badge da Nav, pela notificacao e pela pagina
// /revisar — assim todas mostram exatamente o mesmo numero. O excedente
// continua vencido e reaparece amanha.
export function cappedDueCards(cards: Card[], settings: Settings, now: number): Card[] {
  const max = Math.max(0, Math.floor(settings.maxReviewsPerDay ?? DEFAULT_MAX_REVIEWS));
  return dueCards(cards, now).slice(0, max);
}

// Uma trilha esta "liberada" se todos os pre-requisitos estiverem 100% concluidos.
export function trackUnlocked(track: Track, progress: Map<string, Progress>): boolean {
  for (const pid of track.prereqs) {
    const pt = getTrack(pid);
    if (!pt) continue;
    if (trackProgress(pt, progress).done < pt.subtopics.length) return false;
  }
  return true;
}

export function trackProgress(track: Track, progress: Map<string, Progress>) {
  let done = 0;
  let doing = 0;
  for (const s of track.subtopics) {
    const st = statusOf(progress, s.id);
    if (st === "done") done++;
    else if (st === "doing") doing++;
  }
  const total = track.subtopics.length || 1;
  return { done, doing, total: track.subtopics.length, pct: Math.round((done / total) * 100) };
}

export function overallProgress(progress: Map<string, Progress>) {
  let done = 0;
  let doing = 0;
  for (const r of flatSubtopics) {
    const st = statusOf(progress, r.sub.id);
    if (st === "done") done++;
    else if (st === "doing") doing++;
  }
  const total = flatSubtopics.length || 1;
  return { done, doing, total: flatSubtopics.length, pct: Math.round((done / total) * 100) };
}

function planItem(ref: SubRef, progress: Map<string, Progress>): PlanItem {
  return {
    ref,
    reason: statusOf(progress, ref.sub.id) === "doing" ? "continuar" : "proximo",
    minutes: Math.round(ref.sub.estimatedHours * 60),
  };
}

// Comportamento historico: primeiro os subtopicos "em andamento", depois os
// "todo", na ordem global recomendada. Sem gating de pre-requisito para manter
// retrocompatibilidade estrita com o plano linear anterior.
function linearRefs(progress: Map<string, Progress>, limit: number): PlanItem[] {
  const doing: SubRef[] = [];
  const todo: SubRef[] = [];
  for (const r of flatSubtopics) {
    const st = statusOf(progress, r.sub.id);
    if (st === "doing") doing.push(r);
    else if (st === "todo") todo.push(r);
  }
  const ordered = [...doing, ...todo];
  const out: PlanItem[] = [];
  for (const ref of ordered) {
    out.push(planItem(ref, progress));
    if (out.length >= limit) break;
  }
  return out;
}

// Lista de trilhas a priorizar de acordo com o objetivo do usuario.
function goalPriorityTracks(goal: string | undefined): string[] {
  if (!index) return [];
  if (goal === "if") return index.ifConcursoCore ?? [];
  if (goal === "mestrado") {
    const pm = index.prelimMap;
    if (!pm) return [];
    return [...(pm.analise ?? []), ...(pm.algebra ?? []), ...(pm.topologiaGeometria ?? [])];
  }
  return [];
}

// Plano intercalado (interleaving): distribui o estudo em round-robin entre as
// top-N trilhas liberadas em andamento, cobrindo 2-3 trilhas por dia em vez de
// esgotar uma antes de tocar a proxima (blocked practice).
function interleavedRefs(
  progress: Map<string, Progress>,
  limit: number,
  settings: Settings
): PlanItem[] {
  // Agrupa os subtopicos NAO concluidos por trilha, respeitando o gating por
  // pre-requisito e preservando a ordem global recomendada.
  const byTrack = new Map<string, SubRef[]>();
  const trackOrder: string[] = [];
  for (const r of flatSubtopics) {
    if (statusOf(progress, r.sub.id) === "done") continue;
    if (!trackUnlocked(r.track, progress)) continue;
    let list = byTrack.get(r.track.id);
    if (!list) {
      list = [];
      byTrack.set(r.track.id, list);
      trackOrder.push(r.track.id);
    }
    list.push(r);
  }

  if (!trackOrder.length) return [];

  const hasDoing = (tid: string) =>
    (byTrack.get(tid) ?? []).some((r) => statusOf(progress, r.sub.id) === "doing");

  const priority = goalPriorityTracks(settings.goal);
  const goalRank = (tid: string) => {
    const i = priority.indexOf(tid);
    return i === -1 ? Number.MAX_SAFE_INTEGER : i;
  };

  // Ordena as trilhas: 1) as que ja estao em andamento; 2) prioridade por
  // objetivo; 3) empate mantem a ordem recomendada (sort estavel).
  trackOrder.sort((a, b) => {
    const da = hasDoing(a) ? 0 : 1;
    const db = hasDoing(b) ? 0 : 1;
    if (da !== db) return da - db;
    return goalRank(a) - goalRank(b);
  });

  const n = Math.max(1, Math.floor(settings.parallelTracks ?? DEFAULT_PARALLEL_TRACKS));
  const active = trackOrder.slice(0, n);
  const ptr = new Map<string, number>(active.map((t) => [t, 0]));
  let nextTrackIdx = active.length;

  const out: PlanItem[] = [];
  while (out.length < limit) {
    let addedThisRound = false;
    for (const tid of active) {
      const list = byTrack.get(tid)!;
      const p = ptr.get(tid)!;
      if (p < list.length) {
        ptr.set(tid, p + 1);
        out.push(planItem(list[p], progress));
        addedThisRound = true;
        if (out.length >= limit) break;
      }
    }
    if (out.length >= limit) break;
    if (!addedThisRound) {
      // As trilhas ativas esgotaram; puxa a proxima trilha liberada, se houver.
      if (nextTrackIdx < trackOrder.length) {
        const t = trackOrder[nextTrackIdx++];
        active.push(t);
        ptr.set(t, 0);
      } else {
        break;
      }
    }
  }
  return out;
}

// Proximo(s) subtopico(s) recomendado(s).
// - Sem `settings` (chamadas legadas) ou com interleave === false: plano linear
//   identico ao comportamento historico.
// - Com settings.interleave (default true): plano intercalado + gating por
//   pre-requisito.
export function nextRefs(
  progress: Map<string, Progress>,
  limit: number,
  settings?: Settings
): PlanItem[] {
  const interleave = !!settings && settings.interleave !== false;
  if (!interleave) return linearRefs(progress, limit);
  return interleavedRefs(progress, limit, settings!);
}

export function todayPlan(
  cards: Card[],
  progress: Map<string, Progress>,
  settings: Settings,
  now: number
): TodayPlan {
  // Teto de revisoes/dia: o excedente e cortado da fila de hoje e reaparece
  // amanha (continua vencido), evitando que picos de revisao zerem o estudo novo.
  const reviews = cappedDueCards(cards, settings, now);
  const reviewMinutes = Math.ceil(reviews.length * MIN_PER_REVIEW);
  const budget = Math.max(0, settings.minutesPerDay - reviewMinutes);

  // Cota de subtopicos NOVOS por dia: 'continuar' (em andamento) sempre entra;
  // limitamos apenas quantos subtopicos novos iniciamos, para nao acumular
  // divida de revisao quando as revisoes ja estao pesadas.
  const maxNew = Math.max(1, Math.floor(settings.newCardsPerDay ?? DEFAULT_NEW_CARDS));

  const study: PlanItem[] = [];
  let used = 0;
  let newCount = 0;
  for (const item of nextRefs(progress, 12, settings)) {
    // garante pelo menos 1 item de estudo mesmo com o orcamento estourado
    if (study.length >= 1 && used >= budget) break;
    if (item.reason === "proximo" && newCount >= maxNew) continue;
    study.push({ ...item, minutes: item.minutes });
    used += item.minutes;
    if (item.reason === "proximo") newCount++;
    if (used >= budget) break;
  }
  const studyMinutes = Math.min(budget, used);

  return {
    reviews,
    reviewMinutes,
    study,
    studyMinutes,
    totalMinutes: reviewMinutes + studyMinutes,
  };
}

// Maestria de uma trilha: combina cobertura (subtopicos concluidos) com a
// maturidade media dos cartoes da trilha (proxy = card.interval; maduro >= 21d).
// A retencao fina (retrievability real) fica a cargo da spec 04.
export function trackMastery(
  track: Track,
  progress: Map<string, Progress>,
  cards: Card[]
): { coverage: number; maturity: number; mastery: number } {
  const tp = trackProgress(track, progress);
  const coverage = tp.total ? tp.done / tp.total : 0;
  const trackCards = cards.filter((c) => c.trackId === track.id);
  let maturity = 0;
  if (trackCards.length) {
    const sum = trackCards.reduce((s, c) => s + Math.min(1, (c.interval || 0) / 21), 0);
    maturity = sum / trackCards.length;
  }
  const mastery = trackCards.length ? coverage * (0.5 + 0.5 * maturity) : coverage;
  return { coverage, maturity, mastery };
}

export interface Projection {
  remainingHours: number;
  weeklyHours: number;
  weeksLeft: number;
  projectedDate: number | null;
  onTrack: boolean | null;
}

export function projectFinish(
  progress: Map<string, Progress>,
  settings: Settings,
  now: number
): Projection {
  let remainingHours = 0;
  for (const r of flatSubtopics) {
    if (statusOf(progress, r.sub.id) !== "done") remainingHours += r.sub.estimatedHours;
  }
  const weeklyHours = (settings.minutesPerDay * settings.daysPerWeek) / 60;
  const weeksLeft = weeklyHours > 0 ? remainingHours / weeklyHours : Infinity;
  const projectedDate =
    weeklyHours > 0 ? now + weeksLeft * 7 * DAY : null;
  let onTrack: boolean | null = null;
  if (settings.goalDate && projectedDate) onTrack = projectedDate <= settings.goalDate;
  return { remainingHours, weeklyHours, weeksLeft, projectedDate, onTrack };
}

export function totalCurriculumHours(): number {
  return tracks.reduce((s, t) => s + (t.estimatedHours || 0), 0);
}
