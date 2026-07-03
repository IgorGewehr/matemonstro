// Aplica os patches de plan/enrich/<trackId>.json nas trilhas, de forma
// ADITIVA e segura: so preenche campos AUSENTES, nunca remove nem sobrescreve.
// Campos suportados:
//   subtopico: studyRoadmap, history, figures, prereqs
//   exercicio (por indice): solution, steps, source, tags
//   trilha: examBank, formulaSheet, glossary
// Trava de seguranca: subtopicos/exercicios/flashcards continuam com a mesma
// contagem. Figuras invalidas (que nao compilam no renderer) sao descartadas com
// aviso — nunca chegam a trilha (o portao de build tambem barraria).
import fs from "node:fs";
import path from "node:path";
import { validateFigure } from "./lib/figure-expr.mjs";

const root = process.cwd();
const tracksDir = path.join(root, "data", "curriculum", "tracks");
const enrichDir = path.join(root, "plan", "enrich");

if (!fs.existsSync(enrichDir)) {
  console.error("Sem pasta plan/enrich — nada para aplicar.");
  process.exit(1);
}

const nonEmpty = (v) =>
  v && (Array.isArray(v) ? v.length > 0 : typeof v === "object" ? Object.keys(v).length > 0 : String(v).trim() !== "");

const counts = (t) => ({
  subs: t.subtopics.length,
  exs: t.subtopics.reduce((s, x) => s + (x.exercises?.length || 0), 0),
  cards: t.subtopics.reduce((s, x) => s + (x.flashcards?.length || 0), 0),
});

const files = fs.readdirSync(enrichDir).filter((f) => f.endsWith(".json"));
let okTracks = 0;
const tally = { road: 0, sol: 0, steps: 0, hist: 0, fig: 0, prereq: 0, src: 0, tags: 0, bank: 0, sheet: 0, gloss: 0 };
const skipped = [];
const warns = [];

for (const f of files) {
  const trackId = f.replace(".json", "");
  const trackPath = path.join(tracksDir, `${trackId}.json`);
  if (!fs.existsSync(trackPath)) { skipped.push(`${trackId}: trilha inexistente`); continue; }

  let patch, track;
  try {
    patch = JSON.parse(fs.readFileSync(path.join(enrichDir, f), "utf8"));
    track = JSON.parse(fs.readFileSync(trackPath, "utf8"));
  } catch (e) { skipped.push(`${trackId}: JSON invalido — ${e.message}`); continue; }

  const before = counts(track);
  const byId = new Map(track.subtopics.map((s) => [s.id, s]));
  const local = { road: 0, sol: 0, steps: 0, hist: 0, fig: 0, prereq: 0, src: 0, tags: 0 };

  // ---- Nivel subtopico ----
  for (const ps of patch.subtopics || []) {
    const sub = byId.get(ps.id);
    if (!sub) continue;

    if (nonEmpty(ps.studyRoadmap) && !nonEmpty(sub.studyRoadmap)) { sub.studyRoadmap = ps.studyRoadmap; local.road++; }
    if (nonEmpty(ps.history) && !nonEmpty(sub.history)) { sub.history = ps.history; local.hist++; }
    if (nonEmpty(ps.prereqs) && !nonEmpty(sub.prereqs)) { sub.prereqs = ps.prereqs; local.prereq++; }

    if (nonEmpty(ps.figures) && !nonEmpty(sub.figures)) {
      const good = [];
      for (const [i, fig] of ps.figures.entries()) {
        const problems = validateFigure(fig);
        if (problems.length) warns.push(`${trackId}/${ps.id} figures[${i}]: ${problems.join("; ")} (descartada)`);
        else good.push(fig);
      }
      if (good.length) { sub.figures = good; local.fig += good.length; }
    }

    for (const pe of ps.exercises || []) {
      const ex = sub.exercises?.[pe.index];
      if (!ex) continue;
      if (nonEmpty(pe.solution) && !nonEmpty(ex.solution)) { ex.solution = pe.solution; local.sol++; }
      if (nonEmpty(pe.steps) && !nonEmpty(ex.steps)) { ex.steps = pe.steps; local.steps++; }
      if (nonEmpty(pe.source) && !nonEmpty(ex.source)) { ex.source = pe.source; local.src++; }
      if (nonEmpty(pe.tags) && !nonEmpty(ex.tags)) { ex.tags = pe.tags; local.tags++; }
    }
  }

  // ---- Nivel trilha ----
  let bankAdded = 0, sheetAdded = 0, glossAdded = 0;
  if (nonEmpty(patch.examBank) && !nonEmpty(track.examBank)) { track.examBank = patch.examBank; bankAdded = patch.examBank.length; }
  if (nonEmpty(patch.formulaSheet) && !nonEmpty(track.formulaSheet)) { track.formulaSheet = patch.formulaSheet; sheetAdded = 1; }
  if (nonEmpty(patch.glossary) && !nonEmpty(track.glossary)) { track.glossary = patch.glossary; glossAdded = patch.glossary.length; }

  const after = counts(track);
  if (after.subs !== before.subs || after.exs !== before.exs || after.cards !== before.cards) {
    skipped.push(`${trackId}: contagem mudou (perda de conteudo!) — nao gravado`);
    continue;
  }

  const touched =
    Object.values(local).reduce((a, b) => a + b, 0) + bankAdded + sheetAdded + glossAdded;
  if (!touched) continue;

  fs.writeFileSync(trackPath, JSON.stringify(track, null, 2) + "\n");
  okTracks++;
  for (const k of Object.keys(local)) tally[k] += local[k];
  tally.bank += bankAdded; tally.sheet += sheetAdded; tally.gloss += glossAdded;
  const bits = [];
  if (local.road) bits.push(`${local.road} roteiros`);
  if (local.sol) bits.push(`${local.sol} solucoes`);
  if (local.hist) bits.push(`${local.hist} historias`);
  if (local.fig) bits.push(`${local.fig} figuras`);
  if (local.prereq) bits.push(`${local.prereq} prereqs`);
  if (local.src) bits.push(`${local.src} fontes`);
  if (bankAdded) bits.push(`${bankAdded} questoes-banca`);
  if (sheetAdded) bits.push(`formulario`);
  if (glossAdded) bits.push(`${glossAdded} termos-glossario`);
  console.log(`✓ ${trackId}: ${bits.join(", ")}`);
}

console.log(`\n${okTracks}/${files.length} trilhas atualizadas`);
console.log(`  roteiros:${tally.road} solucoes:${tally.sol} historias:${tally.hist} figuras:${tally.fig} prereqs:${tally.prereq} fontes:${tally.src} banca:${tally.bank} formularios:${tally.sheet} glossario:${tally.gloss}`);
if (warns.length) { console.warn(`\n⚠ ${warns.length} item(ns) descartado(s):`); warns.slice(0, 20).forEach((w) => console.warn("  - " + w)); }
if (skipped.length) { console.warn("\n⚠ pulados:"); skipped.forEach((s) => console.warn("  - " + s)); process.exitCode = 2; }
