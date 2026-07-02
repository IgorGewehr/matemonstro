// Biblioteca de resultados: índice plano de TODAS as definições (keyConcepts) e
// teoremas do currículo, para consulta instantânea tipo "dicionário de
// matemática pessoal". Puro (sem DOM) — a página /biblioteca consome.

import { flatSubtopics } from "./curriculum";

export type LibraryKind = "definicao" | "teorema";

export interface LibraryEntry {
  kind: LibraryKind;
  name: string; // termo (definição) ou nome do teorema
  statement: string; // enunciado (markdown + LaTeX)
  why?: string; // "por que importa" (teoremas)
  subId: string;
  subTitle: string;
  trackId: string;
  trackTitle: string;
  phase: number;
  norm: string; // nome normalizado (busca)
  normBody: string; // enunciado normalizado (busca)
}

function normalize(s: string): string {
  return (s || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

// Índice construído sob demanda (o currículo carrega em runtime); o guard por
// flatSubtopics.length reconstrói quando o conteúdo chega.
let entries: LibraryEntry[] = [];
let builtFor = -1;

export function getLibraryEntries(): LibraryEntry[] {
  if (builtFor === flatSubtopics.length) return entries;
  builtFor = flatSubtopics.length;
  const out: LibraryEntry[] = [];
  for (const ref of flatSubtopics) {
    const base = {
      subId: ref.sub.id,
      subTitle: ref.sub.title,
      trackId: ref.track.id,
      trackTitle: ref.track.title,
      phase: ref.track.phase,
    };
    for (const c of ref.sub.keyConcepts ?? []) {
      if (!c?.term) continue;
      out.push({
        kind: "definicao",
        name: c.term,
        statement: c.statement ?? "",
        ...base,
        norm: normalize(c.term),
        normBody: normalize(c.statement ?? ""),
      });
    }
    for (const t of ref.sub.theorems ?? []) {
      if (!t?.name) continue;
      out.push({
        kind: "teorema",
        name: t.name,
        statement: t.statement ?? "",
        why: t.whyItMatters || undefined,
        ...base,
        norm: normalize(t.name),
        normBody: normalize(t.statement ?? ""),
      });
    }
  }
  entries = out;
  return entries;
}

export function getLibraryCounts(): { definicoes: number; teoremas: number } {
  const all = getLibraryEntries();
  return {
    definicoes: all.filter((e) => e.kind === "definicao").length,
    teoremas: all.filter((e) => e.kind === "teorema").length,
  };
}

export interface LibraryFilter {
  kind?: LibraryKind | null;
  trackId?: string | null;
}

/**
 * Busca na biblioteca: nome pesa mais que enunciado; todos os tokens precisam
 * aparecer em algum campo. Sem query, devolve tudo (filtrado) na ordem do
 * currículo — o chamador pagina.
 */
export function searchLibrary(query: string, filter: LibraryFilter = {}): LibraryEntry[] {
  let base = getLibraryEntries();
  if (filter.kind) base = base.filter((e) => e.kind === filter.kind);
  if (filter.trackId) base = base.filter((e) => e.trackId === filter.trackId);

  const q = normalize(query.trim());
  if (!q) return base;

  const tokens = q.split(/\s+/).filter(Boolean);
  const scored: { e: LibraryEntry; score: number }[] = [];
  for (const e of base) {
    let score = 0;
    let ok = true;
    for (const t of tokens) {
      const inName = e.norm.includes(t);
      const inBody = e.normBody.includes(t);
      if (!inName && !inBody) {
        ok = false;
        break;
      }
      score += inName ? (e.norm === t ? 10 : e.norm.startsWith(t) ? 6 : 4) : 1;
    }
    if (ok) scored.push({ e, score });
  }
  scored.sort((a, b) => b.score - a.score);
  return scored.map((s) => s.e);
}
