// Calibracao FSRS a partir do historico REAL de revisoes do usuario (store 'events').
//
// Ideia (funcoes PURAS, sem DOM/IDB — testaveis isoladamente): reproduzimos o
// proprio modelo `review()` sobre a sequencia de eventos de cada cartao, capturando
// em cada revisao espacada o par (retrievability PREVISTA, acerto OBSERVADO). Com
// isso medimos a calibracao (previsto x real) e ajustamos UM unico fator global de
// escala de intervalo `intervalScale` que melhor explica o esquecimento do usuario.
//
// Filosofia de risco: NAO reescrevemos as constantes internas do FSRS-lite nem
// corrompemos stability/difficulty. Entregamos um escalar interpretavel e opt-in
// (ver settings.fsrsIntervalScale + lib/srs.ts::scheduleDays). k<1 => o usuario
// esquece mais rapido que o modelo preve => intervalos mais curtos.

import type { Card, ReviewEvent } from "./types";
import { DAY, newCard, review, retrievability, type Grade } from "./srs";

const GRADES: Grade[] = ["errei", "dificil", "bom", "facil"];
function asGrade(g: string): Grade {
  return (GRADES as string[]).includes(g) ? (g as Grade) : "bom";
}

/** Uma revisao espacada reconstruida: previsto x observado. */
interface Sample {
  elapsed: number; // dias desde a ultima revisao
  stability: number; // estabilidade do modelo ANTES desta revisao
  predicted: number; // retrievability prevista (0..1)
  recalled: boolean; // acerto observado (grade != 'errei')
}

/** Reproduz o modelo sobre os eventos de um cartao e coleta as amostras de review. */
function replayCard(events: ReviewEvent[], requestRetention: number): Sample[] {
  const sorted = [...events].sort((a, b) => a.ts - b.ts);
  if (!sorted.length) return [];
  const samples: Sample[] = [];
  // Semente: cartao novo no instante do 1o evento (front/back/track irrelevantes p/ agendamento).
  let card: Card = newCard(sorted[0].subId, "x", { front: "", back: "" }, 0, sorted[0].ts);

  for (const e of sorted) {
    // So calibramos revisoes ESPACADAS (estado review, com estabilidade e tempo decorrido>0),
    // ignorando passos de aprendizado (~10 min) que nao medem retencao de longo prazo.
    if (card.state === "review" && card.stability != null && card.lastReview != null) {
      const elapsed = (e.ts - card.lastReview) / DAY;
      if (elapsed >= 0.5) {
        samples.push({
          elapsed,
          stability: card.stability,
          predicted: retrievability(card, e.ts),
          recalled: e.grade !== "errei",
        });
      }
    }
    card = review(card, asGrade(e.grade), e.ts, { requestRetention });
  }
  return samples;
}

export interface CalibrationBin {
  predicted: number; // retrievability media prevista no bin
  observed: number; // taxa de acerto observada no bin
  n: number;
}

export interface FsrsCalibration {
  sampleSize: number; // # de revisoes espacadas usadas
  cardsCovered: number; // # de cartoes com >=1 revisao espacada
  predictedRecall: number; // media da retrievability prevista
  observedRecall: number; // taxa de acerto observada
  /** Fator global de escala de intervalo que melhor explica o historico (>=amostra minima). */
  intervalScale: number;
  /** Escala recomendada, ja saturada em faixa segura [0.7, 1.4]. null se dados insuficientes. */
  recommendedIntervalScale: number | null;
  /** Erro de calibracao |previsto-observado| medio por bin (0=perfeito). */
  calibrationError: number;
  bins: CalibrationBin[];
  enoughData: boolean;
}

const MIN_SAMPLES = 30;

/** Grade de bins de retrievability prevista (deciles), para o grafico previsto x real. */
function buildBins(samples: Sample[]): { bins: CalibrationBin[]; error: number } {
  const buckets = new Array(10).fill(null).map(() => ({ p: 0, o: 0, n: 0 }));
  for (const s of samples) {
    const idx = Math.min(9, Math.max(0, Math.floor(s.predicted * 10)));
    buckets[idx].p += s.predicted;
    buckets[idx].o += s.recalled ? 1 : 0;
    buckets[idx].n += 1;
  }
  const bins: CalibrationBin[] = [];
  let errSum = 0;
  let errN = 0;
  for (const b of buckets) {
    if (!b.n) continue;
    const predicted = b.p / b.n;
    const observed = b.o / b.n;
    bins.push({ predicted, observed, n: b.n });
    errSum += Math.abs(predicted - observed) * b.n;
    errN += b.n;
  }
  return { bins, error: errN ? errSum / errN : 0 };
}

/**
 * Ajusta o fator k que maximiza a log-verossimilhanca de Bernoulli das amostras,
 * com prob. de acerto p_i = 0.9^(elapsed_i / (k * S_i)). Busca em grade [0.5, 2.0].
 * k<1 => intervalos mais curtos (esquece mais rapido); k>1 => mais longos.
 */
function fitIntervalScale(samples: Sample[]): number {
  let bestK = 1;
  let bestLL = -Infinity;
  for (let k = 0.5; k <= 2.0001; k += 0.02) {
    let ll = 0;
    for (const s of samples) {
      const p = Math.min(0.9999, Math.max(0.0001, Math.pow(0.9, s.elapsed / (k * s.stability))));
      ll += s.recalled ? Math.log(p) : Math.log(1 - p);
    }
    if (ll > bestLL) {
      bestLL = ll;
      bestK = k;
    }
  }
  return Math.round(bestK * 100) / 100;
}

/**
 * Calibra o FSRS-lite a partir dos eventos de revisao. Puro e determinístico.
 * @param events store 'events' (ReviewEvent[])
 * @param requestRetention meta de retencao atual (settings.requestRetention ?? 0.9)
 */
export function calibrateFsrs(
  events: ReviewEvent[],
  requestRetention = 0.9
): FsrsCalibration {
  const byCard = new Map<string, ReviewEvent[]>();
  for (const e of events ?? []) {
    const arr = byCard.get(e.cardId) ?? [];
    arr.push(e);
    byCard.set(e.cardId, arr);
  }

  const samples: Sample[] = [];
  let cardsCovered = 0;
  for (const arr of byCard.values()) {
    const s = replayCard(arr, requestRetention);
    if (s.length) cardsCovered++;
    samples.push(...s);
  }

  const sampleSize = samples.length;
  const predictedRecall = sampleSize
    ? samples.reduce((a, s) => a + s.predicted, 0) / sampleSize
    : 0;
  const observedRecall = sampleSize
    ? samples.reduce((a, s) => a + (s.recalled ? 1 : 0), 0) / sampleSize
    : 0;

  const { bins, error } = buildBins(samples);
  const enoughData = sampleSize >= MIN_SAMPLES;
  const intervalScale = enoughData ? fitIntervalScale(samples) : 1;
  const recommendedIntervalScale = enoughData
    ? Math.min(1.4, Math.max(0.7, intervalScale))
    : null;

  return {
    sampleSize,
    cardsCovered,
    predictedRecall,
    observedRecall,
    intervalScale,
    recommendedIntervalScale,
    calibrationError: error,
    bins,
    enoughData,
  };
}
