// Wrapper server: shells estáticos do resumo das 27 trilhas (ver ../page.tsx).
import { readFileSync } from "node:fs";
import { join } from "node:path";
import ResumoClient from "./client";

export function generateStaticParams() {
  const data = JSON.parse(
    readFileSync(join(process.cwd(), "public", "curriculum-data.json"), "utf8")
  ) as { tracks: { id: string }[] };
  return data.tracks.map((t) => ({ id: t.id }));
}

export default function Page() {
  return <ResumoClient />;
}
