"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useNotes } from "./NotesProvider";
import { parseWikilinks, findNoteByTitle, noteHref } from "@/lib/notes";
import { findSubRefByWikilink, subHref } from "@/lib/notes-curriculum";
import { useCurriculumReady } from "@/lib/useCurriculum";
import type { Note } from "@/lib/types";

const W = 900;
const H = 620;
const R = 9;
const MIN_ZOOM = 0.4;
const MAX_ZOOM = 3.5;

interface Pos {
  x: number;
  y: number;
}

interface GraphNode {
  id: string; // id da nota, ou "sub:<subId>" para aulas do currículo
  kind: "nota" | "aula";
  label: string;
  href: string;
}

// Layout força-dirigida sem dependências externas: repulsão entre todos os nós +
// atração ao longo das arestas + gravidade pro centro. Determinístico (posição
// inicial em círculo). Iterações reduzidas para grafos grandes (evita jank).
function layoutGraph(count: number, edges: [number, number][]): Pos[] {
  const pos: Pos[] = Array.from({ length: count }, (_, i) => {
    const a = (2 * Math.PI * i) / Math.max(1, count);
    const rad = Math.min(W, H) * 0.35;
    return { x: W / 2 + rad * Math.cos(a), y: H / 2 + rad * Math.sin(a) };
  });
  if (count <= 1) return pos;

  const ITER = count > 120 ? 80 : 220;
  const REPEL = 2600;
  const ATTRACT = 0.02;
  const CENTER = 0.01;

  for (let it = 0; it < ITER; it++) {
    const force: Pos[] = pos.map(() => ({ x: 0, y: 0 }));

    for (let i = 0; i < count; i++) {
      for (let j = i + 1; j < count; j++) {
        let dx = pos[i].x - pos[j].x;
        let dy = pos[i].y - pos[j].y;
        let d2 = dx * dx + dy * dy;
        if (d2 < 1) d2 = 1;
        const d = Math.sqrt(d2);
        const f = REPEL / d2;
        force[i].x += (dx / d) * f;
        force[i].y += (dy / d) * f;
        force[j].x -= (dx / d) * f;
        force[j].y -= (dy / d) * f;
      }
    }

    for (const [a, b] of edges) {
      const dx = pos[a].x - pos[b].x;
      const dy = pos[a].y - pos[b].y;
      force[a].x -= dx * ATTRACT;
      force[a].y -= dy * ATTRACT;
      force[b].x += dx * ATTRACT;
      force[b].y += dy * ATTRACT;
    }

    for (let i = 0; i < count; i++) {
      force[i].x += (W / 2 - pos[i].x) * CENTER;
      force[i].y += (H / 2 - pos[i].y) * CENTER;
    }

    for (let i = 0; i < count; i++) {
      pos[i].x = Math.max(R + 8, Math.min(W - R - 8, pos[i].x + force[i].x * 0.02));
      pos[i].y = Math.max(R + 8, Math.min(H - R - 8, pos[i].y + force[i].y * 0.02));
    }
  }

  return pos;
}

// Monta nós (notas + aulas citadas) e arestas a partir dos [[wikilinks]] e do
// subtopicId das notas. Aulas do currículo só entram se alguma nota as cita.
function buildGraph(live: Note[]): { nodes: GraphNode[]; edges: [number, number][]; degree: number[] } {
  const nodes: GraphNode[] = live.map((n) => ({
    id: n.id,
    kind: "nota",
    label: n.title || "Sem título",
    href: noteHref(n.id),
  }));
  const idxById = new Map(nodes.map((n, i) => [n.id, i]));

  const lessonIdx = (subId: string): number | null => {
    const key = `sub:${subId}`;
    const existing = idxById.get(key);
    if (existing !== undefined) return existing;
    const ref = findSubRefByWikilink(key);
    if (!ref) return null;
    nodes.push({ id: key, kind: "aula", label: ref.sub.title, href: subHref(ref) });
    idxById.set(key, nodes.length - 1);
    return nodes.length - 1;
  };

  const seen = new Set<string>();
  const edges: [number, number][] = [];
  const pushEdge = (a: number, b: number) => {
    if (a === b) return;
    const key = a < b ? `${a}-${b}` : `${b}-${a}`;
    if (seen.has(key)) return;
    seen.add(key);
    edges.push([a, b]);
  };

  for (const n of live) {
    const from = idxById.get(n.id)!;
    for (const title of parseWikilinks(n.body || "")) {
      const targetNote = findNoteByTitle(title, live);
      if (targetNote) {
        pushEdge(from, idxById.get(targetNote.id)!);
        continue;
      }
      const ref = findSubRefByWikilink(title);
      if (ref) {
        const li = lessonIdx(ref.sub.id);
        if (li !== null) pushEdge(from, li);
      }
    }
    if (n.subtopicId) {
      const li = lessonIdx(n.subtopicId);
      if (li !== null) pushEdge(from, li);
    }
  }

  const degree = new Array(nodes.length).fill(0);
  for (const [a, b] of edges) {
    degree[a]++;
    degree[b]++;
  }
  return { nodes, edges, degree };
}

interface ViewTransform {
  x: number;
  y: number;
  k: number;
}

export default function NotesGraph() {
  const router = useRouter();
  const { notes, ready } = useNotes();
  const live = useMemo(() => notes.filter((n) => !n.deleted), [notes]);

  // os nós de "aula" dependem do currículo, que carrega em runtime
  const curReady = useCurriculumReady();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const { nodes, edges, degree } = useMemo(() => buildGraph(live), [live, curReady]);
  const basePos = useMemo(() => layoutGraph(nodes.length, edges), [nodes.length, edges]);

  const [overrides, setOverrides] = useState<Map<string, Pos>>(new Map());
  const [view, setView] = useState<ViewTransform>({ x: 0, y: 0, k: 1 });
  const [hover, setHover] = useState<number | null>(null);

  const svgRef = useRef<SVGSVGElement>(null);
  // Interação em andamento (pan ou drag de nó); refs para não re-renderizar a cada pixel.
  const drag = useRef<
    | { type: "pan"; startX: number; startY: number; view0: ViewTransform; moved: boolean }
    | { type: "node"; idx: number; moved: boolean }
    | null
  >(null);

  const adjacency = useMemo(() => {
    const adj: Set<number>[] = nodes.map(() => new Set<number>());
    for (const [a, b] of edges) {
      adj[a].add(b);
      adj[b].add(a);
    }
    return adj;
  }, [nodes, edges]);

  const posOf = (i: number): Pos => overrides.get(nodes[i].id) ?? basePos[i];

  // Converte coordenadas de tela para o espaço do grafo (viewBox + transform).
  function toWorld(clientX: number, clientY: number): Pos {
    const svg = svgRef.current;
    if (!svg) return { x: 0, y: 0 };
    const rect = svg.getBoundingClientRect();
    const sx = ((clientX - rect.left) / rect.width) * W;
    const sy = ((clientY - rect.top) / rect.height) * H;
    return { x: (sx - view.x) / view.k, y: (sy - view.y) / view.k };
  }

  // O SVG só existe depois de ready && live.length > 0 — o efeito do wheel
  // precisa re-rodar quando ele monta (deps vazias perderiam o listener).
  const showGraph = ready && live.length > 0;

  // Zoom com roda, centrado no cursor. Listener nativo (React marca onWheel
  // como passivo e o preventDefault não funcionaria).
  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const rect = svg.getBoundingClientRect();
      const sx = ((e.clientX - rect.left) / rect.width) * W;
      const sy = ((e.clientY - rect.top) / rect.height) * H;
      setView((v) => {
        const k = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, v.k * (e.deltaY < 0 ? 1.12 : 1 / 1.12)));
        // mantém o ponto sob o cursor fixo durante o zoom
        const wx = (sx - v.x) / v.k;
        const wy = (sy - v.y) / v.k;
        return { k, x: sx - wx * k, y: sy - wy * k };
      });
    };
    svg.addEventListener("wheel", onWheel, { passive: false });
    return () => svg.removeEventListener("wheel", onWheel);
  }, [showGraph]);

  function onPointerDown(e: React.PointerEvent<SVGSVGElement>) {
    (e.target as Element).setPointerCapture?.(e.pointerId);
    drag.current = { type: "pan", startX: e.clientX, startY: e.clientY, view0: view, moved: false };
  }

  function onNodePointerDown(e: React.PointerEvent, idx: number) {
    e.stopPropagation();
    (e.target as Element).setPointerCapture?.(e.pointerId);
    drag.current = { type: "node", idx, moved: false };
  }

  function onPointerMove(e: React.PointerEvent<SVGSVGElement>) {
    const d = drag.current;
    if (!d) return;
    if (d.type === "pan") {
      const svg = svgRef.current;
      const rect = svg?.getBoundingClientRect();
      const scale = rect ? W / rect.width : 1;
      const dx = (e.clientX - d.startX) * scale;
      const dy = (e.clientY - d.startY) * scale;
      if (Math.abs(dx) + Math.abs(dy) > 3) d.moved = true;
      setView({ ...d.view0, x: d.view0.x + dx, y: d.view0.y + dy });
    } else {
      d.moved = true;
      const w = toWorld(e.clientX, e.clientY);
      const id = nodes[d.idx].id;
      setOverrides((prev) => {
        const next = new Map(prev);
        next.set(id, w);
        return next;
      });
    }
  }

  function onPointerUp(e: React.PointerEvent<SVGSVGElement>) {
    const d = drag.current;
    drag.current = null;
    if (d?.type === "node" && !d.moved) {
      router.push(nodes[d.idx].href);
    }
  }

  // Pointer saiu do SVG no meio de uma interação: cancela sem navegar.
  function onPointerCancel() {
    drag.current = null;
  }

  if (!ready) return <div className="panel p-6 text-sm text-[var(--color-mut)]">Carregando…</div>;

  if (!showGraph) {
    return (
      <div className="panel p-6 text-sm text-[var(--color-mut)]">
        Crie notas e ligue-as com [[wikilinks]] para ver o grafo.
      </div>
    );
  }

  const dimmed = (i: number) => hover !== null && i !== hover && !adjacency[hover].has(i);

  return (
    <div className="panel p-2 relative mm-enter">
      <div className="absolute top-3 right-3 z-10 flex items-center gap-1.5">
        <button
          className="btn !py-1 !px-2.5 text-xs"
          onClick={() => setView((v) => ({ ...v, k: Math.min(MAX_ZOOM, v.k * 1.25) }))}
          aria-label="Aproximar"
        >
          +
        </button>
        <button
          className="btn !py-1 !px-2.5 text-xs"
          onClick={() => setView((v) => ({ ...v, k: Math.max(MIN_ZOOM, v.k / 1.25) }))}
          aria-label="Afastar"
        >
          −
        </button>
        <button
          className="btn !py-1 !px-2.5 text-xs"
          onClick={() => {
            setView({ x: 0, y: 0, k: 1 });
            setOverrides(new Map());
          }}
          aria-label="Restaurar visão"
          title="Restaurar visão e layout"
        >
          ⟲
        </button>
      </div>

      <div className="absolute bottom-3 left-3 z-10 flex items-center gap-3 text-[11px] text-[var(--color-mut)] pointer-events-none">
        <span className="inline-flex items-center gap-1.5">
          <span className="inline-block w-2.5 h-2.5 rounded-full border" style={{ borderColor: "var(--color-brand)", background: "color-mix(in srgb, var(--color-brand) 20%, transparent)" }} />
          nota
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="inline-block w-2.5 h-2.5 border" style={{ borderColor: "#00d3a7", background: "#00d3a733", borderRadius: 3 }} />
          aula do currículo
        </span>
        <span className="hidden md:inline">roda = zoom · arraste o fundo = mover · arraste um nó = reposicionar</span>
      </div>

      <svg
        ref={svgRef}
        viewBox={`0 0 ${W} ${H}`}
        width="100%"
        height={H}
        style={{ display: "block", touchAction: "none", cursor: drag.current ? "grabbing" : "grab" }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerLeave={onPointerCancel}
        onPointerCancel={onPointerCancel}
        role="img"
        aria-label="Grafo de notas: nós são notas e aulas; arestas são wikilinks"
      >
        <g transform={`translate(${view.x},${view.y}) scale(${view.k})`}>
          {edges.map(([a, b], i) => {
            const pa = posOf(a);
            const pb = posOf(b);
            const active = hover !== null && (a === hover || b === hover);
            const dim = hover !== null && !active;
            return (
              <line
                key={i}
                x1={pa.x}
                y1={pa.y}
                x2={pb.x}
                y2={pb.y}
                stroke={active ? "var(--color-brand)" : "var(--color-line2)"}
                strokeWidth={active ? 1.8 : 1.2}
                strokeOpacity={dim ? 0.12 : active ? 0.9 : 0.55}
              />
            );
          })}
          {nodes.map((node, i) => {
            const p = posOf(i);
            const isAula = node.kind === "aula";
            const color = isAula ? "var(--color-brand2)" : degree[i] >= 3 ? "#f6c453" : "var(--color-brand)";
            const r = R + Math.min(10, degree[i] * 1.5);
            const opacity = dimmed(i) ? 0.15 : 1;
            const labelLeft = p.x > W - 160; // rótulo pra esquerda perto da borda direita
            return (
              <g
                key={node.id}
                transform={`translate(${p.x},${p.y})`}
                style={{ cursor: "pointer", opacity, transition: "opacity 0.12s ease" }}
                onPointerDown={(e) => onNodePointerDown(e, i)}
                onMouseEnter={() => setHover(i)}
                onMouseLeave={() => setHover(null)}
              >
                <title>{`${node.label} — ${degree[i]} link(s)${isAula ? " · aula do currículo" : ""}`}</title>
                {isAula ? (
                  <rect x={-r * 0.9} y={-r * 0.9} width={r * 1.8} height={r * 1.8} rx={4} fill={`${color}33`} stroke={color} strokeWidth={1.6} />
                ) : (
                  <circle r={r} fill={`${color}33`} stroke={color} strokeWidth={1.6} />
                )}
                <text
                  x={labelLeft ? -(r + 6) : r + 6}
                  y={4}
                  fontSize={11}
                  fill="var(--color-txt)"
                  fontWeight={600}
                  textAnchor={labelLeft ? "end" : "start"}
                  style={{ userSelect: "none" }}
                >
                  {node.label.slice(0, 28)}
                </text>
              </g>
            );
          })}
        </g>
      </svg>
    </div>
  );
}
