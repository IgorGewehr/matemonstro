/*
 * Exportação para Anki (TSV: front<TAB>back<TAB>tags).
 *
 * Gera um texto TSV importável no Anki a partir dos flashcards do currículo,
 * preservando o LaTeX original ($...$ / $$...$$). Cada nota recebe as tags
 * hierárquicas `matemonstro`, `matemonstro::<trackId>` e
 * `matemonstro::<trackId>::<subId>` para filtrar por trilha/subtópico.
 *
 * Sem dependência externa: apenas transforma o currículo em string. O download
 * (Blob) fica na página de config, reusando o padrão já existente.
 */
import { tracks as allTracks } from "./curriculum";
import type { Track } from "./types";

/**
 * Normaliza um campo para uma célula TSV de uma linha só: remove tabs e quebras
 * (que separariam colunas/notas), preservando o texto/LaTeX. Anki importa cada
 * linha como uma nota; \t separa os campos.
 */
function cell(text: string): string {
  return (text ?? "")
    .replace(/\r\n?|\n/g, " ")
    .replace(/\t/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function tagsFor(trackId: string, subId: string): string {
  // Tags separadas por espaço; `::` é a hierarquia do Anki.
  return [
    "matemonstro",
    `matemonstro::${trackId}`,
    `matemonstro::${trackId}::${subId}`,
  ].join(" ");
}

export interface AnkiExportOptions {
  /** Se informado, exporta só essa trilha; senão, o currículo inteiro. */
  trackId?: string;
  /** Incluir as linhas de diretiva `#separator`/`#tags column` (default true). */
  header?: boolean;
}

/** Número de flashcards que seriam exportados (para rótulos de botão). */
export function ankiCardCount(trackId?: string): number {
  const list = trackId ? allTracks.filter((t) => t.id === trackId) : allTracks;
  return list.reduce(
    (sum, t) => sum + t.subtopics.reduce((s, sub) => s + (sub.flashcards?.length ?? 0), 0),
    0
  );
}

/**
 * Constrói o TSV. Linhas de diretiva no topo ajudam o Anki a interpretar
 * separador e coluna de tags automaticamente na importação.
 */
export function toAnkiTsv(opts: AnkiExportOptions = {}): string {
  const { trackId, header = true } = opts;
  const list: Track[] = trackId ? allTracks.filter((t) => t.id === trackId) : allTracks;

  const rows: string[] = [];
  for (const track of list) {
    for (const sub of track.subtopics) {
      for (const fc of sub.flashcards ?? []) {
        const front = cell(fc.front);
        const back = cell(fc.back);
        if (!front && !back) continue;
        rows.push(`${front}\t${back}\t${tagsFor(track.id, sub.id)}`);
      }
    }
  }

  const lines: string[] = [];
  if (header) {
    lines.push("#separator:tab");
    lines.push("#html:false");
    lines.push("#columns:Front\tBack\tTags");
    lines.push("#tags column:3");
  }
  lines.push(...rows);
  return lines.join("\n") + "\n";
}

/** Nome de arquivo sugerido para o download. */
export function ankiFileName(trackId?: string): string {
  const scope = trackId ? trackId : "curriculo";
  const day = new Date().toISOString().slice(0, 10);
  return `matemonstro-anki-${scope}-${day}.tsv`;
}
