// Treino de demonstração: identifica exercícios de prova no currículo e define
// a rubrica de auto-avaliação (estratégia / rigor / completude) que converte a
// autocrítica do aluno numa nota do SRS de prática (acertei/quase/errei) — o
// que vai mal cai no modo erros como qualquer exercício. Funções puras.

import type { PracticeItem, PracticeGrade } from "./practice";
import { buildAllPracticeItems } from "./practice-data";

// Verbos que caracterizam exercício de demonstração (PT-BR do currículo).
const PROOF_RE =
  /\b(prove|demonstre|mostre que|mostre, |justifique|deduza|conclua que|refute|verifique que|argumente|exiba um contraexemplo|d[eê] um contraexemplo)\b/i;

export function isProofPrompt(prompt: string): boolean {
  return PROOF_RE.test(prompt ?? "");
}

let cache: PracticeItem[] | null = null;
let cacheFor = -1;

/** Todos os exercícios de demonstração do currículo (subconjunto da prática). */
export function buildProofItems(): PracticeItem[] {
  const all = buildAllPracticeItems();
  if (cache && cacheFor === all.length) return cache;
  cacheFor = all.length;
  cache = all.filter((it) => isProofPrompt(it.prompt));
  return cache;
}

// ---- Rubrica ----

export type RubricLevel = 0 | 1 | 2;

export interface ProofRubric {
  estrategia: RubricLevel | null;
  rigor: RubricLevel | null;
  completude: RubricLevel | null;
}

export const EMPTY_RUBRIC: ProofRubric = { estrategia: null, rigor: null, completude: null };

export interface RubricAxis {
  key: keyof ProofRubric;
  label: string;
  question: string;
  levels: [string, string, string]; // rótulos para 0, 1, 2
}

export const RUBRIC_AXES: RubricAxis[] = [
  {
    key: "estrategia",
    label: "Estratégia",
    question: "A abordagem era a certa?",
    levels: ["Errada / não vi", "Parcial", "A certa"],
  },
  {
    key: "rigor",
    label: "Rigor",
    question: "Cada passo está justificado?",
    levels: ["Furos graves", "Alguns furos", "Sem furos"],
  },
  {
    key: "completude",
    label: "Completude",
    question: "Chegou até o fim?",
    levels: ["Não terminei", "Quase", "Completa"],
  },
];

export function rubricComplete(r: ProofRubric): boolean {
  return r.estrategia !== null && r.rigor !== null && r.completude !== null;
}

/** Converte a rubrica (0–6 pontos) na nota do SRS de prática. */
export function rubricGrade(r: ProofRubric): PracticeGrade {
  const total = (r.estrategia ?? 0) + (r.rigor ?? 0) + (r.completude ?? 0);
  if (total >= 5) return "acertei";
  if (total >= 3) return "quase";
  return "errei";
}

export const GRADE_MEANING: Record<PracticeGrade, string> = {
  acertei: "demonstração sólida — espaça no tempo",
  quase: "quase lá — volta amanhã",
  errei: "precisa refazer — entra no modo erros",
};

/** Corpo de nota gerado ao salvar uma demonstração escrita no treino. */
export function proofNoteBody(item: PracticeItem, proof: string, grade: PracticeGrade): string {
  // examBank usa subId === trackId (não há aula para linkar).
  const fonte = item.subId !== item.trackId ? `\n\nFonte: [[sub:${item.subId}|${item.subTitle}]]` : "";
  return `> [!demonstracao] Quero provar
> ${item.prompt.replace(/\n/g, "\n> ")}

**Minha demonstração:**

${proof.trim() || "_ainda em branco_"}

> [!atencao] Auto-avaliação
> ${GRADE_MEANING[grade]}${fonte}

#demonstracao #${item.trackId}`;
}
