import { flatSubtopics } from "./curriculum";

// ---- Busca em memoria no curriculo (client + server safe, sem estado) ----

export interface SearchHit {
  subId: string;
  trackId: string;
  title: string;
  trackTitle: string;
  tagline?: string;
  /** Rotulo humano de onde bateu, ex.: "Titulo", "Conceito: Limite", "Teorema: TVI". */
  matchedIn: string;
  score: number;
}

export interface TermHit {
  term: string;
  kind: "Conceito" | "Teorema";
  subId: string;
  trackId: string;
  subTitle: string;
  trackTitle: string;
}

/** Normaliza removendo acentos e caixa para casar "funcao" com "função". */
export function normalize(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

interface Field {
  text: string; // normalizado
  raw: string;
  weight: number;
  label: string;
}

interface Entry {
  subId: string;
  trackId: string;
  title: string;
  trackTitle: string;
  tagline?: string;
  fields: Field[];
  terms: TermHit[];
}

const W_TITLE = 100;
const W_CONCEPT = 55;
const W_THEOREM = 55;
const W_TRACK = 40;
const W_TAGLINE = 30;
const W_OBJECTIVE = 18;

// Índice construído sob demanda (o currículo carrega em runtime); o guard por
// flatSubtopics.length reconstrói quando o conteúdo chega.
let entries: Entry[] = [];
let builtFor = -1;

function ensureIndex() {
  if (builtFor === flatSubtopics.length) return;
  builtFor = flatSubtopics.length;
  entries = flatSubtopics.map(({ track, sub }) => {
    const fields: Field[] = [];
    const push = (raw: string | undefined, weight: number, label: string) => {
      if (raw && raw.trim()) fields.push({ text: normalize(raw), raw, weight, label });
    };
    push(sub.title, W_TITLE, "Titulo");
    push(sub.tagline, W_TAGLINE, "Descricao");
    push(track.title, W_TRACK, "Trilha");
    (sub.objectives ?? []).forEach((o) => push(o, W_OBJECTIVE, "Objetivo"));

    const terms: TermHit[] = [];
    (sub.keyConcepts ?? []).forEach((k) => {
      push(k.term, W_CONCEPT, `Conceito: ${k.term}`);
      terms.push({
        term: k.term,
        kind: "Conceito",
        subId: sub.id,
        trackId: track.id,
        subTitle: sub.title,
        trackTitle: track.title,
      });
    });
    (sub.theorems ?? []).forEach((t) => {
      push(t.name, W_THEOREM, `Teorema: ${t.name}`);
      terms.push({
        term: t.name,
        kind: "Teorema",
        subId: sub.id,
        trackId: track.id,
        subTitle: sub.title,
        trackTitle: track.title,
      });
    });

    return {
      subId: sub.id,
      trackId: track.id,
      title: sub.title,
      trackTitle: track.title,
      tagline: sub.tagline,
      fields,
      terms,
    };
  });
}

function fieldScore(field: Field, nq: string, tokens: string[]): number {
  const t = field.text;
  let s = 0;
  if (t === nq) s = field.weight * 2; // match exato
  else if (t.startsWith(nq)) s = field.weight * 1.5; // prefixo
  else if (t.includes(nq)) s = field.weight; // frase inteira contida
  else if (tokens.length > 1 && tokens.every((tk) => t.includes(tk)))
    s = field.weight * 0.7; // todos os tokens presentes
  else return 0;
  return s;
}

/** Busca subtopicos rankeados por relevancia. Retorna [] para query vazia. */
export function searchSubtopics(q: string, limit = 24): SearchHit[] {
  ensureIndex();
  const nq = normalize(q);
  if (!nq) return [];
  const tokens = nq.split(/\s+/).filter(Boolean);

  const hits: SearchHit[] = [];
  for (const e of entries) {
    let best = 0;
    let bestLabel = "";
    let sum = 0;
    for (const f of e.fields) {
      const s = fieldScore(f, nq, tokens);
      if (s <= 0) continue;
      sum += s;
      if (s > best) {
        best = s;
        bestLabel = f.label;
      }
    }
    if (best <= 0) continue;
    // pontuacao final: melhor campo domina, campos extras dao pequeno empurrao
    hits.push({
      subId: e.subId,
      trackId: e.trackId,
      title: e.title,
      trackTitle: e.trackTitle,
      tagline: e.tagline,
      matchedIn: bestLabel,
      score: best + (sum - best) * 0.05,
    });
  }
  hits.sort((a, b) => b.score - a.score || a.title.localeCompare(b.title));
  return hits.slice(0, limit);
}

/** Onde um termo (conceito/teorema) aparece — para o bloco de contexto do palette. */
export function searchTerms(q: string, limit = 8): TermHit[] {
  ensureIndex();
  const nq = normalize(q);
  if (!nq) return [];
  const tokens = nq.split(/\s+/).filter(Boolean);
  const out: { hit: TermHit; score: number }[] = [];
  for (const e of entries) {
    for (const t of e.terms) {
      const nt = normalize(t.term);
      let s = 0;
      if (nt === nq) s = 3;
      else if (nt.startsWith(nq)) s = 2;
      else if (nt.includes(nq)) s = 1;
      else if (tokens.length > 1 && tokens.every((tk) => nt.includes(tk))) s = 0.7;
      if (s > 0) out.push({ hit: t, score: s });
    }
  }
  out.sort((a, b) => b.score - a.score || a.hit.term.localeCompare(b.hit.term));
  return out.slice(0, limit).map((o) => o.hit);
}
