// Gamificacao DERIVADA — todo XP, nivel e conquista sai dos dados ja persistidos
// (progress / cards / log). Nenhuma escrita nova em IndexedDB, nenhum campo novo
// de schema: qualquer backup antigo recalcula o mesmo resultado. Funcoes puras e
// testaveis isoladamente (nao tocam DOM nem IndexedDB).

import type { Progress, Card, StudyLogEntry, Settings } from "@/lib/types";
import { flatSubtopics, tracks, tracksByPhase } from "@/lib/curriculum";
import { trackProgress } from "@/lib/scheduler";
import { computeStreak } from "@/lib/streak";

// ---- Entrada canonica ----
// Aceita os mesmos containers expostos por useApp(). Tudo opcional/defensivo para
// tolerar backups antigos e estados parciais. `settings` e opcional: com ele, o
// streak usa a MESMA logica "honesta" da home (folgas + freezes de streak.ts);
// sem ele, cai na contagem simples de dias consecutivos (retrocompat).
export interface GamInput {
  progress: Map<string, Progress>;
  cards: Card[];
  log: Map<string, StudyLogEntry>;
  settings?: Settings;
}

// XP por fonte (constantes explicitas para testes e ajuste facil).
export const XP = {
  perSubtopicDone: 100,
  perReview: 2,
  perStreakDay: 10,
  perNotedSub: 20, // anotar "o principal" (keyPoints) e o nucleo do app
  perStudyDay: 15, // APARECER conta: cada dia estudado (mesmo 5 min) rende XP
} as const;

const MATURE_INTERVAL = 21; // dias — cartao "maduro"

// ---- Streak simples (auto-contido; a spec 11 tem a versao "honesta" com folgas,
// mas aqui basta uma contagem pura de dias consecutivos de estudo). ----
function dayStr(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export function studyStreak(log: Map<string, StudyLogEntry>, now: number = Date.now()): number {
  let s = 0;
  const d = new Date(now);
  for (;;) {
    const key = dayStr(d);
    if (log.has(key)) {
      s++;
      d.setDate(d.getDate() - 1);
    } else if (s === 0) {
      // "hoje ainda nao estudado" nao zera o streak de ontem
      d.setDate(d.getDate() - 1);
      if (log.has(dayStr(d))) continue;
      break;
    } else break;
  }
  return s;
}

// ---- Metricas derivadas (reaproveitadas por XP e conquistas) ----
export interface GamStats {
  doneSubs: number;
  totalSubs: number;
  reviewCount: number; // total de revisoes ao longo do tempo (soma de reps)
  matureCards: number;
  studyDays: number;
  totalMinutes: number; // minutos somados na vida toda (valoriza sessoes curtas)
  streak: number;
  tracksComplete: number;
  phasesComplete: number;
  notedSubs: number; // subtopicos com keyPoints preenchido
  earliestHour: number | null; // menor hora de conclusao (madrugador)
  latestHour: number | null; // maior hora de conclusao (coruja)
}

export function computeStats(input: GamInput, now: number = Date.now()): GamStats {
  const { progress, cards, log, settings } = input;

  let doneSubs = 0;
  let notedSubs = 0;
  let earliestHour: number | null = null;
  let latestHour: number | null = null;
  for (const p of progress.values()) {
    if (p.status === "done") {
      doneSubs++;
      if (typeof p.completedAt === "number") {
        const h = new Date(p.completedAt).getHours();
        earliestHour = earliestHour === null ? h : Math.min(earliestHour, h);
        latestHour = latestHour === null ? h : Math.max(latestHour, h);
      }
    }
    if (p.keyPoints && p.keyPoints.trim().length > 0) notedSubs++;
  }

  let reviewCount = 0;
  let matureCards = 0;
  for (const c of cards) {
    reviewCount += c.reps || 0;
    if ((c.interval || 0) >= MATURE_INTERVAL) matureCards++;
  }

  let totalMinutes = 0;
  for (const e of log.values()) totalMinutes += e.minutes || 0;

  let tracksComplete = 0;
  for (const t of tracks) {
    const tp = trackProgress(t, progress);
    if (tp.total > 0 && tp.done >= tp.total) tracksComplete++;
  }

  let phasesComplete = 0;
  for (const { tracks: phaseTracks } of tracksByPhase()) {
    if (!phaseTracks.length) continue;
    const allDone = phaseTracks.every((t) => {
      const tp = trackProgress(t, progress);
      return tp.total > 0 && tp.done >= tp.total;
    });
    if (allDone) phasesComplete++;
  }

  return {
    doneSubs,
    totalSubs: flatSubtopics.length,
    reviewCount,
    matureCards,
    studyDays: log.size,
    totalMinutes,
    // Fonte unica de verdade do streak: a mesma logica "honesta" exibida na home.
    streak: settings ? computeStreak(log, settings, now).count : studyStreak(log, now),
    tracksComplete,
    phasesComplete,
    notedSubs,
    earliestHour,
    latestHour,
  };
}

// ---- XP ----
export function computeXp(input: GamInput, now: number = Date.now()): number {
  const s = computeStats(input, now);
  return (
    s.doneSubs * XP.perSubtopicDone +
    s.reviewCount * XP.perReview +
    s.streak * XP.perStreakDay +
    s.notedSubs * XP.perNotedSub +
    s.studyDays * XP.perStudyDay
  );
}

// ---- Niveis tematicos ----
// Floors cumulativos de XP; o ultimo e o teto ("Monstro da matematica").
export interface LevelDef {
  level: number;
  name: string;
  floor: number;
}

export const LEVELS: LevelDef[] = [
  { level: 1, name: "Aprendiz de numeros", floor: 0 },
  { level: 2, name: "Cacador de padroes", floor: 400 },
  { level: 3, name: "Domador de equacoes", floor: 1000 },
  { level: 4, name: "Estrategista dos limites", floor: 2000 },
  { level: 5, name: "Arquiteto de provas", floor: 3600 },
  { level: 6, name: "Feiticeiro das estruturas", floor: 6000 },
  { level: 7, name: "Mestre do rigor", floor: 9500 },
  { level: 8, name: "Monstro da matematica", floor: 15000 },
];

export interface LevelInfo {
  level: number;
  name: string;
  floor: number; // XP no inicio deste nivel
  ceil: number | null; // XP necessario para o proximo (null = nivel maximo)
  next: string | null; // nome do proximo nivel
  xpInto: number; // XP acumulado dentro do nivel atual
  span: number; // XP total do nivel atual
  pct: number; // 0-100 rumo ao proximo nivel
  xp: number; // XP absoluto informado
}

export function levelFor(xp: number): LevelInfo {
  const safe = Math.max(0, Math.floor(xp || 0));
  let idx = 0;
  for (let i = 0; i < LEVELS.length; i++) {
    if (safe >= LEVELS[i].floor) idx = i;
    else break;
  }
  const cur = LEVELS[idx];
  const nxt = LEVELS[idx + 1] ?? null;
  const ceil = nxt ? nxt.floor : null;
  const span = nxt ? nxt.floor - cur.floor : 0;
  const xpInto = safe - cur.floor;
  const pct = nxt ? Math.max(0, Math.min(100, Math.round((xpInto / span) * 100))) : 100;
  return {
    level: cur.level,
    name: cur.name,
    floor: cur.floor,
    ceil,
    next: nxt ? nxt.name : null,
    xpInto,
    span,
    pct,
    xp: safe,
  };
}

// ---- Conquistas ----
export interface AchievementDef {
  id: string;
  title: string;
  desc: string;
  icon: string;
  check: (s: GamStats) => boolean;
}

// Catalogo checado contra o estado atual. Ordem = ordem de exibicao (grosso modo
// do mais facil ao mais raro).
export const ACHIEVEMENTS: AchievementDef[] = [
  {
    id: "first-day",
    title: "No placar",
    desc: "Estudou pela primeira vez — o comeco de tudo.",
    icon: "•",
    check: (s) => s.studyDays >= 1,
  },
  {
    id: "first-sub",
    title: "Primeiro passo",
    desc: "Concluiu o primeiro subtopico.",
    icon: "▸",
    check: (s) => s.doneSubs >= 1,
  },
  {
    id: "days-3",
    title: "Trinca de presenca",
    desc: "Estudou em 3 dias — o habito comeca a nascer.",
    icon: "▪",
    check: (s) => s.studyDays >= 3,
  },
  {
    id: "min-30",
    title: "Meia hora somada",
    desc: "30 minutos acumulados, pedacinho por pedacinho.",
    icon: "◔",
    check: (s) => s.totalMinutes >= 30,
  },
  {
    id: "streak-3",
    title: "Tres seguidos",
    desc: "3 dias seguidos de estudo.",
    icon: "Δ",
    check: (s) => s.streak >= 3,
  },
  {
    id: "noted-5",
    title: "Caderno aberto",
    desc: "Anotou 'o principal' em 5 subtopicos.",
    icon: "✎",
    check: (s) => s.notedSubs >= 5,
  },
  {
    id: "subs-10",
    title: "Pegando o ritmo",
    desc: "10 subtopicos concluidos.",
    icon: "▤",
    check: (s) => s.doneSubs >= 10,
  },
  {
    id: "reviews-100",
    title: "Centuriao da memoria",
    desc: "100 revisoes espacadas feitas.",
    icon: "≡",
    check: (s) => s.reviewCount >= 100,
  },
  {
    id: "min-120",
    title: "Duas horas, gota a gota",
    desc: "120 minutos acumulados em sessoes que somaram.",
    icon: "◑",
    check: (s) => s.totalMinutes >= 120,
  },
  {
    id: "days-10",
    title: "Dez dias no jogo",
    desc: "Estudou em 10 dias distintos.",
    icon: "❉",
    check: (s) => s.studyDays >= 10,
  },
  {
    id: "min-600",
    title: "Dez horas somadas",
    desc: "600 minutos acumulados — a prova de que pouco vira muito.",
    icon: "●",
    check: (s) => s.totalMinutes >= 600,
  },
  {
    id: "streak-7",
    title: "Semana de fogo",
    desc: "7 dias seguidos de estudo.",
    icon: "Δ",
    check: (s) => s.streak >= 7,
  },
  {
    id: "first-track",
    title: "Trilha zerada",
    desc: "Concluiu uma trilha inteira.",
    icon: "✓",
    check: (s) => s.tracksComplete >= 1,
  },
  {
    id: "mature-20",
    title: "Memoria de aco",
    desc: "20 cartoes na memoria de longo prazo (>= 21 dias).",
    icon: "◈",
    check: (s) => s.matureCards >= 20,
  },
  {
    id: "night-owl",
    title: "Coruja",
    desc: "Concluiu um subtopico de madrugada (0h-5h).",
    icon: "●",
    check: (s) => s.latestHour !== null && s.latestHour <= 4,
  },
  {
    id: "early-bird",
    title: "Madrugador",
    desc: "Concluiu um subtopico cedinho (5h-8h).",
    icon: "○",
    check: (s) => s.earliestHour !== null && s.earliestHour >= 5 && s.earliestHour < 8,
  },
  {
    id: "phase-complete",
    title: "Fase dominada",
    desc: "Concluiu uma fase inteira do curriculo.",
    icon: "❖",
    check: (s) => s.phasesComplete >= 1,
  },
  {
    id: "streak-30",
    title: "Mes imparavel",
    desc: "30 dias seguidos de estudo.",
    icon: "Δ",
    check: (s) => s.streak >= 30,
  },
  {
    id: "reviews-500",
    title: "Arquiteto da retencao",
    desc: "500 revisoes espacadas feitas.",
    icon: "∎",
    check: (s) => s.reviewCount >= 500,
  },
  {
    id: "max-level",
    title: "Monstro da matematica",
    desc: "Alcancou o nivel maximo.",
    icon: "∞",
    // checado via XP no wrapper listAchievements
    check: () => false,
  },
];

export interface AchievementState {
  id: string;
  title: string;
  desc: string;
  icon: string;
  unlocked: boolean;
}

export function listAchievements(input: GamInput, now: number = Date.now()): AchievementState[] {
  const s = computeStats(input, now);
  const xp = computeXp(input, now);
  const maxLevel = levelFor(xp).next === null;
  return ACHIEVEMENTS.map((a) => ({
    id: a.id,
    title: a.title,
    desc: a.desc,
    icon: a.icon,
    unlocked: a.id === "max-level" ? maxLevel : a.check(s),
  }));
}

export function unlockedCount(input: GamInput, now: number = Date.now()): number {
  return listAchievements(input, now).filter((a) => a.unlocked).length;
}
