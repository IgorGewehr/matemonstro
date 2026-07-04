// Sincroniza CORREÇÕES de history do staging (plan/enrich/history-staging/,
// fonte de verdade editada pelo passe de verificação) para as trilhas em
// data/curriculum/tracks/. Diferente do apply-enrichment (só-se-ausente), este
// SOBRESCREVE o campo history quando o texto do staging difere — e SÓ esse
// campo. Trava de segurança: contagens de subs/exs/cards não podem mudar.
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const stagingDir = path.join(root, "plan", "enrich", "history-staging");
const tracksDir = path.join(root, "data", "curriculum", "tracks");

const counts = (t) => ({
  subs: t.subtopics.length,
  exs: t.subtopics.reduce((s, x) => s + (x.exercises?.length || 0), 0),
  cards: t.subtopics.reduce((s, x) => s + (x.flashcards?.length || 0), 0),
});

const files = fs.readdirSync(stagingDir).filter((f) => f.endsWith(".json"));
let updated = 0;
const errors = [];

for (const f of files) {
  const trackId = f.replace(".json", "");
  const trackPath = path.join(tracksDir, `${trackId}.json`);
  if (!fs.existsSync(trackPath)) continue;

  let staged, track;
  try {
    staged = JSON.parse(fs.readFileSync(path.join(stagingDir, f), "utf8"));
    track = JSON.parse(fs.readFileSync(trackPath, "utf8"));
  } catch (e) {
    errors.push(`${trackId}: JSON inválido — ${e.message}`);
    continue;
  }

  const before = counts(track);
  const byId = new Map(track.subtopics.map((s) => [s.id, s]));
  let local = 0;
  for (const s of staged.subtopics ?? []) {
    if (!s.history || !String(s.history).trim()) continue;
    if ((s.history.match(/\$/g) ?? []).length % 2 !== 0) {
      errors.push(`${trackId}/${s.id}: KaTeX desbalanceado no staging — pulado`);
      continue;
    }
    const sub = byId.get(s.id);
    if (!sub) continue;
    if (sub.history !== s.history) {
      sub.history = s.history;
      local++;
    }
  }

  const after = counts(track);
  if (after.subs !== before.subs || after.exs !== before.exs || after.cards !== before.cards) {
    errors.push(`${trackId}: contagem mudou — não gravado`);
    continue;
  }
  if (local > 0) {
    fs.writeFileSync(trackPath, JSON.stringify(track, null, 2) + "\n");
    updated += local;
    console.log(`✓ ${trackId}: ${local} history atualizados`);
  }
}

console.log(`\n${updated} textos sincronizados`);
if (errors.length) {
  console.error("✗ problemas:");
  errors.forEach((e) => console.error("  - " + e));
  process.exitCode = 2;
}
