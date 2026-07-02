// Ponte entre as notas (estilo Obsidian) e o curriculo: permite que um
// [[wikilink]] aponte para uma aula (subtopico) do curriculo, alem de outras
// notas. Resolucao por titulo (sem acento/caixa) ou pelo id explicito
// "sub:<subId>" (estavel mesmo se o titulo da aula mudar).

import { flatSubtopics, type SubRef } from "./curriculum";
import type { Note } from "./types";
import { renderWikilinksToMarkdown } from "./notes";

function normalize(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase();
}

// Índices construídos sob demanda (o currículo carrega em runtime); o guard
// por flatSubtopics.length reconstrói quando o conteúdo chega.
let byTitle = new Map<string, SubRef>();
let byId = new Map<string, SubRef>();
let builtFor = -1;

function ensureIndex() {
  if (builtFor === flatSubtopics.length) return;
  builtFor = flatSubtopics.length;
  byTitle = new Map();
  byId = new Map();
  for (const ref of flatSubtopics) {
    byId.set(ref.sub.id, ref);
    const key = normalize(ref.sub.title);
    if (key && !byTitle.has(key)) byTitle.set(key, ref);
  }
}

/** Resolve um titulo de wikilink para uma aula do curriculo ("sub:<id>" ou titulo exato). */
export function findSubRefByWikilink(title: string): SubRef | undefined {
  ensureIndex();
  const raw = title.trim();
  if (raw.toLowerCase().startsWith("sub:")) return byId.get(raw.slice(4).trim());
  return byTitle.get(normalize(raw));
}

export function subHref(ref: SubRef): string {
  return `/estudar/${ref.track.id}/${ref.sub.id}`;
}

/** Resolutor extra para renderWikilinksToMarkdown: [[Titulo da aula]] -> link de estudo. */
export function resolveCurriculumLink(title: string): { href: string; label?: string } | null {
  const ref = findSubRefByWikilink(title);
  return ref ? { href: subHref(ref), label: ref.sub.title } : null;
}

/**
 * Renderiza o corpo de uma nota em markdown resolvendo wikilinks em cascata:
 * outra nota -> aula do curriculo -> italico (quebrado). Use este wrapper em
 * toda UI de notas para manter o comportamento uniforme.
 */
export function renderNoteMarkdown(body: string, notes: Note[]): string {
  return renderWikilinksToMarkdown(body, notes, resolveCurriculumLink);
}

export interface CurriculumLinkCandidate {
  subId: string;
  title: string;
  trackTitle: string;
  href: string;
}

/** Candidatos do curriculo para o autocomplete de [[wikilinks]] no editor. */
export function curriculumLinkCandidates(query: string, limit = 5): CurriculumLinkCandidate[] {
  const q = normalize(query);
  if (!q) return [];
  const out: CurriculumLinkCandidate[] = [];
  for (const ref of flatSubtopics) {
    if (normalize(ref.sub.title).includes(q)) {
      out.push({
        subId: ref.sub.id,
        title: ref.sub.title,
        trackTitle: ref.track.title,
        href: subHref(ref),
      });
      if (out.length >= limit) break;
    }
  }
  return out;
}

/** Aulas do curriculo referenciadas por uma nota (via subtopicId ou [[wikilinks]]). */
export function curriculumRefsOf(note: Note): SubRef[] {
  const seen = new Set<string>();
  const out: SubRef[] = [];
  const push = (ref: SubRef | undefined) => {
    if (ref && !seen.has(ref.sub.id)) {
      seen.add(ref.sub.id);
      out.push(ref);
    }
  };
  ensureIndex();
  if (note.subtopicId) push(byId.get(note.subtopicId));
  const re = /\[\[([^\]|]+)(?:\|[^\]]+)?\]\]/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(note.body ?? ""))) push(findSubRefByWikilink(m[1]));
  return out;
}
