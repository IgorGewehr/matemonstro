// Lê data/curriculum/tracks/*.json + data/curriculum/index.json e gera:
//  - public/curriculum-data.json  (buscado em runtime pelo app; fica FORA do
//    bundle JS — cacheado em IndexedDB e pelo service worker)
//  - lib/curriculum-meta.json     (mini-índice importado estaticamente: versão
//    para cache-busting + contagens)
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const tracksDir = path.join(root, "data", "curriculum", "tracks");
const indexPath = path.join(root, "data", "curriculum", "index.json");
const outPath = path.join(root, "public", "curriculum-data.json");
const metaPath = path.join(root, "lib", "curriculum-meta.json");
const legacyPath = path.join(root, "lib", "curriculum-data.json");

function readJson(p) {
  return JSON.parse(fs.readFileSync(p, "utf8"));
}

if (!fs.existsSync(tracksDir)) {
  console.error("Pasta de trilhas não encontrada:", tracksDir);
  process.exit(1);
}

const files = fs.readdirSync(tracksDir).filter((f) => f.endsWith(".json"));
const tracks = [];
const errors = [];

for (const f of files) {
  const p = path.join(tracksDir, f);
  try {
    const t = readJson(p);
    if (!t.id || !Array.isArray(t.subtopics)) {
      errors.push(`${f}: faltam campos obrigatórios (id/subtopics)`);
      continue;
    }
    // recalcula horas da trilha a partir dos subtópicos, se ausente
    if (!t.estimatedHours) {
      t.estimatedHours = t.subtopics.reduce((s, x) => s + (x.estimatedHours || 0), 0);
    }
    tracks.push(t);
  } catch (e) {
    errors.push(`${f}: JSON inválido — ${e.message}`);
  }
}

let index;
if (fs.existsSync(indexPath)) {
  index = readJson(indexPath);
} else {
  // fallback: monta a partir das fases dos próprios tracks
  const byPhase = new Map();
  for (const t of tracks) {
    const arr = byPhase.get(t.phase) ?? [];
    arr.push(t.id);
    byPhase.set(t.phase, arr);
  }
  index = {
    phases: [...byPhase.entries()].sort((a, b) => a[0] - b[0]).map(([id, ids]) => ({
      id,
      label: tracks.find((t) => t.phase === id)?.phaseLabel ?? `Fase ${id}`,
      goal: "",
      trackIds: ids,
    })),
    recommendedOrder: tracks.map((t) => t.id),
    prelimMap: { analise: [], algebra: [], topologiaGeometria: [] },
    ifConcursoCore: [],
    milestones: [],
    notes: "",
  };
}

index.totalHours = tracks.reduce((s, t) => s + (t.estimatedHours || 0), 0);

// ordena tracks pela ordem recomendada
const order = index.recommendedOrder ?? [];
tracks.sort((a, b) => {
  const ia = order.indexOf(a.id);
  const ib = order.indexOf(b.id);
  if (ia === -1 && ib === -1) return a.phase - b.phase;
  if (ia === -1) return 1;
  if (ib === -1) return -1;
  return ia - ib;
});

const bundle = { tracks, index, generatedAt: new Date().toISOString() };
fs.writeFileSync(outPath, JSON.stringify(bundle, null, 0));

const subs = tracks.reduce((s, t) => s + t.subtopics.length, 0);
const cards = tracks.reduce((s, t) => s + t.subtopics.reduce((a, x) => a + (x.flashcards?.length || 0), 0), 0);
fs.writeFileSync(
  metaPath,
  JSON.stringify({ generatedAt: bundle.generatedAt, tracks: tracks.length, subtopics: subs, totalHours: index.totalHours }, null, 2)
);
// o bundle antigo dentro de lib/ não é mais importado — remove para não confundir
if (fs.existsSync(legacyPath)) fs.rmSync(legacyPath);

console.log(`✓ Bundle: ${tracks.length} trilhas, ${subs} subtópicos, ${cards} flashcards, ${index.totalHours}h totais`);
console.log(`  → ${path.relative(root, outPath)} + ${path.relative(root, metaPath)}`);
if (errors.length) {
  console.warn(`\n⚠ ${errors.length} arquivo(s) com problema:`);
  errors.forEach((e) => console.warn("  - " + e));
  process.exitCode = 2;
}
