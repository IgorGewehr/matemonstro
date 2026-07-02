// Builder compartilhado de PracticeItem a partir do currículo (exercícios de
// subtópico + examBank de trilha). Usado por /praticar, /provas e /simulado —
// uma única fonte de verdade para exKey/metadata dos itens praticáveis.

import { tracks, index } from "./curriculum";
import { exerciseKey, type PracticeItem } from "./practice";

// Guard por tracks.length: o currículo carrega em runtime, então o cache é
// reconstruído quando o conteúdo chega (e nunca congela uma lista vazia).
let cache: PracticeItem[] | null = null;
let cacheFor = -1;

export function buildAllPracticeItems(): PracticeItem[] {
  if (cache && cacheFor === tracks.length) return cache;
  cacheFor = tracks.length;
  const ifSet = new Set(index?.ifConcursoCore ?? []);
  const mestradoSet = new Set(Object.values(index?.prelimMap ?? {}).flat() as string[]);
  const out: PracticeItem[] = [];
  for (const t of tracks) {
    const exams: ("if" | "mestrado")[] = [];
    if (ifSet.has(t.id)) exams.push("if");
    if (mestradoSet.has(t.id)) exams.push("mestrado");
    for (const sub of t.subtopics) {
      (sub.exercises ?? []).forEach((e, i) => {
        out.push({
          exKey: exerciseKey(sub.id, i),
          subId: sub.id,
          trackId: t.id,
          trackTitle: t.title,
          subTitle: sub.title,
          prompt: e.prompt,
          hint: e.hint,
          solution: e.solution,
          steps: e.steps,
          difficulty: e.difficulty,
          source: e.source,
          tags: e.tags,
          exams,
        });
      });
    }
    (t.examBank ?? []).forEach((q, i) => {
      out.push({
        exKey: `${t.id}::bank::${i}`,
        subId: t.id,
        trackId: t.id,
        trackTitle: t.title,
        subTitle: "Banco de provas",
        prompt: q.prompt,
        solution: q.solution,
        difficulty: q.difficulty ?? 3,
        source: q.source,
        exams,
      });
    });
  }
  cache = out;
  return out;
}
