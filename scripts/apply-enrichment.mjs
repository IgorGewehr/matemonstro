// Aplica os patches de plan/enrich/<trackId>.json nas trilhas, de forma
// ADITIVA e segura: so preenche studyRoadmap (subtopico sem um) e solution/steps
// (exercicio sem eles). Nunca remove nem sobrescreve conteudo existente.
// Verifica que subtopicos/exercicios/flashcards continuam com a mesma contagem.
import fs from "node:fs";
import path from "node:path";

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
let okTracks = 0, road = 0, sol = 0, skipped = [];

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
  let rAdded = 0, sAdded = 0;

  for (const ps of patch.subtopics || []) {
    const sub = byId.get(ps.id);
    if (!sub) continue;
    if (nonEmpty(ps.studyRoadmap) && !nonEmpty(sub.studyRoadmap)) { sub.studyRoadmap = ps.studyRoadmap; rAdded++; }
    for (const pe of ps.exercises || []) {
      const ex = sub.exercises?.[pe.index];
      if (!ex) continue;
      if (nonEmpty(pe.solution) && !nonEmpty(ex.solution)) { ex.solution = pe.solution; sAdded++; }
      if (nonEmpty(pe.steps) && !nonEmpty(ex.steps)) ex.steps = pe.steps;
    }
  }

  const after = counts(track);
  if (after.subs !== before.subs || after.exs !== before.exs || after.cards !== before.cards) {
    skipped.push(`${trackId}: contagem mudou (perda de conteudo!) — nao gravado`);
    continue;
  }

  fs.writeFileSync(trackPath, JSON.stringify(track, null, 2));
  okTracks++; road += rAdded; sol += sAdded;
  console.log(`✓ ${trackId}: +${rAdded} roteiros, +${sAdded} solucoes`);
}

console.log(`\n${okTracks}/${files.length} trilhas atualizadas · ${road} roteiros · ${sol} solucoes`);
if (skipped.length) { console.warn("\n⚠ pulados:"); skipped.forEach((s) => console.warn("  - " + s)); process.exitCode = 2; }
