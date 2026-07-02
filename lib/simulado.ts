// Simulado com relógio: monta uma prova cronometrada a partir do banco de
// exames (examBank) + exercícios com solução, registra o resultado no
// histórico local (kv) e devolve os erros para o SRS de prática. Funções puras
// exceto o acesso ao kv (isolado em loadSimHistory/saveSimResult).

import type { PracticeItem, PracticeFilters } from "./practice";
import { matchesFilters } from "./practice";
import { buildAllPracticeItems } from "./practice-data";
import { kvGet, kvSet } from "./store";

export interface SimResult {
  ts: number;
  total: number;
  certas: number;
  erradas: number;
  emBranco: number;
  minutes: number; // tempo configurado
  usedSec: number; // tempo efetivamente usado
  exam: "all" | "if" | "mestrado";
  trackId?: string;
}

const KV_KEY = "simulados";
const MAX_HISTORY = 50;

export async function loadSimHistory(): Promise<SimResult[]> {
  return (await kvGet<SimResult[]>(KV_KEY)) ?? [];
}

export async function saveSimResult(r: SimResult): Promise<SimResult[]> {
  const hist = [r, ...(await loadSimHistory())].slice(0, MAX_HISTORY);
  await kvSet(KV_KEY, hist);
  return hist;
}

/** Pool elegível: casa com os filtros e tem gabarito (solução/passos) para corrigir. */
export function simPool(filters: PracticeFilters): PracticeItem[] {
  return buildAllPracticeItems().filter(
    (it) => matchesFilters(it, filters) && !!(it.solution || (it.steps && it.steps.length))
  );
}

/** Sorteia `count` questões do pool, espalhando entre trilhas (round-robin embaralhado). */
export function drawSimQuestions(pool: PracticeItem[], count: number): PracticeItem[] {
  const byTrack = new Map<string, PracticeItem[]>();
  for (const it of pool) {
    const arr = byTrack.get(it.trackId) ?? [];
    arr.push(it);
    byTrack.set(it.trackId, arr);
  }
  const buckets = [...byTrack.values()].map((arr) => shuffle(arr));
  shuffle(buckets);
  const out: PracticeItem[] = [];
  let added = true;
  while (out.length < count && added) {
    added = false;
    for (const b of buckets) {
      const it = b.pop();
      if (it) {
        out.push(it);
        added = true;
        if (out.length >= count) break;
      }
    }
  }
  return out;
}

function shuffle<T>(arr: T[]): T[] {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

/** Sugestão de tempo: ~6 min por questão, arredondado pra cima em blocos de 5. */
export function suggestedMinutes(count: number): number {
  return Math.ceil((count * 6) / 5) * 5;
}

export function formatClock(totalSec: number): string {
  const s = Math.max(0, Math.floor(totalSec));
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${String(m).padStart(2, "0")}:${String(r).padStart(2, "0")}`;
}
