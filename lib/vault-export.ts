// Export de vault Obsidian: um .md por nota (frontmatter YAML + corpo com os
// [[wikilinks]] intactos — o Obsidian entende nativamente), empacotado num
// .zip SEM dependências: ZIP "stored" (método 0, sem compressão) com CRC-32.
// Markdown comprime pouco e as notas são pequenas; simplicidade > bytes.

import type { Note } from "./types";
import { allTagsOf } from "./notes";

// ---- CRC-32 (tabela padrão, polinômio 0xEDB88320) ----
const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(data: Uint8Array): number {
  let c = 0xffffffff;
  for (let i = 0; i < data.length; i++) c = CRC_TABLE[(c ^ data[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

// Data/hora no formato DOS exigido pelo ZIP.
function dosDateTime(ts: number): { time: number; date: number } {
  const d = new Date(ts);
  const time = (d.getHours() << 11) | (d.getMinutes() << 5) | Math.floor(d.getSeconds() / 2);
  const date = (Math.max(0, d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate();
  return { time, date };
}

export interface VaultFile {
  name: string;
  content: string;
  mtime: number;
}

/** Empacota arquivos num .zip (método stored, nomes em UTF-8). */
export function buildZip(files: VaultFile[]): Blob {
  const enc = new TextEncoder();
  const chunks: Uint8Array[] = [];
  const central: Uint8Array[] = [];
  let offset = 0;

  const u16 = (v: number) => new Uint8Array([v & 0xff, (v >> 8) & 0xff]);
  const u32 = (v: number) =>
    new Uint8Array([v & 0xff, (v >>> 8) & 0xff, (v >>> 16) & 0xff, (v >>> 24) & 0xff]);
  const cat = (...parts: Uint8Array[]) => {
    const total = parts.reduce((n, p) => n + p.length, 0);
    const out = new Uint8Array(total);
    let o = 0;
    for (const p of parts) {
      out.set(p, o);
      o += p.length;
    }
    return out;
  };

  for (const f of files) {
    const name = enc.encode(f.name);
    const data = enc.encode(f.content);
    const crc = crc32(data);
    const { time, date } = dosDateTime(f.mtime);

    // Local file header (flag 0x0800 = nomes UTF-8)
    const local = cat(
      u32(0x04034b50),
      u16(20),
      u16(0x0800),
      u16(0),
      u16(time),
      u16(date),
      u32(crc),
      u32(data.length),
      u32(data.length),
      u16(name.length),
      u16(0),
      name,
      data
    );
    chunks.push(local);

    central.push(
      cat(
        u32(0x02014b50),
        u16(20),
        u16(20),
        u16(0x0800),
        u16(0),
        u16(time),
        u16(date),
        u32(crc),
        u32(data.length),
        u32(data.length),
        u16(name.length),
        u16(0),
        u16(0),
        u16(0),
        u16(0),
        u32(0),
        u32(offset),
        name
      )
    );
    offset += local.length;
  }

  const centralStart = offset;
  const centralBytes = cat(...central, new Uint8Array(0));
  const eocd = cat(
    u32(0x06054b50),
    u16(0),
    u16(0),
    u16(files.length),
    u16(files.length),
    u32(centralBytes.length),
    u32(centralStart),
    u16(0)
  );

  return new Blob([cat(...chunks, new Uint8Array(0)), centralBytes, eocd], { type: "application/zip" });
}

function slugFilename(title: string): string {
  const s = (title || "nota")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    // travess\u00f5es viram h\u00edfen: unzip antigos (macOS/Windows) engasgam com eles no nome
    .replace(/[\u2014\u2013]/g, "-")
    .replace(/[\\/:*?"<>|#^[\]]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return s || "nota";
}

/** Converte as notas vivas em arquivos .md (frontmatter + corpo intacto), com nomes únicos. */
export function notesToVaultFiles(notes: Note[]): VaultFile[] {
  const used = new Map<string, number>();
  const out: VaultFile[] = [];
  const live = notes.filter((n) => !n.deleted);
  for (const n of live) {
    let base = slugFilename(n.title);
    const count = used.get(base.toLowerCase()) ?? 0;
    used.set(base.toLowerCase(), count + 1);
    if (count > 0) base = `${base} ${count + 1}`;

    const tags = allTagsOf(n);
    const front = [
      "---",
      `title: "${(n.title || "Sem título").replace(/"/g, '\\"')}"`,
      `tags: [${tags.join(", ")}]`,
      `created: ${new Date(n.createdAt).toISOString()}`,
      `updated: ${new Date(n.updatedAt).toISOString()}`,
      ...(n.subtopicId ? [`aula: ${n.subtopicId}`] : []),
      "---",
      "",
    ].join("\n");

    out.push({ name: `${base}.md`, content: front + (n.body ?? "") + "\n", mtime: n.updatedAt });
  }
  return out;
}

export function vaultFileName(): string {
  return `matemonstro-vault-${new Date().toISOString().slice(0, 10)}.zip`;
}
