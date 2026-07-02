// Gera data/curriculum/index.json (plano/fases/prelims) a partir das trilhas.
// Ordem global por ordenação topológica dos pré-requisitos; ifConcursoCore vem
// do examRelevance real de cada trilha. Curadoria (metas, marcos) é fixa aqui.
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const tracksDir = path.join(root, "data", "curriculum", "tracks");
const files = fs.readdirSync(tracksDir).filter((f) => f.endsWith(".json"));
const tracks = files.map((f) => JSON.parse(fs.readFileSync(path.join(tracksDir, f), "utf8")));
const byId = new Map(tracks.map((t) => [t.id, t]));

// ordem preferida (tiebreak) = ordem pedagógica desejada
const preferred = [
  "fundamentos", "prova", "calculo1", "calculo2", "algebra-linear", "calculo3",
  "analise-real-1", "algebra-abstrata-1", "combinatoria", "teoria-numeros",
  "analise-real-2", "edo", "analise-complexa", "topologia", "algebra-abstrata-2",
  "prob-estatistica", "medida", "teoria-galois", "geometria-diferencial",
  "analise-funcional", "topologia-algebrica", "algebra-comutativa",
  "teoria-representacao", "edp", "logica-conjuntos", "geometria-algebrica", "category-theory",
];
const rank = (id) => {
  const i = preferred.indexOf(id);
  return i === -1 ? 999 : i;
};

// ----- ordenação topológica (Kahn) respeitando prereqs, tiebreak por rank -----
const indeg = new Map(tracks.map((t) => [t.id, 0]));
for (const t of tracks) for (const p of t.prereqs) if (byId.has(p)) indeg.set(t.id, indeg.get(t.id) + 1);
const done = new Set();
const recommendedOrder = [];
while (recommendedOrder.length < tracks.length) {
  const ready = tracks
    .filter((t) => !done.has(t.id) && t.prereqs.every((p) => !byId.has(p) || done.has(p)))
    .sort((a, b) => a.phase - b.phase || rank(a.id) - rank(b.id));
  if (!ready.length) {
    // ciclo ou prereq faltante: empurra o resto pelo rank
    tracks.filter((t) => !done.has(t.id)).sort((a, b) => rank(a.id) - rank(b.id)).forEach((t) => {
      recommendedOrder.push(t.id);
      done.add(t.id);
    });
    break;
  }
  const next = ready[0];
  recommendedOrder.push(next.id);
  done.add(next.id);
}

const phaseIds = (ph) => recommendedOrder.filter((id) => byId.get(id)?.phase === ph);

const phases = [
  {
    id: 0,
    label: "Fundações",
    goal: "A base inquebrável: lógica, demonstração, cálculo e álgebra linear. Aqui você aprende a pensar e a escrever como matemático — sem isso, o resto desaba.",
    trackIds: phaseIds(0),
  },
  {
    id: 1,
    label: "Núcleo",
    goal: "O coração do bacharelado: análise real, álgebra abstrata e topologia, mais as grandes áreas clássicas. É o que decide aprovação em mestrado.",
    trackIds: phaseIds(1),
  },
  {
    id: 2,
    label: "Avançado / Pré-Pós",
    goal: "Nível de pós-graduação: medida, análise funcional, Galois, topologia algébrica, geometria diferencial e além. Aqui você vira um monstro de verdade.",
    trackIds: phaseIds(2),
  },
];

const prelimMap = {
  analise: ["analise-real-1", "analise-real-2", "analise-complexa", "medida", "analise-funcional", "edp"].filter((id) => byId.has(id)),
  algebra: ["algebra-linear", "algebra-abstrata-1", "algebra-abstrata-2", "teoria-galois", "algebra-comutativa", "teoria-numeros", "teoria-representacao"].filter((id) => byId.has(id)),
  topologiaGeometria: ["topologia", "topologia-algebrica", "geometria-diferencial", "geometria-algebrica"].filter((id) => byId.has(id)),
};

// núcleo de concurso IF: examRelevance.ifConcurso >= 4, na ordem recomendada
const ifConcursoCore = recommendedOrder.filter((id) => (byId.get(id)?.examRelevance?.ifConcurso ?? 0) >= 4);

const milestones = [
  { after: "prova", label: "🧠 Pensador matemático", youCanNow: "Você lê e escreve demonstrações formais com rigor — indução, contradição, quantificadores." },
  { after: "calculo3", label: "📈 Cálculo dominado", youCanNow: "Cálculo de uma a várias variáveis no sangue: a base operacional de quase toda a matemática." },
  { after: "analise-real-1", label: "🔬 Analista nascendo", youCanNow: "ε–δ, sequências, séries, compacidade e conexidade: o vocabulário do rigor." },
  { after: "algebra-abstrata-2", label: "🧩 Algebrista", youCanNow: "Grupos, anéis e corpos: você enxerga a estrutura por trás dos números." },
  { after: "topologia", label: "🌐 Topólogo", youCanNow: "Pensa em espaços abstratos, continuidade e compacidade sem depender de coordenadas." },
  { after: "analise-funcional", label: "🎓 Pronto para o mestrado", youCanNow: "Análise de pós no bolso — você encara os prelims de análise de frente." },
  { after: "category-theory", label: "👑 Visão de cima", youCanNow: "Enxerga as conexões entre todas as áreas. Monstro da matemática, modo completo." },
].filter((m) => byId.has(m.after));

const notes =
  "Estude na ordem das fases — cada trilha libera a próxima. Faça as revisões espaçadas TODO dia: é o que transforma estudo em memória permanente. Ao fechar cada aula, anote 'o principal' com suas palavras (active recall). Para concurso de IF, priorize o núcleo de concurso; para mestrado, mire os três prelims: análise, álgebra e topologia/geometria.";

const index = { phases, recommendedOrder, prelimMap, ifConcursoCore, milestones, notes };
fs.writeFileSync(path.join(root, "data", "curriculum", "index.json"), JSON.stringify(index, null, 2));

console.log("✓ index.json gerado");
console.log("  ordem:", recommendedOrder.join(" → "));
console.log("  ifConcursoCore:", ifConcursoCore.join(", "));
console.log("  prelims: análise(" + prelimMap.analise.length + ") álgebra(" + prelimMap.algebra.length + ") topo/geo(" + prelimMap.topologiaGeometria.length + ")");
