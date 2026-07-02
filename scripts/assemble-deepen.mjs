// Monta as trilhas aprofundadas a partir de plan/deepen/:
//  - meta vem da trilha ORIGINAL (title, phase, books, examRelevance, prereqs...)
//  - subtopicos vem de plan/deepen/subs/<track>__<id>.json na ordem do outline
// Grava em plan/deepen/<track>.json (STAGING — nao toca nas trilhas reais).
// Valida e reporta buracos (aulas faltando/invalidas) para re-rodar se preciso.
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const tracksDir = path.join(root, "data", "curriculum", "tracks");
const deep = path.join(root, "plan", "deepen");
const subsDir = path.join(deep, "subs");

const TRACKS = ["fundamentos", "prova", "calculo1", "calculo2", "calculo3", "algebra-linear"];
const REQ = ["id", "title", "objectives", "keyConcepts", "theorems", "summary", "exercises", "flashcards"];

let allGood = true;
for (const tid of TRACKS) {
  const origPath = path.join(tracksDir, `${tid}.json`);
  const outlinePath = path.join(deep, `outline-${tid}.json`);
  if (!fs.existsSync(origPath)) { console.log(`✗ ${tid}: trilha original nao encontrada`); allGood = false; continue; }
  if (!fs.existsSync(outlinePath)) { console.log(`⏳ ${tid}: sem outline ainda`); allGood = false; continue; }

  const orig = JSON.parse(fs.readFileSync(origPath, "utf8"));
  const outline = JSON.parse(fs.readFileSync(outlinePath, "utf8"));
  const order = outline.subtopics || [];

  const subs = [];
  const missing = [];
  for (const o of order) {
    const p = path.join(subsDir, `${tid}__${o.id}.json`);
    if (!fs.existsSync(p)) { missing.push(o.id); continue; }
    let s;
    try { s = JSON.parse(fs.readFileSync(p, "utf8")); }
    catch (e) { missing.push(`${o.id}(JSON invalido)`); continue; }
    const lacks = REQ.filter((f) => s[f] === undefined);
    if (lacks.length) { missing.push(`${o.id}(falta ${lacks.join("/")})`); continue; }
    subs.push(s);
  }

  const newTrack = {
    ...orig,
    subtopics: subs,
    estimatedHours: subs.reduce((a, s) => a + (s.estimatedHours || 0), 0),
  };

  const exs = subs.reduce((a, s) => a + (s.exercises?.length || 0), 0);
  const sols = subs.reduce((a, s) => a + (s.exercises || []).filter((e) => e.solution).length, 0);
  const roads = subs.filter((s) => s.studyRoadmap).length;

  fs.writeFileSync(path.join(deep, `${tid}.json`), JSON.stringify(newTrack, null, 2));
  const flag = missing.length ? "⚠" : "✓";
  if (missing.length) allGood = false;
  console.log(`${flag} ${tid}: ${orig.subtopics.length} -> ${subs.length} aulas (${newTrack.estimatedHours}h) · ${exs} ex, ${sols} c/ solucao, ${roads} roteiros${missing.length ? ` · FALTAM: ${missing.join(", ")}` : ""}`);
}

console.log(allGood ? "\nOK — staging completo e sem buracos." : "\n⚠ Ha buracos; re-rodar as aulas faltantes antes de aplicar.");
process.exitCode = allGood ? 0 : 2;
