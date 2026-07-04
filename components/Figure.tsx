"use client";

import { useMemo, useState, type ReactElement } from "react";
import type { Figure as FigureData } from "@/lib/types";
import Markdown from "@/components/Markdown";

// Componente de figuras LEVE e sem dependencias: um mini-plotter em SVG puro.
// Suporta poucos tipos de figura (plot2d/riemann/series/parametric/vectorfield),
// pensados para ilustracoes PONTUAIS de calculo — nao e o foco do app.

const W = 340;
const H = 220;
const PAD = 26;

type Fn = (...args: number[]) => number;

// Divide uma string em partes por virgulas de nivel superior (ignora as internas a parenteses).
function splitTop(s: string): string[] {
  const out: string[] = [];
  let depth = 0;
  let cur = "";
  for (const ch of s) {
    if (ch === "(") depth++;
    else if (ch === ")") depth--;
    if (ch === "," && depth === 0) {
      out.push(cur);
      cur = "";
    } else cur += ch;
  }
  out.push(cur);
  return out;
}

// Compila uma expressao matematica simples num Function seguro (whitelist de tokens).
function compile(expr: string, vars: string[]): Fn | null {
  let js = expr.trim();
  if (!js) return null;
  js = js.replace(/π/g, "pi").replace(/−/g, "-").replace(/\^/g, "**");
  const fns = [
    "sqrt", "cbrt", "sinh", "cosh", "tanh", "asin", "acos", "atan2", "atan",
    "sin", "cos", "tan", "exp", "sign", "floor", "ceil", "round", "abs",
    "log", "min", "max", "pow",
  ];
  for (const f of fns) js = js.replace(new RegExp("\\b" + f + "\\b", "g"), "Math." + f);
  js = js.replace(/\bpi\b/g, "Math.PI");
  js = js.replace(/\bln\b/g, "Math.log");
  js = js.replace(/\be\b/g, "Math.E");
  // valida: apos remover Math.xxx, variaveis, numeros e operadores nada deve sobrar.
  const varRe = vars.length ? new RegExp("\\b(" + vars.join("|") + ")\\b", "g") : null;
  let check = js.replace(/Math\.[A-Za-z0-9]+/g, "");
  if (varRe) check = check.replace(varRe, "");
  const stripped = check.replace(/[0-9.+\-*/(),\s]/g, "");
  if (stripped.length) return null;
  try {
    // eslint-disable-next-line @typescript-eslint/no-implied-eval, no-new-func
    const fn = new Function(...vars, "return (" + js + ");") as Fn;
    const probe = fn(...vars.map(() => 1));
    if (typeof probe !== "number") return null;
    return fn;
  } catch {
    return null;
  }
}

function niceRange(vals: number[]): [number, number] {
  const finite = vals.filter((v) => Number.isFinite(v));
  if (!finite.length) return [-1, 1];
  let lo = Math.min(...finite);
  let hi = Math.max(...finite);
  if (lo === hi) {
    lo -= 1;
    hi += 1;
  }
  const m = (hi - lo) * 0.08;
  return [lo - m, hi + m];
}

export default function Figure({ figure }: { figure: FigureData }) {
  const params = figure.params ?? [];
  const [vals, setVals] = useState<Record<string, number>>(() =>
    Object.fromEntries(params.map((p) => [p.name, p.default]))
  );
  const paramNames = params.map((p) => p.name);
  const paramVals = paramNames.map((n) => vals[n]);

  const [a, b] = figure.domain ?? [-5, 5];

  const svg = useMemo(() => {
    try {
      return renderFigure(figure, a, b, paramNames, paramVals);
    } catch {
      return null;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [figure, a, b, JSON.stringify(paramVals)]);

  return (
    <figure className="my-2 rounded-xl bg-[var(--color-well)] border border-[var(--color-line)] p-3">
      {svg ?? (
        <div className="text-xs text-[var(--color-mut)] py-6 text-center">
          Nao foi possivel desenhar esta figura.
        </div>
      )}
      {params.length > 0 && (
        <div className="mt-3 space-y-2">
          {params.map((p) => (
            <label key={p.name} className="flex items-center gap-2 text-xs text-[var(--color-mut)]">
              <span className="w-16 shrink-0 font-mono text-[var(--color-txt2)]">{p.name} = {vals[p.name]}</span>
              <input
                type="range"
                min={p.min}
                max={p.max}
                step={p.step ?? (p.name === "n" ? 1 : (p.max - p.min) / 100 || 1)}
                value={vals[p.name]}
                onChange={(e) => setVals((v) => ({ ...v, [p.name]: Number(e.target.value) }))}
                className="flex-1 accent-[var(--color-brand)]"
              />
            </label>
          ))}
        </div>
      )}
      {figure.caption && (
        <figcaption className="mt-2 text-xs text-[var(--color-mut)] text-center italic">
          <Markdown className="inline">{figure.caption}</Markdown>
        </figcaption>
      )}
    </figure>
  );
}

function Axes({
  sx,
  sy,
  a,
  b,
  ymin,
  ymax,
}: {
  sx: (x: number) => number;
  sy: (y: number) => number;
  a: number;
  b: number;
  ymin: number;
  ymax: number;
}) {
  const showY0 = a <= 0 && b >= 0;
  const showX0 = ymin <= 0 && ymax >= 0;
  return (
    <g stroke="var(--color-line)" strokeWidth={1}>
      <rect x={PAD} y={PAD} width={W - 2 * PAD} height={H - 2 * PAD} fill="none" />
      {showY0 && <line x1={sx(0)} y1={PAD} x2={sx(0)} y2={H - PAD} />}
      {showX0 && <line x1={PAD} y1={sy(0)} x2={W - PAD} y2={sy(0)} />}
    </g>
  );
}

function renderFigure(
  figure: FigureData,
  a: number,
  b: number,
  paramNames: string[],
  paramVals: number[]
): ReactElement | null {
  const kind = figure.kind;

  if (kind === "parametric" || kind === "vectorfield") {
    const parts = splitTop(figure.expr);
    if (parts.length < 2) return null;

    if (kind === "parametric") {
      const fx = compile(parts[0], ["t", ...paramNames]);
      const fy = compile(parts[1], ["t", ...paramNames]);
      if (!fx || !fy) return null;
      const N = 200;
      const xs: number[] = [];
      const ys: number[] = [];
      for (let i = 0; i <= N; i++) {
        const t = a + ((b - a) * i) / N;
        xs.push(fx(t, ...paramVals));
        ys.push(fy(t, ...paramVals));
      }
      const [xmin, xmax] = niceRange(xs);
      const [ymin, ymax] = niceRange(ys);
      const sx = (x: number) => PAD + ((x - xmin) / (xmax - xmin)) * (W - 2 * PAD);
      const sy = (y: number) => H - PAD - ((y - ymin) / (ymax - ymin)) * (H - 2 * PAD);
      const d = xs
        .map((x, i) => `${i ? "L" : "M"}${sx(x).toFixed(1)},${sy(ys[i]).toFixed(1)}`)
        .join(" ");
      return (
        <svg viewBox={`0 0 ${W} ${H}`} width="100%" role="img" aria-label={figure.caption ?? "figura"}>
          <Axes sx={sx} sy={sy} a={xmin} b={xmax} ymin={ymin} ymax={ymax} />
          <path d={d} fill="none" stroke="var(--color-brand)" strokeWidth={2} />
        </svg>
      );
    }

    // vectorfield: expr = "P(x,y), Q(x,y)"
    const P = compile(parts[0], ["x", "y", ...paramNames]);
    const Q = compile(parts[1], ["x", "y", ...paramNames]);
    if (!P || !Q) return null;
    const xmin = a;
    const xmax = b;
    const ymin = a;
    const ymax = b;
    const sx = (x: number) => PAD + ((x - xmin) / (xmax - xmin)) * (W - 2 * PAD);
    const sy = (y: number) => H - PAD - ((y - ymin) / (ymax - ymin)) * (H - 2 * PAD);
    const G = 8;
    const arrows: ReactElement[] = [];
    const cell = Math.min((W - 2 * PAD) / G, (H - 2 * PAD) / G) * 0.42;
    for (let i = 0; i < G; i++) {
      for (let j = 0; j < G; j++) {
        const x = xmin + ((xmax - xmin) * (i + 0.5)) / G;
        const y = ymin + ((ymax - ymin) * (j + 0.5)) / G;
        const u = P(x, y, ...paramVals);
        const v = Q(x, y, ...paramVals);
        const mag = Math.hypot(u, v);
        if (!Number.isFinite(mag) || mag === 0) continue;
        const nx = (u / mag) * cell;
        const ny = (v / mag) * cell;
        const px = sx(x);
        const py = sy(y);
        const ex = px + nx;
        const ey = py - ny; // svg y invertido
        arrows.push(
          <line key={`${i}-${j}`} x1={px} y1={py} x2={ex} y2={ey} stroke="#00d3a7" strokeWidth={1.4} markerEnd="url(#arrow)" />
        );
      }
    }
    return (
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" role="img" aria-label={figure.caption ?? "campo vetorial"}>
        <defs>
          <marker id="arrow" markerWidth="6" markerHeight="6" refX="5" refY="3" orient="auto">
            <path d="M0,0 L6,3 L0,6 Z" fill="#00d3a7" />
          </marker>
        </defs>
        <Axes sx={sx} sy={sy} a={xmin} b={xmax} ymin={ymin} ymax={ymax} />
        {arrows}
      </svg>
    );
  }

  // Casos y = f(x): plot2d, riemann, series
  const f = compile(figure.expr, ["x", ...paramNames]);
  if (!f) return null;

  // Curvas extras (tangente, assintotas, somas parciais…) na mesma variavel x.
  const overlays = (figure.overlay ?? [])
    .map((ex) => compile(ex, ["x", ...paramNames]))
    .filter((g): g is Fn => !!g);

  if (kind === "series") {
    // sequencia a_n = f(n) para n inteiro no dominio
    const n0 = Math.ceil(a);
    const n1 = Math.floor(b);
    const ns: number[] = [];
    for (let n = n0; n <= n1; n++) ns.push(n);
    const ys = ns.map((n) => f(n, ...paramVals));
    const [ymin, ymax] = niceRange([...ys, 0]);
    const sx = (x: number) => PAD + ((x - a) / (b - a)) * (W - 2 * PAD);
    const sy = (y: number) => H - PAD - ((y - ymin) / (ymax - ymin)) * (H - 2 * PAD);
    return (
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" role="img" aria-label={figure.caption ?? "sequencia"}>
        <Axes sx={sx} sy={sy} a={a} b={b} ymin={ymin} ymax={ymax} />
        {ns.map((n, i) => (
          <g key={n}>
            <line x1={sx(n)} y1={sy(0)} x2={sx(n)} y2={sy(ys[i])} stroke="var(--color-line2)" strokeWidth={1} />
            <circle cx={sx(n)} cy={sy(ys[i])} r={2.6} fill="var(--color-brand)" />
          </g>
        ))}
      </svg>
    );
  }

  const N = 240;
  const xs: number[] = [];
  const ys: number[] = [];
  for (let i = 0; i <= N; i++) {
    const x = a + ((b - a) * i) / N;
    xs.push(x);
    ys.push(f(x, ...paramVals));
  }
  const [ymin, ymax] = niceRange([...ys, 0]);
  const sx = (x: number) => PAD + ((x - a) / (b - a)) * (W - 2 * PAD);
  const sy = (y: number) => H - PAD - ((y - ymin) / (ymax - ymin)) * (H - 2 * PAD);

  let d = "";
  let pen = false;
  for (let i = 0; i <= N; i++) {
    const y = ys[i];
    if (!Number.isFinite(y) || y < ymin || y > ymax) {
      pen = false;
      continue;
    }
    d += `${pen ? "L" : "M"}${sx(xs[i]).toFixed(1)},${sy(y).toFixed(1)} `;
    pen = true;
  }

  // Tracos das curvas sobrepostas (mesma escala do grafico principal; clipadas).
  const overlayPaths = overlays.map((g) => {
    let od = "";
    let pen = false;
    for (let i = 0; i <= N; i++) {
      const y = g(xs[i], ...paramVals);
      if (!Number.isFinite(y) || y < ymin || y > ymax) {
        pen = false;
        continue;
      }
      od += `${pen ? "L" : "M"}${sx(xs[i]).toFixed(1)},${sy(y).toFixed(1)} `;
      pen = true;
    }
    return od;
  });

  let rects: ReactElement[] = [];
  if (kind === "riemann") {
    const nRect = Math.max(2, Math.round(paramNames.includes("n") ? paramVals[paramNames.indexOf("n")] : 8));
    rects = Array.from({ length: nRect }, (_, k) => {
      const x0 = a + ((b - a) * k) / nRect;
      const x1 = a + ((b - a) * (k + 1)) / nRect;
      const yv = f(x0, ...paramVals);
      if (!Number.isFinite(yv)) return null;
      const yTop = sy(Math.max(0, yv));
      const yBot = sy(Math.min(0, yv));
      return (
        <rect
          key={k}
          x={sx(x0)}
          y={yTop}
          width={Math.max(0, sx(x1) - sx(x0) - 1)}
          height={Math.max(0, yBot - yTop)}
          fill="color-mix(in srgb, var(--color-brand) 20%, transparent)"
          stroke="var(--color-brand)"
          strokeWidth={0.8}
        />
      );
    }).filter(Boolean) as ReactElement[];
  }

  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" role="img" aria-label={figure.caption ?? "grafico"}>
      <Axes sx={sx} sy={sy} a={a} b={b} ymin={ymin} ymax={ymax} />
      {rects}
      {overlayPaths.map((od, k) =>
        od ? (
          <path key={k} d={od} fill="none" stroke="var(--color-mut)" strokeWidth={1.3} strokeDasharray="4 3" />
        ) : null
      )}
      <path d={d} fill="none" stroke="#00d3a7" strokeWidth={2} />
    </svg>
  );
}
