// Mescla plan/enrich/history-staging/<trackId>.json (saída do workflow de
// autoria+verificação de história) nos patches oficiais plan/enrich/<trackId>.json,
// que são a ÚNICA porta de entrada de conteúdo (via apply-enrichment.mjs).
//
// Regras:
//  - só adiciona `history` a entradas de subtópico que ainda não têm history no patch;
//  - cria a entrada { id } no patch se o subtópico ainda não constar;
//  - valida que cada id staged existe na trilha real (data/curriculum/tracks) — id
//    desconhecido é ERRO (aborta o arquivo, exit 2) para nunca mascarar typo;
//  - valida KaTeX: contagem de "$" por texto deve ser par (o validate-curriculum
//    também checa, mas falhar cedo aqui dá mensagem melhor);
//  - nunca toca nos outros campos do patch.
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const stagingDir = path.join(root, "plan", "enrich", "history-staging");
const enrichDir = path.join(root, "plan", "enrich");
const tracksDir = path.join(root, "data", "curriculum", "tracks");

if (!fs.existsSync(stagingDir)) {
  console.error("Sem plan/enrich/history-staging — nada para mesclar.");
  process.exit(1);
}

const files = fs.readdirSync(stagingDir).filter((f) => f.endsWith(".json"));
let merged = 0;
let skippedExisting = 0;
const errors = [];

for (const f of files) {
  const trackId = f.replace(".json", "");
  const trackPath = path.join(tracksDir, `${trackId}.json`);
  if (!fs.existsSync(trackPath)) {
    errors.push(`${trackId}: trilha inexistente`);
    continue;
  }

  let staged, track;
  try {
    staged = JSON.parse(fs.readFileSync(path.join(stagingDir, f), "utf8"));
    track = JSON.parse(fs.readFileSync(trackPath, "utf8"));
  } catch (e) {
    errors.push(`${trackId}: JSON inválido — ${e.message}`);
    continue;
  }

  const validIds = new Set(track.subtopics.map((s) => s.id));
  const entries = staged.subtopics ?? [];
  const bad = entries.filter((s) => !validIds.has(s.id));
  if (bad.length) {
    errors.push(`${trackId}: ids desconhecidos no staging: ${bad.map((b) => b.id).join(", ")}`);
    continue;
  }
  const unbalanced = entries.filter(
    (s) => typeof s.history === "string" && (s.history.match(/\$/g) ?? []).length % 2 !== 0
  );
  if (unbalanced.length) {
    errors.push(`${trackId}: KaTeX desbalanceado em: ${unbalanced.map((b) => b.id).join(", ")}`);
    continue;
  }

  const enrichPath = path.join(enrichDir, `${trackId}.json`);
  const patch = fs.existsSync(enrichPath)
    ? JSON.parse(fs.readFileSync(enrichPath, "utf8"))
    : {};
  patch.subtopics = patch.subtopics ?? [];
  const byId = new Map(patch.subtopics.map((s) => [s.id, s]));

  let local = 0;
  for (const s of entries) {
    if (!s.history || !String(s.history).trim()) continue;
    let target = byId.get(s.id);
    if (!target) {
      target = { id: s.id };
      patch.subtopics.push(target);
      byId.set(s.id, target);
    }
    if (target.history && String(target.history).trim()) {
      skippedExisting++;
      continue;
    }
    target.history = s.history;
    local++;
  }

  if (local > 0) {
    fs.writeFileSync(enrichPath, JSON.stringify(patch, null, 2) + "\n");
    merged += local;
    console.log(`✓ ${trackId}: ${local} histórias mescladas no patch`);
  }
}

console.log(`\n${merged} histórias mescladas${skippedExisting ? `, ${skippedExisting} já existiam no patch` : ""}`);
if (errors.length) {
  console.error("\n✗ erros (nada desses arquivos foi gravado):");
  errors.forEach((e) => console.error("  - " + e));
  process.exitCode = 2;
}
