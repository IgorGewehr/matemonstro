// Portao de qualidade do curriculo (gap-analysis rank 4).
// Roda ANTES do bundle/build (ver package.json). Sai != 0 em qualquer FALHA,
// entao conteudo invalido nao chega a producao. Avisos (WARN) nao quebram o build.
//
// FALHAS (quebram o build):
//   - JSON invalido
//   - campos obrigatorios de trilha/subtopico ausentes
//   - id de subtopico duplicado (global) — o progresso do usuario e chaveado por id
//   - sub.prereqs apontando para id inexistente (chip quebrado na UI)
//   - campo desconhecido (fora do schema de types.ts) — pega orfaos tipo summary2
//   - figura malformada (kind fora do enum, ou sem expr)
//   - exercise.source / examBank com shape invalido
//
// AVISOS (nao quebram): desbalanceamento de $…$/$$ (KaTeX), subtopico sem flashcards.
//
// Uso: node scripts/validate-curriculum.mjs
import fs from "node:fs";
import path from "node:path";
import { validateFigure } from "./lib/figure-expr.mjs";

const root = process.cwd();
const tracksDir = path.join(root, "data", "curriculum", "tracks");

// Allowlist derivada de lib/types.ts. Ao adicionar um campo novo ao conteudo,
// inclua-o aqui E no tipo correspondente (mantidos em sincronia de proposito).
const TRACK_ALLOWED = new Set([
  "id", "title", "phase", "phaseLabel", "tagline", "summary", "bigPicture",
  "prereqs", "difficulty", "estimatedHours", "primaryBooks", "freeResources",
  "examRelevance", "subtopics", "examBank", "formulaSheet", "glossary",
]);
const SUB_ALLOWED = new Set([
  "id", "title", "tagline", "objectives", "keyConcepts", "theorems", "summary",
  "commonPitfalls", "worked", "exercises", "flashcards", "estimatedHours",
  "resources", "history", "prereqs", "figures", "studyRoadmap",
]);
const TRACK_REQUIRED = ["id", "title", "phase", "summary", "subtopics"];
const SUB_REQUIRED = ["id", "title", "objectives", "summary", "flashcards"];

if (!fs.existsSync(tracksDir)) {
  console.error("Sem pasta de trilhas. Nada a validar.");
  process.exit(1);
}

const files = fs.readdirSync(tracksDir).filter((f) => f.endsWith(".json"));

// ---- Passe 1: parse + colher todos os ids (para integridade referencial) ----
const parsed = [];
const allSubIds = new Set();
const idOwner = new Map(); // id -> arquivo (para achar duplicatas)
const fails = [];
const warns = [];

const FAIL = (f, msg) => fails.push(`✗ ${f}: ${msg}`);
const WARN = (f, msg) => warns.push(`⚠ ${f}: ${msg}`);

for (const f of files) {
  let t;
  try {
    t = JSON.parse(fs.readFileSync(path.join(tracksDir, f), "utf8"));
  } catch (e) {
    FAIL(f, `JSON INVALIDO — ${e.message}`);
    continue;
  }
  parsed.push({ f, t });
  for (const s of t.subtopics ?? []) {
    if (!s || typeof s.id !== "string") continue;
    if (allSubIds.has(s.id)) FAIL(f, `id de subtopico DUPLICADO: "${s.id}" (tambem em ${idOwner.get(s.id)})`);
    allSubIds.add(s.id);
    idOwner.set(s.id, f);
  }
}

// Conta $ nao-escapados e delimitadores $$ balanceados numa string.
function katexIssue(str) {
  if (typeof str !== "string" || str.indexOf("$") === -1) return null;
  const noEsc = str.replace(/\\\$/g, "");
  const dd = (noEsc.match(/\$\$/g) || []).length;
  if (dd % 2 !== 0) return "$$ display nao balanceado";
  const single = (noEsc.replace(/\$\$/g, "").match(/\$/g) || []).length;
  if (single % 2 !== 0) return "$ inline nao balanceado";
  return null;
}

// ---- Passe 2: validacao estrutural + referencial ----
for (const { f, t } of parsed) {
  for (const fld of TRACK_REQUIRED) if (t[fld] === undefined) FAIL(f, `falta campo de trilha "${fld}"`);
  for (const k of Object.keys(t)) if (!TRACK_ALLOWED.has(k)) FAIL(f, `campo de trilha DESCONHECIDO "${k}" (fora do schema)`);

  // examBank (nivel trilha)
  if (t.examBank !== undefined) {
    if (!Array.isArray(t.examBank)) FAIL(f, `examBank deve ser array`);
    else t.examBank.forEach((q, i) => {
      if (typeof q.prompt !== "string" || !q.prompt.trim()) FAIL(f, `examBank[${i}] sem prompt`);
      if (q.source && typeof q.source.exam !== "string") FAIL(f, `examBank[${i}].source sem "exam"`);
      // Sem solucao, a questao nao entra no /simulado (que precisa de gabarito).
      if (typeof q.solution !== "string" || !q.solution.trim()) WARN(f, `examBank[${i}] sem solution (fica fora do /simulado)`);
      const pIss = katexIssue(q.prompt); if (pIss) WARN(f, `examBank[${i}].prompt: ${pIss}`);
      const sIss = katexIssue(q.solution); if (sIss) WARN(f, `examBank[${i}].solution: ${sIss}`);
    });
  }
  if (t.glossary !== undefined && !Array.isArray(t.glossary)) FAIL(f, `glossary deve ser array`);
  if (t.formulaSheet !== undefined) {
    if (typeof t.formulaSheet !== "string") FAIL(f, `formulaSheet deve ser string`);
    else { const iss = katexIssue(t.formulaSheet); if (iss) WARN(f, `formulaSheet: ${iss}`); }
  }

  if (!Array.isArray(t.subtopics)) continue;
  t.subtopics.forEach((s, i) => {
    const tag = `sub[${i}] ${s?.id ?? "?"}`;
    for (const fld of SUB_REQUIRED) if (s[fld] === undefined) FAIL(f, `${tag} falta "${fld}"`);
    for (const k of Object.keys(s)) if (!SUB_ALLOWED.has(k)) FAIL(f, `${tag} campo DESCONHECIDO "${k}" (fora do schema)`);

    // Integridade referencial dos pre-requisitos.
    for (const p of s.prereqs ?? []) {
      if (!allSubIds.has(p)) FAIL(f, `${tag} prereq inexistente: "${p}"`);
    }

    // Figuras — compila expr/overlay como o renderer faz (pega figura quebrada).
    for (const [j, fig] of (s.figures ?? []).entries()) {
      for (const p of validateFigure(fig)) FAIL(f, `${tag} figures[${j}]: ${p}`);
      const capIssue = katexIssue(fig?.caption);
      if (capIssue) WARN(f, `${tag} figures[${j}].caption: ${capIssue}`);
    }

    // Exercicios: source shape (se presente).
    for (const [j, ex] of (s.exercises ?? []).entries()) {
      if (ex?.source && typeof ex.source.exam !== "string") FAIL(f, `${tag} exercises[${j}].source sem "exam"`);
    }

    // KaTeX (aviso).
    const katexFields = [s.summary, s.worked, s.history, ...(s.objectives ?? []), ...(s.commonPitfalls ?? [])];
    for (const th of s.theorems ?? []) katexFields.push(th.statement, th.whyItMatters);
    for (const ex of s.exercises ?? []) katexFields.push(ex.prompt, ex.hint, ex.solution);
    for (const fc of s.flashcards ?? []) katexFields.push(fc.front, fc.back);
    for (const val of katexFields) {
      const issue = katexIssue(val);
      if (issue) { WARN(f, `${tag}: ${issue}`); break; }
    }

    if (Array.isArray(s.flashcards) && s.flashcards.length === 0) WARN(f, `${tag} sem flashcards`);
  });
}

// ---- Relatorio ----
console.log(`Validando ${files.length} trilha(s) · ${allSubIds.size} subtopicos…\n`);
if (warns.length) {
  console.warn(`${warns.length} aviso(s):`);
  warns.slice(0, 40).forEach((w) => console.warn("  " + w));
  if (warns.length > 40) console.warn(`  … +${warns.length - 40}`);
  console.warn("");
}
if (fails.length) {
  console.error(`${fails.length} FALHA(S) — build bloqueado:`);
  fails.forEach((e) => console.error("  " + e));
  process.exit(2);
}
console.log(`✓ Curriculo integro: ${files.length} trilhas, ${allSubIds.size} subtopicos, 0 falhas.`);
