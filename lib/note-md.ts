// Serialização nota ↔ arquivo .md (frontmatter YAML simples + corpo com
// [[wikilinks]] intactos). É o MESMO formato do export de vault Obsidian
// (lib/vault-export.ts importa slugFilename daqui) + o campo `id:` que mantém
// hrefs/backlinks estáveis através de renames de arquivo.
//
// O parser é hand-rolled e TOLERANTE de propósito: o formato é nosso, mas o
// vault pode ser editado no Obsidian — chaves desconhecidas (aliases, cssclass
// etc.) são preservadas byte a byte no round-trip (campo `extra`). Nunca
// perdemos dado do usuário ao reescrever um arquivo.

import type { Note } from "./types";
import { allTagsOf } from "./notes";

/** Nome de arquivo seguro a partir do título (sem acentos/caracteres proibidos). */
export function slugFilename(title: string): string {
  const s = (title || "nota")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    // travessões viram hífen: unzip antigos (macOS/Windows) engasgam com eles no nome
    .replace(/[—–]/g, "-")
    .replace(/[\\/:*?"<>|#^[\]]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return s || "nota";
}

const KNOWN_KEYS = new Set(["id", "title", "tags", "created", "updated", "aula"]);

export interface ParsedNoteMd {
  note: Note;
  /** Linhas de frontmatter desconhecidas (ex.: aliases do Obsidian), preservadas no round-trip. */
  extra: string[];
}

/** Nota → conteúdo .md (frontmatter + corpo). */
export function serializeNote(note: Note, extra: string[] = []): string {
  const tags = allTagsOf(note);
  const lines = [
    "---",
    `id: ${note.id}`,
    `title: "${(note.title || "Sem título").replace(/"/g, '\\"')}"`,
    `tags: [${tags.join(", ")}]`,
    `created: ${new Date(note.createdAt).toISOString()}`,
    `updated: ${new Date(note.updatedAt).toISOString()}`,
    ...(note.subtopicId ? [`aula: ${note.subtopicId}`] : []),
    ...extra,
    "---",
    "",
  ];
  return lines.join("\n") + (note.body ?? "") + "\n";
}

function parseTitle(raw: string): string {
  const t = raw.trim();
  if (t.startsWith('"') && t.endsWith('"') && t.length >= 2) {
    return t.slice(1, -1).replace(/\\"/g, '"');
  }
  return t;
}

function parseTags(raw: string): string[] {
  const t = raw.trim().replace(/^\[/, "").replace(/\]$/, "");
  return t
    .split(",")
    .map((x) => x.trim().replace(/^["']|["']$/g, ""))
    .filter(Boolean);
}

function parseDate(raw: string, fallback: number): number {
  const ts = Date.parse(raw.trim());
  return Number.isFinite(ts) ? ts : fallback;
}

/**
 * Arquivo .md → nota. Sem frontmatter: o conteúdo inteiro vira corpo, o título
 * vem do nome do arquivo e o id é `f:<basename>` (estável; um uuid NÃO é
 * atribuído aqui — nunca reescrevemos arquivo do usuário em leitura).
 */
export function parseNoteMd(filename: string, content: string, mtimeMs: number): ParsedNoteMd {
  const basename = filename.replace(/\.md$/i, "");
  const fallback: Note = {
    id: `f:${basename}`,
    title: basename,
    body: content,
    tags: [],
    subtopicId: null,
    createdAt: mtimeMs,
    updatedAt: mtimeMs,
    deleted: false,
  };

  if (!content.startsWith("---")) return { note: fallback, extra: [] };
  const firstBreak = content.indexOf("\n");
  if (firstBreak === -1) return { note: fallback, extra: [] };
  const end = content.indexOf("\n---", firstBreak);
  if (end === -1) return { note: fallback, extra: [] };

  const head = content.slice(firstBreak + 1, end);
  let body = content.slice(end + "\n---".length);
  // remove UMA quebra dupla de abertura (a que o serializer emite)
  body = body.replace(/^\r?\n\r?\n?/, "");
  // o serializer sempre termina com \n único
  if (body.endsWith("\n")) body = body.slice(0, -1);

  const note: Note = { ...fallback, body };
  const extra: string[] = [];
  for (const line of head.split("\n")) {
    const m = line.match(/^([A-Za-z_][\w-]*):\s?(.*)$/);
    if (!m) {
      if (line.trim()) extra.push(line);
      continue;
    }
    const [, key, value] = m;
    switch (KNOWN_KEYS.has(key) ? key : "?") {
      case "id":
        if (value.trim()) note.id = value.trim();
        break;
      case "title":
        note.title = parseTitle(value);
        break;
      case "tags":
        note.tags = parseTags(value);
        break;
      case "created":
        note.createdAt = parseDate(value, mtimeMs);
        break;
      case "updated":
        note.updatedAt = parseDate(value, mtimeMs);
        break;
      case "aula":
        note.subtopicId = value.trim() || null;
        break;
      default:
        extra.push(line);
    }
  }
  return { note, extra };
}
