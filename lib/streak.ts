// Streak honesto: respeita os dias de descanso configurados (settings.daysPerWeek)
// e suporta freeze tokens (settings.streakFreezes) que atravessam UM dia perdido.
//
// Funcoes PURAS e testaveis — sem acesso a DOM/IndexedDB. A home consome
// computeStreak para exibir o estado e, opcionalmente, settleStreak (uma vez por
// dia, guardado por settings.lastStreakDay) para persistir consumo/ganho de
// freezes via updateSettings.
import type { Settings, StudyLogEntry } from "@/lib/types";

const DAY = 86400000;
// Teto de tokens de freeze acumulaveis — evita "banco infinito" de folgas.
export const MAX_FREEZES = 3;

export function dayKey(ts: number): string {
  return new Date(ts).toISOString().slice(0, 10);
}

export type StreakStatus = "active" | "protected" | "at-risk" | "none";

export interface StreakInfo {
  /** Dias mantidos na sequencia (nao conta hoje se ainda nao estudado). */
  count: number;
  /** Se hoje ja registrou estudo/revisao. */
  studiedToday: boolean;
  /**
   * active   — estudou hoje, sequencia viva.
   * protected — hoje ainda pendente, mas e folga ou ha freeze: sequencia intacta.
   * at-risk  — hoje e dia de obrigacao e sem folga/freeze: precisa estudar hoje.
   * none     — sem sequencia.
   */
  status: StreakStatus;
  /** Freeze tokens restantes apos o consumo virtual desta apuracao. */
  freezesLeft: number;
  /** Quantos freezes foram consumidos para atravessar faltas. */
  freezesUsed: number;
}

function clampDaysPerWeek(dpw: number | undefined): number {
  const v = Math.round(dpw ?? 5);
  return Math.min(7, Math.max(1, Number.isFinite(v) ? v : 5));
}

/**
 * Calcula a sequencia de estudo de forma "honesta":
 * - Caminha do dia de hoje para tras somando dias com registro no log.
 * - Faltas sao PERDOADAS enquanto o numero de faltas na janela dos ultimos 7
 *   dias nao ultrapassar as folgas permitidas (7 - daysPerWeek).
 * - Excedeu as folgas? Consome um freeze token, se houver. Sem token, quebra.
 * - O dia de hoje ainda nao estudado NAO quebra a sequencia — fica "pendente".
 */
export function computeStreak(
  log: Map<string, StudyLogEntry>,
  settings: Settings,
  now: number = Date.now()
): StreakInfo {
  const daysPerWeek = clampDaysPerWeek(settings.daysPerWeek);
  const restPerWeek = 7 - daysPerWeek; // folgas permitidas por janela de 7 dias
  const startFreezes = Math.max(0, Math.floor(settings.streakFreezes ?? 0));

  const studied = (offset: number) => log.has(dayKey(now - offset * DAY));
  const studiedToday = studied(0);

  let count = 0;
  let freezesLeft = startFreezes;
  let freezesUsed = 0;

  // Janela deslizante com os ultimos ate 7 dias processados (true = estudou).
  const windowDays: boolean[] = [];
  const missesInWindow = () => windowDays.reduce((n, s) => (s ? n : n + 1), 0);

  // Se hoje ainda nao foi estudado, comecamos a medir a partir de ontem.
  let offset = studiedToday ? 0 : 1;
  const LIMIT = 366 * 10; // seguranca: ~10 anos

  for (; offset < LIMIT; offset++) {
    const didStudy = studied(offset);
    if (didStudy) {
      windowDays.push(true);
      if (windowDays.length > 7) windowDays.shift();
      count++;
      continue;
    }

    // Dia sem registro: tenta cobrir com folga semanal, depois com freeze.
    windowDays.push(false);
    if (windowDays.length > 7) windowDays.shift();
    const misses = missesInWindow();
    if (misses <= restPerWeek) {
      // Folga legitima — mantem a sequencia, sem contar como dia estudado.
      // Se nunca houve estudo ainda, isso e so ausencia total: encerra.
      if (count === 0 && offset > restPerWeek) break;
      continue;
    }
    if (freezesLeft > 0) {
      freezesLeft--;
      freezesUsed++;
      continue;
    }
    // Sem folga e sem freeze: a sequencia quebra aqui.
    break;
  }

  let status: StreakStatus;
  if (studiedToday) {
    status = count > 0 ? "active" : "none";
  } else if (count === 0) {
    status = "none";
  } else {
    // Hoje esta pendente: se nao estudar, quebra? Simula hoje como falta.
    const prospectiveMisses = missesInWindow() + 1;
    status = prospectiveMisses <= restPerWeek || freezesLeft > 0 ? "protected" : "at-risk";
  }

  return { count, studiedToday, status, freezesLeft, freezesUsed };
}

/**
 * Reconciliacao diaria de freeze tokens (idempotente por dia via lastStreakDay).
 * Retorna um patch de Settings a ser persistido com updateSettings, ou null se
 * ja foi feito hoje / nada mudou. Ganha 1 token a cada 7 dias de sequencia.
 */
export function settleStreak(
  log: Map<string, StudyLogEntry>,
  settings: Settings,
  now: number = Date.now()
): Partial<Settings> | null {
  const today = dayKey(now);
  if (settings.lastStreakDay === today) return null;

  const info = computeStreak(log, settings, now);
  let freezes = info.freezesLeft;

  // Recompensa: 1 freeze a cada 7 dias completos de sequencia (no dia do marco).
  if (info.studiedToday && info.count > 0 && info.count % 7 === 0) {
    freezes = Math.min(MAX_FREEZES, freezes + 1);
  }

  const prevFreezes = Math.max(0, Math.floor(settings.streakFreezes ?? 0));
  if (freezes === prevFreezes && settings.lastStreakDay === today) return null;

  return { streakFreezes: freezes, lastStreakDay: today };
}
