// Nucleo puro (sem I/O) das notas estilo Obsidian: wikilinks [[titulo]], #tags no
// corpo, backlinks e busca full-text simples (titulo+corpo). Usado pelo
// NotesProvider e pelos componentes de UI de notas (specs 07/08/09).

import type { Note } from "./types";

// ---- Wikilinks: [[Titulo]] ou [[Titulo|Rotulo]] (case-insensitive, casamento por titulo) ----

const WIKILINK_RE = /\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g;

export interface WikilinkMatch {
  title: string; // titulo alvo (texto entre colchetes, antes do "|")
  alias?: string; // rotulo alternativo (apos "|"), se houver
}

/** Extrai os titulos referenciados via [[titulo]] no corpo (na ordem em que aparecem). */
export function parseWikilinks(body: string): string[] {
  return parseWikilinkMatches(body).map((m) => m.title);
}

/** Igual a `parseWikilinks`, mas preservando o rotulo alternativo ([[titulo|rotulo]]). */
export function parseWikilinkMatches(body: string): WikilinkMatch[] {
  const out: WikilinkMatch[] = [];
  const re = new RegExp(WIKILINK_RE);
  let m: RegExpExecArray | null;
  while ((m = re.exec(body ?? ""))) {
    const title = m[1].trim();
    if (!title) continue;
    out.push({ title, alias: m[2]?.trim() || undefined });
  }
  return out;
}

/** Resolve um titulo de wikilink para a nota correspondente (case-insensitive, ignora deletadas). */
export function findNoteByTitle(title: string, notes: Note[]): Note | undefined {
  const norm = title.trim().toLowerCase();
  if (!norm) return undefined;
  return notes.find((n) => !n.deleted && (n.title ?? "").trim().toLowerCase() === norm);
}

export interface ResolvedLink extends WikilinkMatch {
  target?: Note;
}

/** Todos os links (resolvidos ou nao) que partem de uma nota. */
export function linksFrom(note: Note, notes: Note[]): ResolvedLink[] {
  return parseWikilinkMatches(note.body ?? "").map((link) => ({
    ...link,
    target: findNoteByTitle(link.title, notes),
  }));
}

// ---- Tags: #palavra dentro do corpo ----

const TAG_RE = /(^|\s)#([\p{L}\p{N}_-]+)/gu;

/** Extrai as #tags citadas no corpo (minusculas, sem duplicatas, sem o "#"). */
export function extractTags(body: string): string[] {
  const found = new Set<string>();
  const re = new RegExp(TAG_RE);
  let m: RegExpExecArray | null;
  while ((m = re.exec(body ?? ""))) {
    found.add(m[2].toLowerCase());
  }
  return [...found];
}

/** Todas as tags de uma nota: campo `tags` + #tags citadas no corpo (minusculas, sem duplicatas). */
export function allTagsOf(note: Note): string[] {
  const found = new Set<string>();
  for (const t of note.tags ?? []) {
    const norm = t.trim().toLowerCase();
    if (norm) found.add(norm);
  }
  for (const t of extractTags(note.body ?? "")) found.add(t);
  return [...found];
}

// ---- Backlinks ----

/** Mapa noteId -> notas (nao deletadas) que linkam para ela via [[titulo]]. */
export function computeBacklinks(notes: Note[]): Map<string, Note[]> {
  const map = new Map<string, Note[]>();
  const alive = notes.filter((n) => !n.deleted);
  for (const note of alive) {
    for (const title of parseWikilinks(note.body ?? "")) {
      const target = findNoteByTitle(title, alive);
      if (!target || target.id === note.id) continue;
      const list = map.get(target.id) ?? [];
      if (!list.some((n) => n.id === note.id)) list.push(note);
      map.set(target.id, list);
    }
  }
  return map;
}

/** Notas (nao deletadas) que apontam, via [[titulo]], para `note`. */
export function getBacklinks(note: Note, notes: Note[]): Note[] {
  return computeBacklinks(notes).get(note.id) ?? [];
}

/** Resolutor extra de wikilinks (ex.: subtopicos do curriculo): devolve um href ou null. */
export type WikilinkResolver = (title: string) => { href: string; label?: string } | null;

/**
 * Reescreve [[titulo]] / [[titulo|rotulo]] do corpo em markdown, para renderizar
 * com <Markdown>. Resolucao em cascata: nota com esse titulo -> `resolveExtra`
 * (ex.: aula do curriculo) -> italico (link quebrado, sem destino).
 */
export function renderWikilinksToMarkdown(
  body: string,
  notes: Note[],
  resolveExtra?: WikilinkResolver
): string {
  return (body ?? "").replace(WIKILINK_RE, (whole: string, rawTitle: string, alias?: string) => {
    const title = String(rawTitle).trim();
    if (!title) return whole; // [[ ]] placeholder de template: mantém literal
    const label = alias?.trim() || title;
    const target = findNoteByTitle(title, notes);
    if (target) return `[${label}](/notas/${target.id})`;
    const extra = resolveExtra?.(title);
    if (extra) return `[${alias?.trim() || extra.label || title}](${extra.href})`;
    return `*${label}*`;
  });
}

// ---- Busca full-text simples (titulo + corpo) ----

/** Busca simples por termos (case-insensitive) em titulo (peso maior) e corpo; devolve notas ordenadas por relevancia. */
export function searchNotes(notes: Note[], query: string): Note[] {
  const alive = notes.filter((n) => !n.deleted);
  const q = query.trim().toLowerCase();
  if (!q) return alive.slice().sort((a, b) => b.updatedAt - a.updatedAt);

  const terms = q.split(/\s+/).filter(Boolean);
  const scored: { note: Note; score: number }[] = [];
  for (const note of alive) {
    const title = (note.title ?? "").toLowerCase();
    const body = (note.body ?? "").toLowerCase();
    let score = 0;
    for (const term of terms) {
      if (title === term) score += 5;
      if (title.includes(term)) score += 3;
      if (body.includes(term)) score += 1;
      // tags do campo + #tags do corpo (permite buscar "#analise" ou "analise")
      const tagTerm = term.startsWith("#") ? term.slice(1) : term;
      if (allTagsOf(note).includes(tagTerm)) score += 2;
    }
    if (score > 0) scored.push({ note, score });
  }
  scored.sort((a, b) => b.score - a.score || b.note.updatedAt - a.note.updatedAt);
  return scored.map((s) => s.note);
}
