// Wrapper server: pré-gera os shells estáticos das 261 aulas (necessário para
// output:"export" no alvo desktop). Conteúdo real em client.tsx (inalterado).
import { readFileSync } from "node:fs";
import { join } from "node:path";
import StudyClient from "./client";

export function generateStaticParams() {
  const data = JSON.parse(
    readFileSync(join(process.cwd(), "public", "curriculum-data.json"), "utf8")
  ) as { tracks: { id: string; subtopics: { id: string }[] }[] };
  return data.tracks.flatMap((t) => t.subtopics.map((s) => ({ trackId: t.id, subId: s.id })));
}

export default function Page() {
  return <StudyClient />;
}
