// Zettel pós-aula: ao concluir um subtópico, o app oferece transformar os
// apontamentos ("o principal" + notas livres) numa nota permanente do sistema
// Obsidian — com wikilink de volta pra aula. Funções puras.

import type { Note, Subtopic, Track } from "./types";

/** Já existe um zettel desta aula? (nota viva vinculada ao subtopicId com tag zettel) */
export function findZettel(notes: Note[], subId: string): Note | undefined {
  return notes.find((n) => !n.deleted && n.subtopicId === subId && (n.tags ?? []).includes("zettel"));
}

export function zettelTitle(sub: Subtopic): string {
  return sub.title;
}

export function zettelBody(sub: Subtopic, track: Track, keyPoints: string, freeNotes: string): string {
  const kp = keyPoints.trim();
  const fn = freeNotes.trim();
  const firstLine = kp.split("\n").find((l) => l.trim()) ?? "";
  return `> [!resumo] Em uma frase
> ${firstLine || "…qual é a ideia central desta aula?"}

**O principal (minhas palavras):**

${kp || "_anote com suas palavras — é o que fixa_"}
${fn ? `\n**Notas livres:**\n\n${fn}\n` : ""}
**Conceitos para ligar:** [[ ]]

**Perguntas em aberto:** $\\;$

Fonte: [[sub:${sub.id}|${sub.title}]]

#zettel #${track.id}`;
}
