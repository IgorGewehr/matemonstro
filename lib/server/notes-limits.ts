import "server-only";

// Limites de tamanho para notas (anti abuso/bug do cliente).
export const NOTE_TITLE_MAX = 300;
export const NOTE_BODY_MAX = 200_000; // ~200 KB de markdown
export const NOTE_TAGS_MAX = 50;
export const NOTE_TAG_LEN_MAX = 60;

export interface NoteFieldInput {
  title?: unknown;
  body?: unknown;
  tags?: unknown;
}

/** Valida campos de nota; devolve mensagem de erro ou null se ok. */
export function noteFieldsError(input: NoteFieldInput): string | null {
  if (typeof input.title === "string" && input.title.length > NOTE_TITLE_MAX) {
    return `titulo com mais de ${NOTE_TITLE_MAX} caracteres`;
  }
  if (typeof input.body === "string" && input.body.length > NOTE_BODY_MAX) {
    return "corpo da nota grande demais";
  }
  if (Array.isArray(input.tags)) {
    if (input.tags.length > NOTE_TAGS_MAX) return "tags demais";
    for (const t of input.tags) {
      if (typeof t !== "string" || t.length > NOTE_TAG_LEN_MAX) return "tag invalida";
    }
  }
  return null;
}
