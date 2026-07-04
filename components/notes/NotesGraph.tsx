"use client";

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useNotes } from "./NotesProvider";
import { parseWikilinks, findNoteByTitle, noteHref, normalizeFolder } from "@/lib/notes";
import { findSubRefByWikilink, subHref } from "@/lib/notes-curriculum";
import { useCurriculumReady } from "@/lib/useCurriculum";
import type { Note } from "@/lib/types";

const MIN_ZOOM = 0.25;
const MAX_ZOOM = 4;
const FALLBACK_W = 900;
const FALLBACK_H = 620;

// ---- Física ----
const ALPHA_DECAY = 0.018;
const ALPHA_MIN = 0.001;
const ALPHA_DRAG_FLOOR = 0.35;
const FRICTION = 0.86;
const CHARGE = 900;
const GRAVITY = 0.012;
const REDUCED_SETTLE_ITERS = 260;
const REDUCED_DRAG_ITERS = 18;

type NodeKind = "nota" | "aula" | "pasta";
type EdgeKind = "link" | "membership";

interface GraphNode {
  id: string; // id da nota, "sub:<subId>" p/ aula, "folder:<path>" p/ pasta
  kind: NodeKind;
  label: string;
  href: string | null; // null para pasta (não navega — clique destaca subárvore)
  path?: string; // caminho da pasta (só kind "pasta")
  folder?: string | null; // pasta-mãe direta (só kind "nota")
}

interface GraphEdge {
  a: string;
  b: string;
  kind: EdgeKind;
}

interface Pos {
  x: number;
  y: number;
}

// Monta nós (notas + aulas citadas + pastas) e arestas (wikilinks + pertencimento
// nota→pasta / pasta→pasta-mãe) a partir do vault. Aulas do currículo só entram
// se alguma nota as cita.
function buildGraph(
  live: Note[],
  knownFolders: string[]
): { nodes: GraphNode[]; edges: GraphEdge[] } {
  const nodes: GraphNode[] = live.map((n) => ({
    id: n.id,
    kind: "nota",
    label: n.title || "Sem título",
    href: noteHref(n.id),
    folder: normalizeFolder(n.folder ?? null),
  }));
  const byId = new Map(nodes.map((n) => [n.id, n]));

  const lessonNode = (subId: string): GraphNode | null => {
    const key = `sub:${subId}`;
    const existing = byId.get(key);
    if (existing) return existing;
    const ref = findSubRefByWikilink(key);
    if (!ref) return null;
    const node: GraphNode = { id: key, kind: "aula", label: ref.sub.title, href: subHref(ref) };
    nodes.push(node);
    byId.set(key, node);
    return node;
  };

  // ---- pastas: união do bookkeeping (folders) + o que as notas referenciam ----
  const folderPaths = new Set<string>();
  for (const f of knownFolders) {
    const norm = normalizeFolder(f);
    if (norm) folderPaths.add(norm);
  }
  for (const n of nodes) {
    if (n.kind === "nota" && n.folder) folderPaths.add(n.folder);
  }
  // garante que toda cadeia de ancestrais exista (mesmo se vazia)
  for (const path of [...folderPaths]) {
    const segs = path.split("/");
    for (let i = 1; i < segs.length; i++) folderPaths.add(segs.slice(0, i).join("/"));
  }
  for (const path of folderPaths) {
    const segs = path.split("/");
    nodes.push({ id: `folder:${path}`, kind: "pasta", label: segs[segs.length - 1], href: null, path });
  }

  const seen = new Set<string>();
  const edges: GraphEdge[] = [];
  const pushEdge = (a: string, b: string, kind: EdgeKind) => {
    if (a === b) return;
    const key = a < b ? `${a}::${b}` : `${b}::${a}`;
    if (seen.has(key)) return;
    seen.add(key);
    edges.push({ a, b, kind });
  };

  // pertencimento: pasta → pasta-mãe
  for (const path of folderPaths) {
    const segs = path.split("/");
    if (segs.length > 1) {
      const parent = segs.slice(0, -1).join("/");
      pushEdge(`folder:${parent}`, `folder:${path}`, "membership");
    }
  }

  for (const n of live) {
    const from = n.id;
    for (const title of parseWikilinks(n.body || "")) {
      const targetNote = findNoteByTitle(title, live);
      if (targetNote) {
        pushEdge(from, targetNote.id, "link");
        continue;
      }
      const ref = findSubRefByWikilink(title);
      if (ref) {
        const li = lessonNode(ref.sub.id);
        if (li) pushEdge(from, li.id, "link");
      }
    }
    if (n.subtopicId) {
      const li = lessonNode(n.subtopicId);
      if (li) pushEdge(from, li.id, "link");
    }
    const folder = normalizeFolder(n.folder ?? null);
    if (folder) pushEdge(from, `folder:${folder}`, "membership");
  }

  return { nodes, edges };
}

interface ViewTransform {
  x: number;
  y: number;
  k: number;
}

// ---- Simulação force-directed (struct-of-arrays, sem dependências) ----
interface Sim {
  ids: string[];
  x: Float64Array;
  y: Float64Array;
  vx: Float64Array;
  vy: Float64Array;
  r: Float64Array;
  fixed: Uint8Array;
  index: Map<string, number>;
  edges: { i: number; j: number; len: number; k: number }[];
  alpha: number;
  running: boolean;
  dragging: boolean;
}

function edgeSpec(kind: EdgeKind): { len: number; k: number } {
  return kind === "membership" ? { len: 46, k: 0.09 } : { len: 82, k: 0.045 };
}

function radiusOf(node: GraphNode, degree: number): number {
  if (node.kind === "aula") return 11;
  if (node.kind === "pasta") return 12 + Math.min(7, degree * 0.7);
  return 8 + Math.min(10, degree * 1.5);
}

function tick(S: Sim, writeDom: boolean, els: Map<string, SVGGElement>, lines: Map<string, SVGLineElement>) {
  const n = S.ids.length;
  if (n === 0) return;
  const fx = new Float64Array(n);
  const fy = new Float64Array(n);
  const alpha = S.alpha;

  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      let dx = S.x[i] - S.x[j];
      let dy = S.y[i] - S.y[j];
      let d2 = dx * dx + dy * dy;
      if (d2 < 4) {
        dx = Math.random() - 0.5;
        dy = Math.random() - 0.5;
        d2 = dx * dx + dy * dy + 0.5;
      }
      const d = Math.sqrt(d2);
      const f = ((CHARGE + S.r[i] + S.r[j]) * alpha) / d2;
      const ux = dx / d;
      const uy = dy / d;
      fx[i] += ux * f;
      fy[i] += uy * f;
      fx[j] -= ux * f;
      fy[j] -= uy * f;
    }
  }

  for (const e of S.edges) {
    const dx = S.x[e.j] - S.x[e.i];
    const dy = S.y[e.j] - S.y[e.i];
    const d = Math.sqrt(dx * dx + dy * dy) || 0.001;
    const f = (d - e.len) * e.k * alpha;
    const ux = dx / d;
    const uy = dy / d;
    fx[e.i] += ux * f;
    fy[e.i] += uy * f;
    fx[e.j] -= ux * f;
    fy[e.j] -= uy * f;
  }

  for (let i = 0; i < n; i++) {
    fx[i] += -S.x[i] * GRAVITY * alpha;
    fy[i] += -S.y[i] * GRAVITY * alpha;
  }

  for (let i = 0; i < n; i++) {
    if (S.fixed[i]) {
      S.vx[i] = 0;
      S.vy[i] = 0;
      continue;
    }
    S.vx[i] = (S.vx[i] + fx[i]) * FRICTION;
    S.vy[i] = (S.vy[i] + fy[i]) * FRICTION;
    S.x[i] += S.vx[i];
    S.y[i] += S.vy[i];
  }

  S.alpha = S.dragging ? Math.max(S.alpha, ALPHA_DRAG_FLOOR) : S.alpha * (1 - ALPHA_DECAY);

  if (writeDom) {
    for (let i = 0; i < n; i++) {
      const el = els.get(S.ids[i]);
      if (el) el.setAttribute("transform", `translate(${S.x[i].toFixed(2)},${S.y[i].toFixed(2)})`);
    }
    for (const [key, line] of lines) {
      const [a, b] = key.split("::");
      const ia = S.index.get(a);
      const ib = S.index.get(b);
      if (ia === undefined || ib === undefined) continue;
      line.setAttribute("x1", S.x[ia].toFixed(2));
      line.setAttribute("y1", S.y[ia].toFixed(2));
      line.setAttribute("x2", S.x[ib].toFixed(2));
      line.setAttribute("y2", S.y[ib].toFixed(2));
    }
  }
}

export default function NotesGraph() {
  const router = useRouter();
  const { notes, folders, ready } = useNotes();
  const live = useMemo(() => notes.filter((n) => !n.deleted), [notes]);
  const curReady = useCurriculumReady();

  const { nodes: allNodes, edges: allEdges } = useMemo(
    () => buildGraph(live, folders),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [live, folders, curReady]
  );

  const linkDegree = useMemo(() => {
    const d = new Map<string, number>();
    for (const e of allEdges) {
      if (e.kind !== "link") continue;
      d.set(e.a, (d.get(e.a) ?? 0) + 1);
      d.set(e.b, (d.get(e.b) ?? 0) + 1);
    }
    return d;
  }, [allEdges]);

  const folderChildCount = useMemo(() => {
    const d = new Map<string, number>();
    for (const e of allEdges) {
      if (e.kind !== "membership") continue;
      d.set(e.a, (d.get(e.a) ?? 0) + 1);
    }
    return d;
  }, [allEdges]);

  // ---- filtros/toggles (não mexem na física, só no conjunto visível) ----
  const [showNotas, setShowNotas] = useState(true);
  const [showAulas, setShowAulas] = useState(true);
  const [showPastas, setShowPastas] = useState(true);
  const [showOrfas, setShowOrfas] = useState(true);
  const [query, setQuery] = useState("");
  const [hover, setHover] = useState<string | null>(null);
  const [folderFocus, setFolderFocus] = useState<string | null>(null);

  const visible = useMemo(() => {
    const ids = new Set<string>();
    for (const n of allNodes) {
      if (n.kind === "nota") {
        if (!showNotas) continue;
        const isOrphan = (linkDegree.get(n.id) ?? 0) === 0;
        if (isOrphan && !showOrfas) continue;
      } else if (n.kind === "aula") {
        if (!showAulas) continue;
      } else if (n.kind === "pasta") {
        if (!showPastas) continue;
      }
      ids.add(n.id);
    }
    const nodes = allNodes.filter((n) => ids.has(n.id));
    const edges = allEdges.filter((e) => ids.has(e.a) && ids.has(e.b));
    return { nodes, edges };
  }, [allNodes, allEdges, showNotas, showAulas, showPastas, showOrfas, linkDegree]);

  const adjacency = useMemo(() => {
    const adj = new Map<string, Set<string>>();
    for (const n of visible.nodes) adj.set(n.id, new Set());
    for (const e of visible.edges) {
      adj.get(e.a)?.add(e.b);
      adj.get(e.b)?.add(e.a);
    }
    return adj;
  }, [visible]);

  const subtreeOf = useMemo(() => {
    if (!folderFocus) return null;
    const focusNode = visible.nodes.find((n) => n.id === folderFocus);
    if (!focusNode?.path) return null;
    const prefix = focusNode.path;
    const ids = new Set<string>([folderFocus]);
    for (const n of visible.nodes) {
      if (n.kind === "pasta" && n.path && (n.path === prefix || n.path.startsWith(`${prefix}/`))) ids.add(n.id);
      if (n.kind === "nota" && n.folder && (n.folder === prefix || n.folder.startsWith(`${prefix}/`))) ids.add(n.id);
    }
    return ids;
  }, [folderFocus, visible]);

  const matched = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return null;
    const ids = new Set<string>();
    for (const n of visible.nodes) if (n.label.toLowerCase().includes(q)) ids.add(n.id);
    return ids.size > 0 ? ids : null;
  }, [query, visible.nodes]);

  // ---- reduced motion ----
  const [reducedMotion, setReducedMotion] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReducedMotion(mq.matches);
    const onChange = () => setReducedMotion(mq.matches);
    mq.addEventListener?.("change", onChange);
    return () => mq.removeEventListener?.("change", onChange);
  }, []);

  // ---- medição do container (altura/largura reais) ----
  const wrapRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ w: FALLBACK_W, h: FALLBACK_H });
  useEffect(() => {
    const el = wrapRef.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver((entries) => {
      const r = entries[0]?.contentRect;
      if (!r) return;
      setSize({ w: Math.max(200, Math.round(r.width)), h: Math.max(200, Math.round(r.height)) });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const svgRef = useRef<SVGSVGElement>(null);
  const [view, setView] = useState<ViewTransform | null>(null);
  useEffect(() => {
    if (view === null) setView({ x: size.w / 2, y: size.h / 2, k: 1 });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [size]);

  // ---- simulação: refs mutáveis (não disparam re-render por frame) ----
  const simRef = useRef<Sim>({
    ids: [],
    x: new Float64Array(0),
    y: new Float64Array(0),
    vx: new Float64Array(0),
    vy: new Float64Array(0),
    r: new Float64Array(0),
    fixed: new Uint8Array(0),
    index: new Map(),
    edges: [],
    alpha: 0,
    running: false,
    dragging: false,
  });
  const posCache = useRef<Map<string, Pos>>(new Map());
  const nodeEls = useRef<Map<string, SVGGElement>>(new Map());
  const lineEls = useRef<Map<string, SVGLineElement>>(new Map());
  const rafId = useRef(0);
  const didInitialFit = useRef(false);
  // setTimeout de auto-ajuste é agendado uma única vez mas pode disparar bem
  // depois: usa sempre a versão mais recente de fitToView (evita fechar sobre
  // um `view` ainda nulo do primeiro render).
  const fitToViewRef = useRef<(animate?: boolean) => void>(() => {});

  function wake(floor = 0.9) {
    const S = simRef.current;
    S.alpha = Math.max(S.alpha, floor);
    // prefers-reduced-motion: nunca agenda o loop visível — quem consome o
    // alpha reaquecido é settleSync (rodado em bloco, sem quadros intermediários).
    if (reducedMotion) return;
    if (!S.running) {
      S.running = true;
      loop();
    }
  }

  function loop() {
    const S = simRef.current;
    if (!S.running) return;
    tick(S, true, nodeEls.current, lineEls.current);
    if (S.dragging || S.alpha > ALPHA_MIN) {
      rafId.current = requestAnimationFrame(loop);
    } else {
      S.running = false;
    }
  }

  function settleSync(iterations: number) {
    const S = simRef.current;
    for (let i = 0; i < iterations; i++) tick(S, i === iterations - 1, nodeEls.current, lineEls.current);
  }

  // Sincroniza o conjunto de nós/arestas simulados com o subgrafo visível,
  // preservando posição de quem persiste e recuperando do cache quem retorna
  // (ex.: toggles ligando/desligando categorias).
  useLayoutEffect(() => {
    const S = simRef.current;
    const prevPos = new Map<string, Pos>();
    for (let i = 0; i < S.ids.length; i++) prevPos.set(S.ids[i], { x: S.x[i], y: S.y[i] });

    const ids = visible.nodes.map((n) => n.id);
    const n = ids.length;
    const x = new Float64Array(n);
    const y = new Float64Array(n);
    const vx = new Float64Array(n);
    const vy = new Float64Array(n);
    const r = new Float64Array(n);
    const fixed = new Uint8Array(n);
    const index = new Map<string, number>();

    ids.forEach((id, i) => {
      index.set(id, i);
      const prev = prevPos.get(id) ?? posCache.current.get(id);
      if (prev) {
        x[i] = prev.x;
        y[i] = prev.y;
      } else {
        // dispersão inicial em espiral áurea, centrada na origem do mundo
        const a = i * 2.399963;
        const rad = 12 * Math.sqrt(i + 1);
        x[i] = Math.cos(a) * rad;
        y[i] = Math.sin(a) * rad;
      }
      const node = visible.nodes[i];
      const deg = node.kind === "pasta" ? folderChildCount.get(node.id) ?? 0 : linkDegree.get(node.id) ?? 0;
      r[i] = radiusOf(node, deg);
    });

    const edges = visible.edges
      .map((e) => {
        const i = index.get(e.a);
        const j = index.get(e.b);
        if (i === undefined || j === undefined) return null;
        const spec = edgeSpec(e.kind);
        return { i, j, len: spec.len, k: spec.k };
      })
      .filter((e): e is { i: number; j: number; len: number; k: number } => e !== null);

    simRef.current = {
      ids,
      x,
      y,
      vx,
      vy,
      r,
      fixed,
      index,
      edges,
      alpha: prevPos.size > 0 ? Math.max(S.alpha, 0.55) : 1,
      running: false,
      dragging: false,
    };

    // grava posições atuais no cache persistente (sobrevive a novos toggles)
    for (let i = 0; i < n; i++) posCache.current.set(ids[i], { x: x[i], y: y[i] });

    if (reducedMotion) {
      settleSync(REDUCED_SETTLE_ITERS);
    } else if (n > 0) {
      // desenha estado atual imediatamente (evita "flash" na origem) e acorda
      tick({ ...simRef.current, alpha: 0 }, true, nodeEls.current, lineEls.current);
      wake(simRef.current.alpha);
    }

    if (!didInitialFit.current && n > 0) {
      didInitialFit.current = true;
      window.setTimeout(() => fitToViewRef.current(false), reducedMotion ? 30 : 900);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, reducedMotion, folderChildCount, linkDegree]);

  useEffect(() => () => cancelAnimationFrame(rafId.current), []);

  // ---- zoom/pan ----
  function toWorld(clientX: number, clientY: number): Pos {
    const svg = svgRef.current;
    if (!svg || !view) return { x: 0, y: 0 };
    const rect = svg.getBoundingClientRect();
    const sx = ((clientX - rect.left) / rect.width) * size.w;
    const sy = ((clientY - rect.top) / rect.height) * size.h;
    return { x: (sx - view.x) / view.k, y: (sy - view.y) / view.k };
  }

  const showGraph = ready && live.length > 0 && view !== null;

  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;
    // setView usa a forma funcional (lê o `v` mais recente sozinho), então o
    // listener não precisa ser recriado a cada pan/zoom — só quando o próprio
    // <svg> aparece ou o tamanho do contêiner muda.
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const rect = svg.getBoundingClientRect();
      const sx = ((e.clientX - rect.left) / rect.width) * size.w;
      const sy = ((e.clientY - rect.top) / rect.height) * size.h;
      setView((v) => {
        if (!v) return v;
        const k = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, v.k * (e.deltaY < 0 ? 1.12 : 1 / 1.12)));
        const wx = (sx - v.x) / v.k;
        const wy = (sy - v.y) / v.k;
        return { k, x: sx - wx * k, y: sy - wy * k };
      });
    };
    svg.addEventListener("wheel", onWheel, { passive: false });
    return () => svg.removeEventListener("wheel", onWheel);
  }, [showGraph, size.w, size.h]);

  function fitToView(animate = true) {
    const S = simRef.current;
    if (S.ids.length === 0 || !view) return;
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (let i = 0; i < S.ids.length; i++) {
      minX = Math.min(minX, S.x[i] - S.r[i]);
      minY = Math.min(minY, S.y[i] - S.r[i]);
      maxX = Math.max(maxX, S.x[i] + S.r[i]);
      maxY = Math.max(maxY, S.y[i] + S.r[i]);
    }
    const bw = Math.max(40, maxX - minX);
    const bh = Math.max(40, maxY - minY);
    const cx = (minX + maxX) / 2;
    const cy = (minY + maxY) / 2;
    const k = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, Math.min((size.w / bw) * 0.85, (size.h / bh) * 0.85)));
    const target: ViewTransform = { x: size.w / 2 - cx * k, y: size.h / 2 - cy * k, k };

    if (!animate || reducedMotion) {
      setView(target);
      return;
    }
    const start = view;
    const t0 = performance.now();
    const dur = 420;
    function step(now: number) {
      const t = Math.min(1, (now - t0) / dur);
      const e = 1 - Math.pow(1 - t, 3); // ease-out-cubic
      setView({
        x: start.x + (target.x - start.x) * e,
        y: start.y + (target.y - start.y) * e,
        k: start.k + (target.k - start.k) * e,
      });
      if (t < 1) requestAnimationFrame(step);
    }
    requestAnimationFrame(step);
  }
  fitToViewRef.current = fitToView;

  // ---- drag (pan de fundo ou nó) ----
  const drag = useRef<
    | { type: "pan"; startX: number; startY: number; view0: ViewTransform; moved: boolean }
    | { type: "node"; id: string; moved: boolean }
    | null
  >(null);

  function onPointerDown(e: React.PointerEvent<SVGSVGElement>) {
    if (!view) return;
    (e.target as Element).setPointerCapture?.(e.pointerId);
    drag.current = { type: "pan", startX: e.clientX, startY: e.clientY, view0: view, moved: false };
  }

  function onNodePointerDown(e: React.PointerEvent, id: string) {
    e.stopPropagation();
    (e.target as Element).setPointerCapture?.(e.pointerId);
    drag.current = { type: "node", id, moved: false };
    const S = simRef.current;
    const idx = S.index.get(id);
    if (idx !== undefined) {
      S.fixed[idx] = 1;
      S.vx[idx] = 0;
      S.vy[idx] = 0;
      S.dragging = true;
    }
    wake(0.6);
  }

  function onPointerMove(e: React.PointerEvent<SVGSVGElement>) {
    const d = drag.current;
    if (!d || !view) return;
    if (d.type === "pan") {
      const svg = svgRef.current;
      const rect = svg?.getBoundingClientRect();
      const scale = rect ? size.w / rect.width : 1;
      const dx = (e.clientX - d.startX) * scale;
      const dy = (e.clientY - d.startY) * scale;
      if (Math.abs(dx) + Math.abs(dy) > 3) d.moved = true;
      setView({ ...d.view0, x: d.view0.x + dx, y: d.view0.y + dy });
    } else {
      d.moved = true;
      const w = toWorld(e.clientX, e.clientY);
      const S = simRef.current;
      const idx = S.index.get(d.id);
      if (idx !== undefined) {
        S.x[idx] = w.x;
        S.y[idx] = w.y;
        const el = nodeEls.current.get(d.id);
        if (el) el.setAttribute("transform", `translate(${w.x.toFixed(2)},${w.y.toFixed(2)})`);
        if (reducedMotion) settleSync(REDUCED_DRAG_ITERS);
      }
    }
  }

  function onPointerUp(e: React.PointerEvent<SVGSVGElement>) {
    const d = drag.current;
    drag.current = null;
    if (d?.type === "node") {
      const S = simRef.current;
      const idx = S.index.get(d.id);
      if (idx !== undefined) S.fixed[idx] = 0;
      S.dragging = false;
      const node = visible.nodes.find((n) => n.id === d.id);
      if (!d.moved && node) {
        if (node.kind === "pasta") setFolderFocus((f) => (f === node.id ? null : node.id));
        else if (node.href) router.push(node.href);
      }
    } else if (d?.type === "pan" && !d.moved) {
      setFolderFocus(null);
    }
  }

  function onPointerCancel() {
    const d = drag.current;
    drag.current = null;
    if (d?.type === "node") {
      const S = simRef.current;
      const idx = S.index.get(d.id);
      if (idx !== undefined) S.fixed[idx] = 0;
      S.dragging = false;
    }
  }

  function onBackgroundDoubleClick() {
    fitToView(true);
  }

  if (!ready) return <div className="panel p-6 text-sm text-[var(--color-mut)]">Carregando…</div>;

  if (!(ready && live.length > 0)) {
    return (
      <div className="panel p-6 text-sm text-[var(--color-mut)]">
        Crie notas e ligue-as com [[wikilinks]] para ver o grafo.
      </div>
    );
  }

  const dimmed = (id: string): boolean => {
    if (hover !== null) return id !== hover && !adjacency.get(hover)?.has(id);
    if (subtreeOf) return !subtreeOf.has(id);
    if (matched) return !matched.has(id);
    return false;
  };

  const zoomK = view?.k ?? 1;
  const labelOpacity = (id: string): number => {
    if (hover === id || matched?.has(id)) return 1;
    return Math.max(0, Math.min(1, (zoomK - 0.85) / 0.7));
  };

  const chip = (active: boolean, label: string, onClick: () => void) => (
    <button
      key={label}
      className="chip transition-colors"
      style={
        active
          ? { borderColor: "var(--color-brand)", color: "var(--color-brand)", background: "color-mix(in srgb, var(--color-brand) 12%, transparent)" }
          : { opacity: 0.55 }
      }
      aria-pressed={active}
      onClick={onClick}
    >
      {label}
    </button>
  );

  return (
    <div className="panel p-2 flex flex-col h-full mm-enter">
      <div className="flex flex-wrap items-center gap-1.5 px-1 pb-2">
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Buscar nós…"
          className="w-40 sm:w-52 rounded-lg bg-[var(--color-well)] border border-[var(--color-line)] px-2.5 py-1 text-xs outline-none focus:border-[var(--color-brand)]"
        />
        <div className="flex items-center gap-1.5">
          {chip(showNotas, "Notas", () => setShowNotas((v) => !v))}
          {chip(showAulas, "Aulas", () => setShowAulas((v) => !v))}
          {chip(showPastas, "Pastas", () => setShowPastas((v) => !v))}
          {chip(showOrfas, "Órfãs", () => setShowOrfas((v) => !v))}
        </div>
        <div className="flex-1" />
        <span className="text-[11px] text-[var(--color-mut)] tabular-nums">
          {visible.nodes.length} nós · {visible.edges.length} arestas
        </span>
        <button className="btn !py-1 !px-2.5 text-xs" onClick={() => setView((v) => (v ? { ...v, k: Math.min(MAX_ZOOM, v.k * 1.25) } : v))} aria-label="Aproximar">
          +
        </button>
        <button className="btn !py-1 !px-2.5 text-xs" onClick={() => setView((v) => (v ? { ...v, k: Math.max(MIN_ZOOM, v.k / 1.25) } : v))} aria-label="Afastar">
          −
        </button>
        <button className="btn !py-1 !px-2.5 text-xs" onClick={() => fitToView(true)} title="Zoom para ajustar tudo à tela">
          Ajustar
        </button>
      </div>

      <div ref={wrapRef} className="relative flex-1 min-h-0">
        <div className="absolute bottom-2 left-2 z-10 flex flex-wrap items-center gap-3 text-[11px] text-[var(--color-mut)] pointer-events-none">
          <span className="inline-flex items-center gap-1.5">
            <span className="inline-block w-2.5 h-2.5 rounded-full border" style={{ borderColor: "var(--color-brand)", background: "color-mix(in srgb, var(--color-brand) 20%, transparent)" }} />
            nota
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="inline-block w-2.5 h-2.5 rounded-full border" style={{ borderColor: "var(--color-brand2)", background: "color-mix(in srgb, var(--color-brand2) 20%, transparent)" }} />
            aula
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="inline-block w-2.5 h-2.5 border" style={{ borderColor: "var(--color-warm)", background: "color-mix(in srgb, var(--color-warm) 20%, transparent)", borderRadius: 3 }} />
            pasta
          </span>
          <span className="hidden md:inline">roda = zoom · fundo = mover · duplo-clique = ajustar · nó = arrastar</span>
        </div>

        {view && (
          <svg
            ref={svgRef}
            viewBox={`0 0 ${size.w} ${size.h}`}
            width="100%"
            height="100%"
            style={{ display: "block", touchAction: "none", cursor: drag.current ? "grabbing" : "grab" }}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerLeave={onPointerCancel}
            onPointerCancel={onPointerCancel}
            onDoubleClick={onBackgroundDoubleClick}
            role="img"
            aria-label="Grafo de notas: nós são notas, aulas e pastas; arestas são wikilinks e pertencimento"
          >
            <g transform={`translate(${view.x},${view.y}) scale(${view.k})`}>
              {visible.edges.map((e) => {
                const key = e.a < e.b ? `${e.a}::${e.b}` : `${e.b}::${e.a}`;
                const active = hover !== null && (e.a === hover || e.b === hover);
                const dim = dimmed(e.a) && dimmed(e.b);
                const isMembership = e.kind === "membership";
                return (
                  <line
                    key={key}
                    ref={(el) => {
                      if (el) lineEls.current.set(key, el);
                      else lineEls.current.delete(key);
                    }}
                    stroke={active ? "var(--color-brand)" : isMembership ? "var(--color-warm)" : "var(--color-line2)"}
                    strokeDasharray={isMembership ? "2,3" : undefined}
                    strokeWidth={active ? 1.8 : 1.1}
                    strokeOpacity={dim ? 0.08 : active ? 0.9 : isMembership ? 0.32 : 0.5}
                    style={{ transition: "stroke-width 0.15s ease, stroke-opacity 0.15s ease, stroke 0.15s ease" }}
                  />
                );
              })}
              {visible.nodes.map((node) => {
                const isAula = node.kind === "aula";
                const isPasta = node.kind === "pasta";
                const deg = isPasta ? folderChildCount.get(node.id) ?? 0 : linkDegree.get(node.id) ?? 0;
                const r = radiusOf(node, deg);
                const color = isAula
                  ? "var(--color-brand2)"
                  : isPasta
                  ? "var(--color-warm)"
                  : deg === 0
                  ? "var(--color-mut)"
                  : deg >= 3
                  ? "var(--color-gold)"
                  : "var(--color-brand)";
                const isDim = dimmed(node.id);
                const opacity = isDim ? 0.15 : 1;
                const isMatch = matched?.has(node.id);
                const lOpacity = labelOpacity(node.id);
                return (
                  <g
                    key={node.id}
                    ref={(el) => {
                      if (el) nodeEls.current.set(node.id, el);
                      else nodeEls.current.delete(node.id);
                    }}
                    style={{
                      cursor: isPasta ? "pointer" : "pointer",
                      opacity,
                      transition: "opacity 0.15s ease",
                      filter: isMatch ? "drop-shadow(0 0 4px var(--color-brand))" : undefined,
                    }}
                    onPointerDown={(e) => onNodePointerDown(e, node.id)}
                    onMouseEnter={() => setHover(node.id)}
                    onMouseLeave={() => setHover(null)}
                    onDoubleClick={(e) => e.stopPropagation()}
                  >
                    <title>{`${node.label}${isAula ? " — aula do currículo" : isPasta ? ` — pasta (${deg})` : ` — ${deg} link(s)`}`}</title>
                    {isPasta ? (
                      <rect
                        x={-r}
                        y={-r}
                        width={r * 2}
                        height={r * 2}
                        rx={5}
                        fill={`color-mix(in srgb, ${color} 22%, transparent)`}
                        stroke={color}
                        strokeWidth={1.6}
                        style={{ transition: "stroke-width 0.15s ease" }}
                      />
                    ) : (
                      <circle
                        r={r}
                        fill={`color-mix(in srgb, ${color} 22%, transparent)`}
                        stroke={color}
                        strokeWidth={1.6}
                        style={{ transition: "stroke-width 0.15s ease" }}
                      />
                    )}
                    <text
                      x={r + 6}
                      y={4}
                      fontSize={11}
                      fill="var(--color-txt)"
                      fontWeight={600}
                      textAnchor="start"
                      style={{ userSelect: "none", opacity: lOpacity, transition: "opacity 0.15s ease" }}
                    >
                      {node.label.slice(0, 28)}
                    </text>
                  </g>
                );
              })}
            </g>
          </svg>
        )}
      </div>
    </div>
  );
}
