// Insígnias "Matemático Nível 1-5" — DERIVADAS, como toda a gamificação:
// nenhum campo novo de schema, nenhuma escrita nova em IndexedDB. O
// conhecimento inteiro (27 trilhas) é dividido em 5 camadas; a insígnia de
// nível k desbloqueia quando TODAS as trilhas das camadas 1..k estão
// concluídas (cumulativo: ser "Matemático Nível 3" implica dominar tudo até
// a camada 3 — a ordem natural já é induzida pelos pré-requisitos).
//
// A arte pixel art de cada insígnia vive em components/Insignias.tsx; aqui
// fica só a lógica pura (testável sem DOM).

import type { Progress } from "@/lib/types";
import { tracks } from "@/lib/curriculum";
import { trackProgress } from "@/lib/scheduler";

export interface TierDef {
  level: 1 | 2 | 3 | 4 | 5;
  key: string;
  /** Nome evocativo da insígnia (ex.: "O Escriba de Babilônia"). */
  name: string;
  /** Uma frase: o que ela representa historicamente. */
  subtitle: string;
  /** Época/tema histórico que ancora a arte. */
  era: string;
  trackIds: string[];
}

// Divisão das 27 trilhas em 5 camadas de conhecimento (fixada em 2026-07-04):
// segue a ordem recomendada do currículo — base do bacharelado, núcleo, núcleo
// avançado, pré-pós e fronteira. Se uma trilha nova entrar no currículo, ela
// precisa ser adicionada a exatamente UMA camada (o validate não deixa órfãs —
// ver checkTiersCoverAllTracks abaixo, usada em tempo de build/teste).
export const TIERS: TierDef[] = [
  {
    level: 1,
    key: "escriba",
    name: "O Escriba de Babilônia",
    subtitle:
      "A tábua Plimpton 322 (c. 1800 a.C.): ternas pitagóricas gravadas em argila um milênio antes de Pitágoras.",
    era: "Babilônia, c. 1800 a.C. — Plimpton 322",
    trackIds: ["fundamentos", "prova", "calculo1", "calculo2", "algebra-linear", "calculo3"],
  },
  {
    level: 2,
    key: "geometra",
    name: "O Geômetra de Alexandria",
    subtitle: "Euclides e os Elementos: o método axiomático transforma cálculo em demonstração.",
    era: "Grécia, c. 300 a.C. — os Elementos",
    trackIds: ["analise-real-1", "algebra-abstrata-1", "combinatoria", "teoria-numeros"],
  },
  {
    level: 3,
    key: "analista",
    name: "O Analista de Basileia",
    subtitle:
      "O ∫ que Leibniz alongou do \"s\" de summa e a identidade de Euler, e^{iπ}+1=0 — a era de ouro da análise.",
    era: "Século XVIII — a identidade de Euler",
    trackIds: ["analise-real-2", "edo", "analise-complexa", "topologia", "algebra-abstrata-2", "prob-estatistica"],
  },
  {
    level: 4,
    key: "rigorista",
    name: "A Teia de Galois",
    subtitle:
      "As cinco raízes da quíntica ligadas por cordas de permutação — a simetria que Galois enxergou antes de morrer aos 20 num duelo.",
    era: "Século XIX — simetria, medida e rigor",
    trackIds: ["medida", "teoria-galois", "geometria-diferencial", "analise-funcional", "edp"],
  },
  {
    level: 5,
    key: "monstro",
    name: "O Luar do Monstro",
    subtitle:
      "O grupo Monstro: ~8×10⁵³ simetrias em 196 883 dimensões, e o monstrous moonshine que o liga à função j — a fronteira.",
    era: "1982 — Fischer–Griess e o monstrous moonshine",
    trackIds: [
      "topologia-algebrica",
      "algebra-comutativa",
      "teoria-representacao",
      "logica-conjuntos",
      "geometria-algebrica",
      "category-theory",
    ],
  },
];

export interface TierState extends TierDef {
  /** Trilhas concluídas / total DESTA camada. */
  done: number;
  total: number;
  /** Subtópicos concluídos / total desta camada (progresso fino p/ a barra). */
  subsDone: number;
  subsTotal: number;
  /** Esta camada está 100% concluída (independente das anteriores). */
  tierComplete: boolean;
  /** Insígnia desbloqueada: TODAS as camadas 1..level completas. */
  unlocked: boolean;
}

export interface InsigniasState {
  tiers: TierState[];
  /** Maior k com camadas 1..k completas (0 = ainda nenhum). */
  mathematicianLevel: number;
  /** Próxima camada a fechar (null quando nível 5 alcançado). */
  next: TierState | null;
}

export function computeInsignias(progress: Map<string, Progress>): InsigniasState {
  const byId = new Map(tracks.map((t) => [t.id, t]));
  const states: TierState[] = [];
  let cumulative = true;
  let mathematicianLevel = 0;

  for (const tier of TIERS) {
    let done = 0;
    let subsDone = 0;
    let subsTotal = 0;
    let total = 0;
    for (const id of tier.trackIds) {
      const t = byId.get(id);
      if (!t) continue; // trilha ainda não carregada/renomeada: não conta como concluída
      total++;
      const tp = trackProgress(t, progress);
      subsDone += tp.done;
      subsTotal += tp.total;
      if (tp.total > 0 && tp.done >= tp.total) done++;
    }
    const tierComplete = total > 0 && done >= total;
    cumulative = cumulative && tierComplete;
    if (cumulative) mathematicianLevel = tier.level;
    states.push({ ...tier, done, total, subsDone, subsTotal, tierComplete, unlocked: cumulative });
  }

  return {
    tiers: states,
    mathematicianLevel,
    next: states.find((s) => !s.unlocked) ?? null,
  };
}

/** Sanidade: toda trilha do currículo pertence a exatamente uma camada.
 * Retorna lista de problemas (vazia = ok). Consumida por testes/validate. */
export function checkTiersCoverAllTracks(allTrackIds: string[]): string[] {
  const problems: string[] = [];
  const seen = new Map<string, string>();
  for (const tier of TIERS) {
    for (const id of tier.trackIds) {
      const prev = seen.get(id);
      if (prev) problems.push(`trilha "${id}" em duas camadas: ${prev} e ${tier.key}`);
      seen.set(id, tier.key);
    }
  }
  for (const id of allTrackIds) {
    if (!seen.has(id)) problems.push(`trilha "${id}" fora de qualquer camada`);
  }
  for (const id of seen.keys()) {
    if (!allTrackIds.includes(id)) problems.push(`camada referencia trilha inexistente "${id}"`);
  }
  return problems;
}
