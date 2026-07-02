// Valida cada arquivo de trilha: JSON parseável + campos esperados.
// Uso: node scripts/validate-curriculum.mjs
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const tracksDir = path.join(root, "data", "curriculum", "tracks");

const TRACK_FIELDS = ["id", "title", "phase", "summary", "subtopics"];
const SUB_FIELDS = ["id", "title", "objectives", "summary", "flashcards"];

if (!fs.existsSync(tracksDir)) {
  console.error("Sem pasta de trilhas. Nada a validar ainda.");
  process.exit(1);
}

const files = fs.readdirSync(tracksDir).filter((f) => f.endsWith(".json"));
let broken = 0;
let warns = 0;

console.log(`Validando ${files.length} trilha(s)…\n`);

for (const f of files) {
  const p = path.join(tracksDir, f);
  const raw = fs.readFileSync(p, "utf8");
  let t;
  try {
    t = JSON.parse(raw);
  } catch (e) {
    console.error(`✗ ${f}: JSON INVÁLIDO — ${e.message}`);
    broken++;
    continue;
  }
  const issues = [];
  for (const fld of TRACK_FIELDS) if (t[fld] === undefined) issues.push(`falta "${fld}"`);
  if (Array.isArray(t.subtopics)) {
    t.subtopics.forEach((s, i) => {
      for (const fld of SUB_FIELDS) if (s[fld] === undefined) issues.push(`sub[${i}] falta "${fld}"`);
      if (Array.isArray(s.flashcards) && s.flashcards.length === 0) issues.push(`sub[${i}] sem flashcards`);
    });
  }
  if (issues.length) {
    console.warn(`⚠ ${f}: ${issues.slice(0, 6).join("; ")}${issues.length > 6 ? " …" : ""}`);
    warns++;
  } else {
    console.log(`✓ ${f} (${t.subtopics.length} subtópicos)`);
  }
}

console.log(`\n${files.length - broken - warns} ok, ${warns} com avisos, ${broken} quebrados.`);
if (broken) process.exit(2);
