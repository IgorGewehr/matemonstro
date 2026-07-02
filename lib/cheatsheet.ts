// Agregador puro para a "Cola de revisão" (cheat-sheet) de uma trilha.
// Reúne, numa folha só, o conteúdo que hoje fica espalhado por subtópico:
// glossário (keyConcepts + curadoria opcional), teoremas e flashcards.
// 100% derivado dos dados existentes — sem acesso a DOM/IndexedDB.

import type { Track } from "@/lib/types";

export interface GlossaryEntry {
  term: string;
  def: string;
  subId?: string;
  subTitle?: string;
  curated?: boolean;
}

export interface CheatTheorem {
  name: string;
  statement: string;
  whyItMatters?: string;
  subId: string;
  subTitle: string;
}

export interface CheatFlashcard {
  front: string;
  back: string;
  subId: string;
  subTitle: string;
}

export interface CheatSheet {
  trackId: string;
  trackTitle: string;
  formulaSheet?: string;
  glossary: GlossaryEntry[]; // ordenado alfabeticamente
  letters: string[]; // iniciais únicas presentes, para o índice alfabético
  theorems: CheatTheorem[];
  flashcards: CheatFlashcard[];
  counts: { concepts: number; theorems: number; flashcards: number };
}

// Normaliza para comparação/ordenação: sem acento, minúsculo, sem espaços extra.
function norm(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .trim()
    .toLowerCase();
}

// Inicial para o índice alfabético (letra sem acento em maiúsculo; símbolos/números → "#").
export function indexLetter(term: string): string {
  const c = norm(term).charAt(0).toUpperCase();
  return /[A-Z]/.test(c) ? c : "#";
}

export function buildCheatSheet(track: Track): CheatSheet {
  const glossaryMap = new Map<string, GlossaryEntry>();

  const addEntry = (e: GlossaryEntry) => {
    const term = e.term?.trim();
    const def = e.def?.trim();
    if (!term || !def) return;
    const key = norm(term);
    // primeira ocorrência vence (curadoria entra primeiro e tem prioridade)
    if (!glossaryMap.has(key)) glossaryMap.set(key, { ...e, term, def });
  };

  // Curadoria opcional da trilha primeiro, para ter prioridade em conflitos de termo.
  for (const g of track.glossary ?? []) {
    addEntry({ term: g.term, def: g.def, curated: true });
  }

  const theorems: CheatTheorem[] = [];
  const flashcards: CheatFlashcard[] = [];

  for (const sub of track.subtopics ?? []) {
    for (const k of sub.keyConcepts ?? []) {
      addEntry({ term: k.term, def: k.statement, subId: sub.id, subTitle: sub.title });
    }
    for (const t of sub.theorems ?? []) {
      if (!t.name?.trim() || !t.statement?.trim()) continue;
      theorems.push({
        name: t.name.trim(),
        statement: t.statement.trim(),
        whyItMatters: t.whyItMatters?.trim() || undefined,
        subId: sub.id,
        subTitle: sub.title,
      });
    }
    for (const f of sub.flashcards ?? []) {
      if (!f.front?.trim() || !f.back?.trim()) continue;
      flashcards.push({
        front: f.front.trim(),
        back: f.back.trim(),
        subId: sub.id,
        subTitle: sub.title,
      });
    }
  }

  const glossary = [...glossaryMap.values()].sort((a, b) =>
    norm(a.term).localeCompare(norm(b.term), "pt")
  );

  const letters = [...new Set(glossary.map((g) => indexLetter(g.term)))];

  return {
    trackId: track.id,
    trackTitle: track.title,
    formulaSheet: track.formulaSheet?.trim() || undefined,
    glossary,
    letters,
    theorems,
    flashcards,
    counts: {
      concepts: glossary.length,
      theorems: theorems.length,
      flashcards: flashcards.length,
    },
  };
}
