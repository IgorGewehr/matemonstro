// Currículo com carregamento em runtime: o conteúdo (~MBs) NÃO entra no bundle
// JS — é buscado de /curriculum-data.json (gerado por scripts/bundle-curriculum.mjs)
// e cacheado no IndexedDB (store `content`), então após a primeira visita o app
// abre instantâneo e funciona offline.
//
// Contrato: os exports abaixo são *live bindings* (`export let`) — quem importa
// `tracks`/`index`/`flatSubtopics` e lê EM TEMPO DE CHAMADA vê os dados após o
// load. Nenhum módulo deve derivar índices no top-level; derive sob demanda
// guardando por `flatSubtopics.length` (ver lib/search.ts). Componentes fora do
// AppState (que já espera o load) usam useCurriculumReady() para re-renderizar.

import meta from "./curriculum-meta.json";
import type { Curriculum, Track, Subtopic, Phase, CurriculumIndex } from "./types";
import { contentGet, contentPut } from "./store";

export const curriculumVersion: string =
  (meta as { generatedAt?: string }).generatedAt ?? "dev";

const EMPTY_INDEX: CurriculumIndex = {
  phases: [],
  recommendedOrder: [],
  prelimMap: { analise: [], algebra: [], topologiaGeometria: [] },
  ifConcursoCore: [],
  milestones: [],
  notes: "",
  totalHours: 0,
};

export let curriculum: Curriculum = { tracks: [], index: EMPTY_INDEX };
export let tracks: Track[] = [];
export let index: CurriculumIndex = EMPTY_INDEX;
export let isReady = false;
export let loadError: string | null = null;

export interface SubRef {
  track: Track;
  sub: Subtopic;
  globalIndex: number;
}

export let flatSubtopics: SubRef[] = [];

let trackById = new Map<string, Track>();
let subIndex = new Map<string, SubRef>();
let orderedTrackIds: string[] = [];

// ---- Assinatura (useSyncExternalStore em lib/useCurriculum.ts) ----
const listeners = new Set<() => void>();
export function subscribeCurriculum(cb: () => void): () => void {
  listeners.add(cb);
  return () => listeners.delete(cb);
}
export function curriculumSnapshot(): boolean {
  return isReady;
}

function applyCurriculum(data: Curriculum) {
  curriculum = data;
  tracks = data.tracks ?? [];
  index = data.index ?? EMPTY_INDEX;
  trackById = new Map(tracks.map((t) => [t.id, t]));

  orderedTrackIds =
    index?.recommendedOrder && index.recommendedOrder.length
      ? index.recommendedOrder
      : tracks.map((t) => t.id);

  const flat: SubRef[] = [];
  let gi = 0;
  for (const tid of orderedTrackIds) {
    const t = trackById.get(tid);
    if (!t) continue;
    for (const sub of t.subtopics) flat.push({ track: t, sub, globalIndex: gi++ });
  }
  // inclui trilhas que por acaso nao estejam na ordem recomendada
  for (const t of tracks) {
    if (!orderedTrackIds.includes(t.id)) {
      for (const sub of t.subtopics) flat.push({ track: t, sub, globalIndex: gi++ });
    }
  }
  flatSubtopics = flat;
  subIndex = new Map(flat.map((r) => [r.sub.id, r]));

  isReady = tracks.length > 0;
  loadError = null;
  for (const cb of [...listeners]) cb();
}

interface CachedBundle {
  version?: string;
  data?: Curriculum;
}

let loadPromise: Promise<boolean> | null = null;

/**
 * Carrega o currículo (idempotente): 1) cache do IndexedDB se a versão bate;
 * 2) fetch de /curriculum-data.json (e grava no cache); 3) fallback para cache
 * de versão antiga (offline logo após um deploy). Resolve true se carregou.
 */
export function loadCurriculum(): Promise<boolean> {
  if (typeof window === "undefined") return Promise.resolve(false);
  if (!loadPromise) loadPromise = doLoad();
  return loadPromise;
}

async function doLoad(): Promise<boolean> {
  try {
    const cached = await contentGet<CachedBundle>("bundle");
    if (cached?.version === curriculumVersion && cached.data?.tracks?.length) {
      applyCurriculum(cached.data);
      return true;
    }
  } catch {
    // cache indisponível — segue para o fetch
  }

  try {
    const res = await fetch(`/curriculum-data.json?v=${encodeURIComponent(curriculumVersion)}`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = (await res.json()) as Curriculum;
    if (!data?.tracks?.length) throw new Error("bundle vazio");
    applyCurriculum(data);
    contentPut("bundle", { version: curriculumVersion, data }).catch(() => {});
    return true;
  } catch (e) {
    // offline logo após um deploy: melhor conteúdo antigo do que nenhum
    try {
      const stale = await contentGet<CachedBundle>("bundle");
      if (stale?.data?.tracks?.length) {
        applyCurriculum(stale.data);
        return true;
      }
    } catch {
      // sem cache utilizável
    }
    loadError = e instanceof Error ? e.message : String(e);
    for (const cb of [...listeners]) cb();
    return false;
  }
}

// ---- Consultas (leem o estado atual; vazias antes do load) ----

export function getTrack(id: string): Track | undefined {
  return trackById.get(id);
}

export function getSubRef(subId: string): SubRef | undefined {
  return subIndex.get(subId);
}

export function totalSubtopics(): number {
  return flatSubtopics.length;
}

export function tracksByPhase(): { phase: Phase; tracks: Track[] }[] {
  if (!index?.phases?.length) {
    // fallback: agrupa pelo campo phase
    const groups = new Map<number, Track[]>();
    for (const t of tracks) {
      const arr = groups.get(t.phase) ?? [];
      arr.push(t);
      groups.set(t.phase, arr);
    }
    return [...groups.entries()]
      .sort((a, b) => a[0] - b[0])
      .map(([id, ts]) => ({
        phase: { id, label: ts[0]?.phaseLabel ?? `Fase ${id}`, goal: "", trackIds: ts.map((t) => t.id) },
        tracks: ts,
      }));
  }
  return index.phases.map((phase) => ({
    phase,
    tracks: phase.trackIds.map((id) => trackById.get(id)).filter(Boolean) as Track[],
  }));
}

export function trackPosition(trackId: string): number {
  return orderedTrackIds.indexOf(trackId);
}
