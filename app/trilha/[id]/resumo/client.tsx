"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useMemo } from "react";
import { getTrack } from "@/lib/curriculum";
import { useCurriculumReady } from "@/lib/useCurriculum";
import { buildCheatSheet, indexLetter } from "@/lib/cheatsheet";
import { phaseColor } from "@/components/ui";
import Markdown from "@/components/Markdown";

export default function ResumoPage() {
  const params = useParams<{ id: string }>();
  const curReady = useCurriculumReady();
  const track = getTrack(params.id);

  const sheet = useMemo(() => (track ? buildCheatSheet(track) : null), [track]);

  if (!curReady) return <div className="panel p-6 text-sm text-[var(--color-mut)]">Carregando…</div>;
  if (!track || !sheet) {
    return (
      <div className="panel p-6">
        Trilha não encontrada.{" "}
        <Link className="text-[var(--color-brand)]" href="/trilhas">
          Voltar
        </Link>
      </div>
    );
  }

  return (
    <div className="cheatsheet space-y-6 pb-10 mm-enter">
      {/* Barra de ações (não impressa) */}
      <div className="no-print flex items-center justify-between text-sm">
        <Link href={`/trilha/${track.id}`} className="text-[var(--color-mut)] hover:text-[var(--color-txt)] truncate">
          ← {track.title}
        </Link>
        <button className="btn btn-primary" onClick={() => window.print()}>
          Imprimir
        </button>
      </div>

      {/* Cabeçalho */}
      <header className="panel p-6" style={{ borderColor: phaseColor(track.phase) + "55" }}>
        <div className="text-xs uppercase tracking-wide text-[var(--color-mut)]">
          Cola de revisão · {track.phaseLabel}
        </div>
        <h1 className="text-2xl md:text-3xl font-extrabold tracking-tight mt-1">{track.title}</h1>
        <p className="text-[var(--color-mut)] mt-1 text-sm">
          Tudo numa folha: {sheet.counts.concepts} definições · {sheet.counts.theorems} teoremas ·{" "}
          {sheet.counts.flashcards} flashcards. Ideal para a revisão de véspera.
        </p>
      </header>

      {/* Fórmulas (curadoria opcional) */}
      {sheet.formulaSheet && (
        <section className="panel p-5">
          <h2 className="font-bold mb-3">∑ Fórmulas essenciais</h2>
          <Markdown>{sheet.formulaSheet}</Markdown>
        </section>
      )}

      {/* Índice alfabético do glossário */}
      {sheet.letters.length > 0 && (
        <nav className="no-print panel p-4">
          <div className="text-xs text-[var(--color-mut)] mb-2">Índice do glossário</div>
          <div className="flex flex-wrap gap-1.5">
            {sheet.letters.map((L) => (
              <a key={L} href={`#g-${L}`} className="chip hover:border-[var(--color-brand)]">
                {L}
              </a>
            ))}
          </div>
        </nav>
      )}

      {/* Glossário */}
      {sheet.glossary.length > 0 && (
        <section className="panel p-5">
          <h2 className="font-bold mb-4">Glossário</h2>
          <div className="space-y-4">
            {sheet.letters.map((L) => (
              <div key={L}>
                <h3 id={`g-${L}`} className="text-[var(--color-brand)] font-bold text-lg mb-2 scroll-mt-4">
                  {L}
                </h3>
                <dl className="space-y-2 mm-stagger">
                  {sheet.glossary
                    .filter((g) => indexLetter(g.term) === L)
                    .map((g, i) => (
                      <div key={i} className="p-3 rounded-xl bg-[var(--color-card)] border border-[var(--color-line)]">
                        <dt className="font-semibold flex items-center gap-2 flex-wrap">
                          <span>{g.term}</span>
                          {g.subTitle && (
                            <span className="chip !py-0 text-[var(--color-mut)]">{g.subTitle}</span>
                          )}
                        </dt>
                        <dd className="mt-1">
                          <Markdown>{g.def}</Markdown>
                        </dd>
                      </div>
                    ))}
                </dl>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Teoremas */}
      {sheet.theorems.length > 0 && (
        <section className="panel p-5">
          <h2 className="font-bold mb-4">∴ Teoremas & resultados</h2>
          <div className="space-y-3 mm-stagger">
            {sheet.theorems.map((t, i) => (
              <div
                key={i}
                className="p-4 rounded-xl bg-[var(--color-well)] border-l-2 border-[var(--color-brand)] border border-[var(--color-line)]"
              >
                <div className="font-bold mb-1 flex items-center gap-2 flex-wrap">
                  <span>{t.name}</span>
                  <span className="chip !py-0 text-[var(--color-mut)]">{t.subTitle}</span>
                </div>
                <Markdown>{t.statement}</Markdown>
                {t.whyItMatters && (
                  <p className="text-xs text-[var(--color-mut)] mt-2 italic">{t.whyItMatters}</p>
                )}
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Flashcards (frente + verso revelados) */}
      {sheet.flashcards.length > 0 && (
        <section className="panel p-5">
          <h2 className="font-bold mb-4">Flashcards ({sheet.flashcards.length})</h2>
          <div className="grid sm:grid-cols-2 gap-2 mm-stagger">
            {sheet.flashcards.map((f, i) => (
              <div key={i} className="p-3 rounded-xl bg-[var(--color-card)] border border-[var(--color-line)]">
                <div className="text-sm font-medium">
                  <Markdown className="inline">{f.front}</Markdown>
                </div>
                <div className="mt-2 pt-2 border-t border-[var(--color-line)] text-sm">
                  <Markdown>{f.back}</Markdown>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {sheet.counts.concepts === 0 &&
        sheet.counts.theorems === 0 &&
        sheet.counts.flashcards === 0 && (
          <div className="panel p-6 text-[var(--color-mut)]">
            Esta trilha ainda não tem conteúdo suficiente para gerar uma cola.
          </div>
        )}
    </div>
  );
}
