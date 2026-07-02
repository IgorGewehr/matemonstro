"use client";

// Biblioteca de resultados: todo teorema e toda definição do currículo num
// dicionário pessoal pesquisável — consulta instantânea com link pra aula.

import { useMemo, useState } from "react";
import Link from "next/link";
import Markdown from "@/components/Markdown";
import { searchLibrary, getLibraryCounts, type LibraryKind } from "@/lib/library";
import { tracks } from "@/lib/curriculum";
import { useCurriculumReady } from "@/lib/useCurriculum";
import { phaseColor } from "@/components/ui";

const PAGE = 40;

export default function BibliotecaPage() {
  const curReady = useCurriculumReady();
  const [q, setQ] = useState("");
  const [kind, setKind] = useState<LibraryKind | null>(null);
  const [trackId, setTrackId] = useState<string | null>(null);
  const [limit, setLimit] = useState(PAGE);

  const counts = useMemo(() => getLibraryCounts(), [curReady]);
  const results = useMemo(() => searchLibrary(q, { kind, trackId }), [q, kind, trackId, curReady]);
  const visible = results.slice(0, limit);

  function resetPage() {
    setLimit(PAGE);
  }

  return (
    <div className="space-y-5 pb-10">
      <header>
        <h1 className="text-2xl md:text-3xl font-extrabold tracking-tight">≔ Biblioteca de resultados</h1>
        <p className="text-[var(--color-mut)] text-sm mt-1">
          {curReady
            ? `Seu dicionário de matemática: ${counts.definicoes} definições e ${counts.teoremas} teoremas de todo o currículo, com link direto pra aula onde cada um vive.`
            : "Carregando o currículo…"}
        </p>
      </header>

      <div className="panel p-3 space-y-3">
        <input
          value={q}
          onChange={(e) => {
            setQ(e.target.value);
            resetPage();
          }}
          autoFocus
          placeholder="Buscar teorema ou definição… (ex: Bolzano, compacto, grupo quociente)"
          className="w-full rounded-xl bg-[var(--color-well)] border border-[var(--color-line)] px-4 py-2.5 text-sm outline-none focus:border-[var(--color-brand)]"
          aria-label="Buscar na biblioteca"
        />
        <div className="flex flex-wrap items-center gap-1.5">
          {(
            [
              [null, "Tudo"],
              ["definicao", "≔ Definições"],
              ["teorema", "◆ Teoremas"],
            ] as [LibraryKind | null, string][]
          ).map(([k, label]) => (
            <button
              key={label}
              className={`chip !py-1 ${kind === k ? "!border-[var(--color-brand)] !text-[var(--color-brand)]" : ""}`}
              onClick={() => {
                setKind(k);
                resetPage();
              }}
              aria-pressed={kind === k}
            >
              {label}
            </button>
          ))}
          <select
            value={trackId ?? ""}
            onChange={(e) => {
              setTrackId(e.target.value || null);
              resetPage();
            }}
            className="ml-auto rounded-lg bg-[var(--color-well)] border border-[var(--color-line)] px-2 py-1.5 text-xs outline-none focus:border-[var(--color-brand)] max-w-[220px]"
            aria-label="Filtrar por trilha"
          >
            <option value="">Todas as trilhas</option>
            {tracks.map((t) => (
              <option key={t.id} value={t.id}>
                {t.title}
              </option>
            ))}
          </select>
        </div>
      </div>

      <p className="text-xs text-[var(--color-mut)]">
        {results.length} resultado{results.length === 1 ? "" : "s"}
        {q.trim() ? ` para “${q.trim()}”` : ""}
      </p>

      <div className="space-y-3">
        {visible.map((e, i) => (
          <article key={`${e.subId}-${e.kind}-${e.name}-${i}`} className="panel p-4">
            <div className="flex items-start justify-between gap-3 flex-wrap">
              <h2 className="font-bold text-[15px] flex items-baseline gap-2">
                <span
                  className={e.kind === "teorema" ? "text-[var(--color-brand)]" : "text-[var(--color-brand2)]"}
                  aria-hidden="true"
                >
                  {e.kind === "teorema" ? "◆" : "≔"}
                </span>
                {e.name}
              </h2>
              <Link
                href={`/estudar/${e.trackId}/${e.subId}`}
                className="chip !py-0.5 hover:!border-[var(--color-brand)] hover:!text-[var(--color-brand)]"
                style={{ borderColor: `${phaseColor(e.phase)}55` }}
              >
                {e.trackTitle} · {e.subTitle}
              </Link>
            </div>
            <div className="mt-2">
              <Markdown className="!text-[14px]">{e.statement}</Markdown>
            </div>
            {e.why && (
              <details className="mt-2">
                <summary className="cursor-pointer text-xs text-[var(--color-mut)] hover:text-[var(--color-txt)]">
                  Por que importa
                </summary>
                <div className="mt-1 text-sm text-[var(--color-mut)]">
                  <Markdown className="!text-[13px]">{e.why}</Markdown>
                </div>
              </details>
            )}
          </article>
        ))}
      </div>

      {visible.length === 0 && (
        <div className="panel p-8 text-center text-sm text-[var(--color-mut)]">
          Nada encontrado{q.trim() ? ` para “${q.trim()}”` : ""}. Tente outro termo — a busca ignora acentos.
        </div>
      )}

      {results.length > limit && (
        <div className="text-center">
          <button className="btn" onClick={() => setLimit((l) => l + PAGE)}>
            Mostrar mais ({results.length - limit} restantes)
          </button>
        </div>
      )}
    </div>
  );
}
