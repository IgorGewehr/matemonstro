// Nucleo puro (sem I/O) das notas estilo Obsidian: wikilinks [[titulo]], #tags no
// corpo, backlinks e busca full-text simples (titulo+corpo). Usado pelo
// NotesProvider e pelos componentes de UI de notas (specs 07/08/09).

import type { Note } from "./types";

// ---- Rota canonica de uma nota ----
// /notas/[id] virou /notas/nota?id= (ids de runtime nao pre-renderizam no
// export estatico do desktop). TODO link para nota passa por aqui.
export function noteHref(id: string): string {
  return `/notas/nota?id=${encodeURIComponent(id)}`;
}

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
    if (target) return `[${label}](${noteHref(target.id)})`;
    const extra = resolveExtra?.(title);
    if (extra) return `[${alias?.trim() || extra.label || title}](${extra.href})`;
    return `*${label}*`;
  });
}

// ---- Pastas (estilo Obsidian) ----

const MAX_FOLDER_DEPTH = 4;

/**
 * Normaliza um caminho de pasta: trim, remove "/" nas pontas, colapsa "//",
 * proibe segmentos "." e "..", proibe prefixo ".trash"/".matemonstro"
 * (reservados pelo app) e limita a 4 niveis. Retorna null para vazio/invalido
 * (raiz do vault).
 */
export function normalizeFolder(input: string | null | undefined): string | null {
  if (!input) return null;
  const collapsed = input.trim().replace(/\/+/g, "/").replace(/^\/+|\/+$/g, "");
  if (!collapsed) return null;
  const segments = collapsed
    .split("/")
    .map((s) => s.trim())
    .filter(Boolean);
  if (segments.length === 0 || segments.length > MAX_FOLDER_DEPTH) return null;
  if (segments.some((s) => s === "." || s === "..")) return null;
  const first = segments[0].toLowerCase();
  if (first === ".trash" || first === ".matemonstro") return null;
  return segments.join("/");
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

// ---- Links sugeridos: titulos de outras notas citados no corpo, ainda sem [[...]] ----

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Faixas [inicio, fim) ja ocupadas por [[titulo]] no corpo (para nao sugerir o que ja esta ligado). */
function wikilinkRanges(body: string): Array<[number, number]> {
  const ranges: Array<[number, number]> = [];
  const re = new RegExp(WIKILINK_RE);
  let m: RegExpExecArray | null;
  while ((m = re.exec(body))) {
    ranges.push([m.index, m.index + m[0].length]);
  }
  return ranges;
}

export interface LinkSuggestion {
  noteId: string;
  title: string;
  /** Posicao (no corpo) da primeira ocorrencia do titulo fora de um [[...]] existente. */
  index: number;
}

/**
 * Sugere ate 5 notas para ligar: titulos de OUTRAS notas (>=3 caracteres) que
 * aparecem como palavra/frase inteira no corpo de `note`, mas que ainda nao
 * estao dentro de um [[...]]. Usado pelo editor para oferecer "Ligar: [Titulo]"
 * sem depender do usuario digitar [[ ]] manualmente. Custo O(notas x corpo),
 * aceitavel ate ~1000 notas.
 */
export function suggestLinks(note: Note, notes: Note[]): LinkSuggestion[] {
  const body = note.body ?? "";
  if (!body.trim()) return [];
  const ranges = wikilinkRanges(body);
  const inRange = (idx: number) => ranges.some(([s, e]) => idx >= s && idx < e);

  const out: LinkSuggestion[] = [];
  const seenTitles = new Set<string>();
  for (const cand of notes) {
    if (cand.deleted || cand.id === note.id) continue;
    const title = (cand.title ?? "").trim();
    const key = title.toLowerCase();
    if (title.length < 3 || seenTitles.has(key)) continue;

    let re: RegExp;
    try {
      re = new RegExp(`(?<![\\p{L}\\p{N}_])${escapeRegExp(title)}(?![\\p{L}\\p{N}_])`, "giu");
    } catch {
      continue; // ambiente sem suporte a lookbehind unicode: ignora este candidato
    }

    let found: RegExpExecArray | null;
    let hit: RegExpExecArray | null = null;
    while ((found = re.exec(body))) {
      if (!inRange(found.index)) {
        hit = found;
        break;
      }
      if (found[0].length === 0) re.lastIndex += 1;
    }
    if (hit) {
      out.push({ noteId: cand.id, title, index: hit.index });
      seenTitles.add(key);
    }
  }
  out.sort((a, b) => a.index - b.index);
  return out.slice(0, 5);
}
