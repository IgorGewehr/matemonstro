// Funcoes PURAS de analytics (sem DOM, sem IndexedDB) — testaveis isoladamente.
// Consomem os stores existentes (log/cards/progress) e o store 'events' (spec 01),
// e reaproveitam helpers de lib/srs (spec 02).

import type {
  Card,
  Progress,
  StudyLogEntry,
  Track,
  Curriculum,
  ReviewEvent,
} from "@/lib/types";
import { DAY, dueSoon, isLeech, retrievability } from "@/lib/srs";

// ---------------------------------------------------------------------------
// Heatmap (estilo contribution-graph): minutos + revisoes por dia
// ---------------------------------------------------------------------------

export interface HeatCell {
  day: string; // YYYY-MM-DD (UTC, compativel com StudyLogEntry.day)
  ts: number; // meia-noite UTC do dia
  minutes: number;
  reviews: number;
  col: number; // coluna da grade (0 = semana mais antiga)
  row: number; // 0 = domingo … 6 = sabado
  inFuture: boolean; // dia posterior a hoje (celula vazia na ultima coluna)
}

export interface HeatmapData {
  cells: HeatCell[];
  weeks: number;
  maxMinutes: number;
  totalMinutes: number;
  totalReviews: number;
  activeDays: number;
}

function dayKeyUTC(ts: number): string {
  return new Date(ts).toISOString().slice(0, 10);
}

/**
 * Constroi os buckets diarios das ultimas ~`weeks` semanas, alinhados em
 * colunas de semana (domingo → sabado) terminando na semana de hoje.
 */
export function heatmapBuckets(
  log: Map<string, StudyLogEntry>,
  weeks = 26,
  now = Date.now()
): HeatmapData {
  const w = Math.max(1, Math.floor(weeks));
  const todayKey = dayKeyUTC(now);
  const todayMid = Date.parse(todayKey + "T00:00:00.000Z");
  const dow = new Date(todayMid).getUTCDay(); // 0 = domingo
  const startMid = todayMid - ((w - 1) * 7 + dow) * DAY;
  const count = (w - 1) * 7 + dow + 1;

  const cells: HeatCell[] = [];
  let maxMinutes = 0;
  let totalMinutes = 0;
  let totalReviews = 0;
  let activeDays = 0;

  for (let i = 0; i < count; i++) {
    const ts = startMid + i * DAY;
    const day = dayKeyUTC(ts);
    const entry = log.get(day);
    const minutes = entry?.minutes ?? 0;
    const reviews = entry?.reviews ?? 0;
    if (minutes > maxMinutes) maxMinutes = minutes;
    totalMinutes += minutes;
    totalReviews += reviews;
    if (minutes > 0 || reviews > 0) activeDays++;
    cells.push({
      day,
      ts,
      minutes,
      reviews,
      col: Math.floor(i / 7),
      row: i % 7,
      inFuture: ts > todayMid,
    });
  }

  return { cells, weeks: w, maxMinutes, totalMinutes, totalReviews, activeDays };
}

// ---------------------------------------------------------------------------
// Horas por area: estimatedHours concluidas agrupadas por fase/trilha
// ---------------------------------------------------------------------------

export interface AreaTrack {
  id: string;
  title: string;
  doneHours: number;
  totalHours: number;
}

export interface AreaGroup {
  phaseId: number;
  label: string;
  doneHours: number;
  totalHours: number;
  tracks: AreaTrack[];
}

function isDone(progress: Map<string, Progress>, subId: string): boolean {
  return progress.get(subId)?.status === "done";
}

export function hoursByArea(
  progress: Map<string, Progress>,
  curriculum: Curriculum
): AreaGroup[] {
  const trackById = new Map<string, Track>(
    (curriculum.tracks ?? []).map((t) => [t.id, t])
  );

  function trackHours(t: Track): AreaTrack {
    let doneHours = 0;
    let totalHours = 0;
    for (const s of t.subtopics) {
      const h = s.estimatedHours || 0;
      totalHours += h;
      if (isDone(progress, s.id)) doneHours += h;
    }
    return { id: t.id, title: t.title, doneHours, totalHours };
  }

  const phases = curriculum.index?.phases ?? [];
  const groups: AreaGroup[] = [];
  const seen = new Set<string>();

  for (const ph of phases) {
    const tracks: AreaTrack[] = [];
    for (const id of ph.trackIds) {
      const t = trackById.get(id);
      if (!t) continue;
      seen.add(id);
      tracks.push(trackHours(t));
    }
    groups.push({
      phaseId: ph.id,
      label: ph.label,
      doneHours: tracks.reduce((s, x) => s + x.doneHours, 0),
      totalHours: tracks.reduce((s, x) => s + x.totalHours, 0),
      tracks,
    });
  }

  // trilhas fora de qualquer fase declarada → agrupa por track.phase
  const orphans = (curriculum.tracks ?? []).filter((t) => !seen.has(t.id));
  if (orphans.length) {
    const byPhase = new Map<number, Track[]>();
    for (const t of orphans) {
      const arr = byPhase.get(t.phase) ?? [];
      arr.push(t);
      byPhase.set(t.phase, arr);
    }
    for (const [pid, ts] of [...byPhase.entries()].sort((a, b) => a[0] - b[0])) {
      const existing = groups.find((g) => g.phaseId === pid);
      const tracks = ts.map(trackHours);
      if (existing) {
        existing.tracks.push(...tracks);
        existing.doneHours += tracks.reduce((s, x) => s + x.doneHours, 0);
        existing.totalHours += tracks.reduce((s, x) => s + x.totalHours, 0);
      } else {
        groups.push({
          phaseId: pid,
          label: ts[0]?.phaseLabel ?? `Fase ${pid}`,
          doneHours: tracks.reduce((s, x) => s + x.doneHours, 0),
          totalHours: tracks.reduce((s, x) => s + x.totalHours, 0),
          tracks,
        });
      }
    }
  }

  return groups;
}

// ---------------------------------------------------------------------------
// Saude da memoria + retencao real
// ---------------------------------------------------------------------------

const MATURE_DAYS = 21;

export interface RetentionStats {
  total: number;
  mature: number; // interval >= 21d
  matureRatio: number; // 0-1
  avgEase: number;
  avgDifficulty: number | null; // media de difficulty (spec 02), null se ausente
  totalLapses: number;
  leechCount: number;
  avgRetrievability: number; // 0-1 (media de retrievability dos cartoes)
  reviewsLogged: number;
  recalled: number; // eventos com grade != 'errei'
  recallRate: number | null; // null se nao ha events
}

export function retentionStats(
  cards: Card[],
  events: ReviewEvent[],
  now = Date.now()
): RetentionStats {
  const total = cards.length;
  let mature = 0;
  let easeSum = 0;
  let diffSum = 0;
  let diffCount = 0;
  let totalLapses = 0;
  let leechCount = 0;
  let retrSum = 0;
  let retrCount = 0;

  for (const c of cards) {
    if ((c.interval ?? 0) >= MATURE_DAYS) mature++;
    easeSum += c.ease ?? 0;
    if (typeof c.difficulty === "number") {
      diffSum += c.difficulty;
      diffCount++;
    }
    totalLapses += c.lapses ?? 0;
    if (isLeech(c)) leechCount++;
    const r = retrievability(c, now);
    if (Number.isFinite(r)) {
      retrSum += r;
      retrCount++;
    }
  }

  const evs = events ?? [];
  const recalled = evs.filter((e) => e.grade !== "errei").length;

  return {
    total,
    mature,
    matureRatio: total ? mature / total : 0,
    avgEase: total ? easeSum / total : 0,
    avgDifficulty: diffCount ? diffSum / diffCount : null,
    totalLapses,
    leechCount,
    avgRetrievability: retrCount ? retrSum / retrCount : 0,
    reviewsLogged: evs.length,
    recalled,
    recallRate: evs.length ? recalled / evs.length : null,
  };
}

// ---------------------------------------------------------------------------
// Previsao de carga de revisao (proximos `days` dias)
// ---------------------------------------------------------------------------

export interface ForecastBucket {
  offset: number; // 0 = amanha? nao — 0 = daqui a <1 dia
  ts: number;
  day: string;
  count: number;
}

export interface DueForecast {
  overdue: number; // vencidos agora
  buckets: ForecastBucket[];
  max: number;
  total: number;
}

export function dueForecast(cards: Card[], now = Date.now(), days = 30): DueForecast {
  const overdue = cards.filter((c) => c.due <= now).length;
  const soon = dueSoon(cards, now, days);
  const counts = new Array(days).fill(0) as number[];
  for (const c of soon) {
    const offset = Math.floor((c.due - now) / DAY);
    if (offset >= 0 && offset < days) counts[offset]++;
  }
  let max = 0;
  let total = 0;
  const buckets: ForecastBucket[] = counts.map((count, offset) => {
    if (count > max) max = count;
    total += count;
    const ts = now + offset * DAY;
    return { offset, ts, day: dayKeyUTC(ts), count };
  });
  return { overdue, buckets, max, total };
}

// ---------------------------------------------------------------------------
// Dominio por trilha: cobertura × retrievability media
// ---------------------------------------------------------------------------

export function trackMasteryPct(
  track: Track,
  progress: Map<string, Progress>,
  cards: Card[],
  now = Date.now()
): number {
  const total = track.subtopics.length || 1;
  let done = 0;
  for (const s of track.subtopics) if (isDone(progress, s.id)) done++;
  const coverage = done / total;

  const trackCards = cards.filter((c) => c.trackId === track.id);
  let retrSum = 0;
  let retrCount = 0;
  for (const c of trackCards) {
    const r = retrievability(c, now);
    if (Number.isFinite(r)) {
      retrSum += r;
      retrCount++;
    }
  }
  const avgRetr = retrCount ? retrSum / retrCount : 1; // sem cartoes → so cobertura
  return Math.round(coverage * avgRetr * 100);
}
