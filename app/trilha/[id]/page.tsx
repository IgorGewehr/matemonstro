// Wrapper server: pré-gera os shells estáticos das 27 trilhas (necessário para
// output:"export" no alvo desktop; no web é um hint de SSG inofensivo). A fonte
// dos ids é public/curriculum-data.json — `npm run bundle` roda antes do build
// nos dois alvos. Todo o conteúdo real vive em client.tsx (inalterado).
import { readFileSync } from "node:fs";
import { join } from "node:path";
import TrilhaClient from "./client";

export function generateStaticParams() {
  const data = JSON.parse(
    readFileSync(join(process.cwd(), "public", "curriculum-data.json"), "utf8")
  ) as { tracks: { id: string }[] };
  return data.tracks.map((t) => ({ id: t.id }));
}

export default function Page() {
  return <TrilhaClient />;
}
