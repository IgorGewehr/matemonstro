"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { useApp } from "@/components/AppState";
import { useNotes } from "@/components/notes/NotesProvider";
import { getSubRef, flatSubtopics } from "@/lib/curriculum";
import { findZettel, zettelBody, zettelTitle } from "@/lib/zettel";
import { useFocusTrap } from "@/lib/useFocusTrap";
import Markdown from "@/components/Markdown";
import { phaseColor } from "@/components/ui";
import Figure from "@/components/Figure";
import SubtopicNotes from "@/components/notes/SubtopicNotes";

function scrollToId(id: string) {
  document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
}

export default function StudyPage() {
  const { trackId, subId } = useParams<{ trackId: string; subId: string }>();
  const router = useRouter();
  const { ready, progress, setStatus, saveNotes } = useApp();
  const { notes: obsidianNotes, create: createNote } = useNotes();
  const ref = getSubRef(subId);

  const [notes, setNotes] = useState("");
  const [keyPoints, setKeyPoints] = useState("");
  const [saved, setSaved] = useState(true);
  const [zettelOffer, setZettelOffer] = useState(false);
  const zettelRef = useRef<HTMLDivElement>(null);
  useFocusTrap(zettelRef, zettelOffer);

  const p = progress.get(subId);
  useEffect(() => {
    setNotes(p?.notes ?? "");
    setKeyPoints(p?.keyPoints ?? "");
    setSaved(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [subId, ready]);

  if (!ready) return <div className="panel p-6 text-sm text-[var(--color-mut)]">Carregando…</div>;
  if (!ref) return <div className="panel p-6">Subtópico não encontrado. <Link className="text-[var(--color-brand)]" href="/trilhas">Trilhas</Link></div>;

  const { track, sub, globalIndex } = ref;
  const prev = flatSubtopics[globalIndex - 1];
  const next = flatSubtopics[globalIndex + 1];
  const status = p?.status ?? "todo";

  async function persist() {
    await saveNotes(subId, notes, keyPoints);
    setSaved(true);
  }

  async function start() {
    if (status === "todo") await setStatus(subId, "doing");
  }

  async function complete() {
    if (!keyPoints.trim()) {
      const ok = window.confirm(
        "Você ainda não anotou os pontos-chave com suas palavras. Anotar fixa MUITO melhor.\n\nConcluir mesmo assim?"
      );
      if (!ok) {
        document.getElementById("keypoints")?.focus();
        return;
      }
    }
    await saveNotes(subId, notes, keyPoints);
    await setStatus(subId, "done");
    setSaved(true);
    // Oferece transformar os apontamentos em nota permanente (uma vez por aula).
    if (!findZettel(obsidianNotes, subId)) setZettelOffer(true);
  }

  async function createZettel() {
    if (!ref) return;
    const n = await createNote({
      title: zettelTitle(ref.sub),
      body: zettelBody(ref.sub, ref.track, keyPoints, notes),
      tags: ["zettel", ref.track.id],
      subtopicId: subId,
    });
    setZettelOffer(false);
    router.push(`/notas/${n.id}`);
  }

  return (
    <div className="space-y-6 pb-10">
      <div className="flex items-center justify-between text-sm">
        <Link href={`/trilha/${track.id}`} className="text-[var(--color-mut)] hover:text-[var(--color-txt)] truncate">
          ← {track.title}
        </Link>
        <span className="chip">{globalIndex + 1} / {flatSubtopics.length}</span>
      </div>

      <header className="panel p-6" style={{ borderColor: phaseColor(track.phase) + "44" }}>
        <div className="text-xs uppercase tracking-wide text-[var(--color-mut)]">{track.title}</div>
        <h1 className="text-2xl md:text-3xl font-extrabold tracking-tight mt-1">{sub.title}</h1>
        {sub.tagline && <p className="text-[var(--color-mut)] mt-1">{sub.tagline}</p>}
        <div className="flex items-center gap-2 mt-4">
          {status === "done" ? (
            <span className="chip !border-[var(--color-brand2)] !text-[var(--color-brand2)]">✓ concluído</span>
          ) : (
            <button className="btn btn-primary" onClick={start} disabled={status !== "todo"}>
              {status === "doing" ? "Em andamento" : "Iniciar estudo"}
            </button>
          )}
          <span className="chip">{sub.estimatedHours}h estimadas</span>
        </div>

        {sub.prereqs && sub.prereqs.length > 0 && (
          <div className="mt-4 pt-3 border-t border-[var(--color-line)]">
            <div className="text-xs text-[var(--color-mut)] mb-1.5">
              Antes disto, ajuda ter visto:
            </div>
            <div className="flex flex-wrap gap-1.5">
              {sub.prereqs.map((pid) => {
                const pref = getSubRef(pid);
                const done = progress.get(pid)?.status === "done";
                const label = pref?.sub.title ?? pid;
                const chip = (
                  <span
                    className={`chip ${done ? "!border-[var(--color-brand2)] !text-[var(--color-brand2)]" : "!border-[var(--color-warm)]/40 !text-[var(--color-warm)]"}`}
                  >
                    {done ? "✓" : "○"} {label}
                  </span>
                );
                return pref ? (
                  <Link key={pid} href={`/estudar/${pref.track.id}/${pref.sub.id}`}>
                    {chip}
                  </Link>
                ) : (
                  <span key={pid}>{chip}</span>
                );
              })}
            </div>
          </div>
        )}
      </header>

      {/* Roteiro de estudo externo — o app ENSINA A ESTUDAR POR FORA */}
      {sub.studyRoadmap && <StudyRoadmapSection roadmap={sub.studyRoadmap} />}

      {/* Objetivos */}
      {sub.objectives?.length > 0 && (
        <Section title="🎯 Objetivos">
          <ul className="space-y-1.5">
            {sub.objectives.map((o, i) => (
              <li key={i} className="flex gap-2 text-sm">
                <span className="text-[var(--color-brand2)]">▸</span>
                <span className="text-[var(--color-txt2)]"><Markdown className="inline">{o}</Markdown></span>
              </li>
            ))}
          </ul>
        </Section>
      )}

      {/* Conceitos-chave */}
      {sub.keyConcepts?.length > 0 && (
        <Section title="🔑 Conceitos-chave">
          <div className="grid gap-3">
            {sub.keyConcepts.map((k, i) => (
              <div key={i} className="p-4 rounded-xl bg-[var(--color-card)] border border-[var(--color-line)]">
                <div className="font-bold text-[var(--color-brand)] mb-1">{k.term}</div>
                <Markdown>{k.statement}</Markdown>
              </div>
            ))}
          </div>
        </Section>
      )}

      {/* Teoremas */}
      {sub.theorems?.length > 0 && (
        <Section title="📐 Teoremas & Resultados">
          <div className="space-y-3">
            {sub.theorems.map((t, i) => (
              <div key={i} className="p-4 rounded-xl bg-[var(--color-well)] border-l-2 border-[var(--color-brand)] border border-[var(--color-line)]">
                <div className="font-bold mb-1">{t.name}</div>
                <Markdown>{t.statement}</Markdown>
                {t.whyItMatters && (
                  <p className="text-xs text-[var(--color-mut)] mt-2 italic">💡 {t.whyItMatters}</p>
                )}
              </div>
            ))}
          </div>
        </Section>
      )}

      {/* Historia & motivacao (leve) */}
      {sub.history && sub.history.trim() && (
        <Section title="📜 História & motivação">
          <Markdown>{sub.history}</Markdown>
        </Section>
      )}

      {/* Resumo */}
      {sub.summary && (
        <Section title="📖 Resumo da aula">
          <Markdown>{sub.summary}</Markdown>
        </Section>
      )}

      {/* Figuras (opcional, ilustracoes pontuais) */}
      {sub.figures && sub.figures.length > 0 && (
        <Section title="📊 Figuras">
          <div className="space-y-3">
            {sub.figures.map((fig, i) => (
              <Figure key={i} figure={fig} />
            ))}
          </div>
        </Section>
      )}

      {/* Exemplo resolvido */}
      {sub.worked && sub.worked.trim() && (
        <Section title="✍️ Exemplo resolvido">
          <Markdown>{sub.worked}</Markdown>
        </Section>
      )}

      {/* Pegadinhas */}
      {sub.commonPitfalls?.length > 0 && (
        <Section title="⚠️ Erros comuns">
          <ul className="space-y-1.5">
            {sub.commonPitfalls.map((c, i) => (
              <li key={i} className="flex gap-2 text-sm text-[var(--color-warm)]">
                <span>•</span>
                <span><Markdown className="inline">{c}</Markdown></span>
              </li>
            ))}
          </ul>
        </Section>
      )}

      {/* Exercicios */}
      {sub.exercises?.length > 0 && (
        <Section title="🧮 Exercícios" id="exercicios">
          <div className="space-y-3">
            {sub.exercises.map((e, i) => (
              <div key={i} className="p-4 rounded-xl bg-[var(--color-card)] border border-[var(--color-line)]">
                <div className="flex items-start gap-2">
                  <span className="chip !py-0.5 shrink-0">{i + 1}</span>
                  <div className="flex-1"><Markdown>{e.prompt}</Markdown></div>
                  <span className="chip !py-0.5 shrink-0" title={`Dificuldade ${e.difficulty}/5`}>{"●".repeat(e.difficulty)}</span>
                </div>
                {e.hint && (
                  <details className="mt-2">
                    <summary className="text-xs text-[var(--color-brand)] cursor-pointer select-none">Dica</summary>
                    <div className="mt-1 text-sm"><Markdown>{e.hint}</Markdown></div>
                  </details>
                )}
                {(e.solution || (e.steps && e.steps.length > 0)) && (
                  <details className="mt-2">
                    <summary className="text-xs text-[var(--color-brand2)] cursor-pointer select-none">
                      Solução (tente antes de abrir)
                    </summary>
                    <div className="mt-2 space-y-2">
                      {e.steps && e.steps.length > 0 && (
                        <ol className="space-y-1.5">
                          {e.steps.map((s, k) => (
                            <li key={k} className="flex gap-2 text-sm">
                              <span className="chip !py-0 !px-1.5 shrink-0 h-fit">{k + 1}</span>
                              <div className="flex-1"><Markdown className="inline">{s}</Markdown></div>
                            </li>
                          ))}
                        </ol>
                      )}
                      {e.solution && (
                        <div className="text-sm p-3 rounded-lg bg-[var(--color-well)] border border-[var(--color-line)]">
                          <Markdown>{e.solution}</Markdown>
                        </div>
                      )}
                    </div>
                  </details>
                )}
              </div>
            ))}
          </div>
        </Section>
      )}

      {/* Anotacoes — "anote o principal" */}
      <Section title="📝 Suas anotações" id="anotacoes">
        <label htmlFor="keypoints" className="block text-sm font-semibold mb-1">
          O principal <span className="text-[var(--color-mut)] font-normal">— resuma com suas palavras (active recall)</span>
        </label>
        <textarea
          id="keypoints"
          value={keyPoints}
          onChange={(e) => { setKeyPoints(e.target.value); setSaved(false); }}
          placeholder="Ex: a ideia central é... o teorema X garante que... a hipótese mais importante é..."
          className="w-full min-h-24 rounded-xl bg-[var(--color-well)] border border-[var(--color-line)] p-3 text-sm outline-none focus:border-[var(--color-brand)] resize-y"
        />
        <label htmlFor="notas-livres" className="block text-sm font-semibold mb-1 mt-4">Notas livres (markdown + LaTeX com $…$)</label>
        <textarea
          id="notas-livres"
          value={notes}
          onChange={(e) => { setNotes(e.target.value); setSaved(false); }}
          placeholder="Demonstrações, dúvidas, exemplos seus…"
          className="w-full min-h-32 rounded-xl bg-[var(--color-well)] border border-[var(--color-line)] p-3 text-sm font-mono outline-none focus:border-[var(--color-brand)] resize-y"
        />
        {notes.trim() && (
          <details className="mt-2">
            <summary className="text-xs text-[var(--color-brand)] cursor-pointer">Pré-visualizar</summary>
            <div className="mt-2 p-3 rounded-xl bg-[var(--color-well)] border border-[var(--color-line)]"><Markdown>{notes}</Markdown></div>
          </details>
        )}
        <div className="flex items-center gap-2 mt-3">
          <button className="btn" onClick={persist}>{saved ? "Salvo ✓" : "Salvar anotações"}</button>
          {!saved && <span className="text-xs text-[var(--color-mut)]">alterações não salvas</span>}
        </div>
      </Section>

      {/* Notas do subtopico (Obsidian-like, ver /notas) */}
      <SubtopicNotes subId={subId} trackId={trackId} />

      {/* Flashcards */}
      {sub.flashcards?.length > 0 && (
        <Section title={`🃏 Flashcards (${sub.flashcards.length}) — entram na revisão espaçada`}>
          <p className="text-xs text-[var(--color-mut)] mb-3">
            Ao iniciar/concluir o subtópico, estes cartões entram na sua fila de revisão e voltam nos intervalos
            certos para não esquecer.
          </p>
          <div className="grid sm:grid-cols-2 gap-2">
            {sub.flashcards.map((f, i) => (
              <details key={i} className="p-3 rounded-xl bg-[var(--color-card)] border border-[var(--color-line)]">
                <summary className="cursor-pointer text-sm font-medium"><Markdown className="inline">{f.front}</Markdown></summary>
                <div className="mt-2 pt-2 border-t border-[var(--color-line)] text-sm"><Markdown>{f.back}</Markdown></div>
              </details>
            ))}
          </div>
        </Section>
      )}

      {/* Oferta de Zettel pós-conclusão */}
      {zettelOffer && (
        <div
          className="fixed inset-0 z-[120] grid place-items-center p-4 bg-black/60 backdrop-blur-sm"
          onMouseDown={() => setZettelOffer(false)}
        >
          <div
            ref={zettelRef}
            role="dialog"
            aria-modal="true"
            aria-label="Criar nota permanente da aula"
            className="panel w-full max-w-md p-6"
            onMouseDown={(e) => e.stopPropagation()}
          >
            <div className="text-4xl mb-2">∎</div>
            <h2 className="text-lg font-bold">Aula concluída!</h2>
            <p className="text-sm text-[var(--color-mut)] mt-1">
              Transforme o que você anotou numa <span className="text-[var(--color-txt)] font-semibold">nota permanente</span> —
              com resumo, espaço para ligações <code>[[ ]]</code> e link de volta pra aula. É assim que o
              conhecimento vira rede.
            </p>
            {keyPoints.trim() && (
              <div className="mt-3 p-3 rounded-xl bg-[var(--color-well)] border border-[var(--color-line)] text-xs text-[var(--color-mut)] max-h-24 overflow-hidden">
                “{keyPoints.trim().slice(0, 160)}{keyPoints.trim().length > 160 ? "…" : ""}”
              </div>
            )}
            <div className="flex gap-2 justify-end mt-5">
              <button className="btn" onClick={() => setZettelOffer(false)} autoFocus>
                Agora não
              </button>
              <button className="btn btn-primary" onClick={createZettel}>
                ∎ Criar Zettel da aula
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Concluir + navegacao */}
      <div className="panel p-4 flex flex-wrap items-center gap-3 sticky bottom-3 backdrop-blur bg-[var(--color-scrim)]">
        {status !== "done" ? (
          <button className="btn btn-primary" onClick={complete}>✓ Concluir subtópico</button>
        ) : (
          <button className="btn" onClick={() => setStatus(subId, "doing")}>Reabrir</button>
        )}
        <button
          className="btn"
          onClick={() =>
            window.dispatchEvent(new CustomEvent("mm:start-focus", { detail: { label: sub.title } }))
          }
          title="Estudar esta aula sem distração (25/50 min)"
        >
          ◉ Foco
        </button>
        <div className="ml-auto flex gap-2">
          {prev && (
            <button className="btn" onClick={() => router.push(`/estudar/${prev.track.id}/${prev.sub.id}`)}>← Anterior</button>
          )}
          {next && (
            <button className="btn" onClick={() => router.push(`/estudar/${next.track.id}/${next.sub.id}`)}>Próximo →</button>
          )}
        </div>
      </div>
    </div>
  );
}

function Section({ title, children, id }: { title: string; children: React.ReactNode; id?: string }) {
  return (
    <section id={id} className="panel p-5">
      <h2 className="font-bold mb-3">{title}</h2>
      {children}
    </section>
  );
}

function StudyRoadmapSection({ roadmap }: { roadmap: import("@/lib/types").StudyRoadmap }) {
  const steps = roadmap.steps ?? [];
  const [checked, setChecked] = useState<boolean[]>(() => steps.map(() => false));

  const gUrl = (q: string) => `https://www.google.com/search?q=${encodeURIComponent(q)}`;
  const ytUrl = (q: string) => `https://www.youtube.com/results?search_query=${encodeURIComponent(q)}`;

  return (
    <section
      className="panel p-5"
      style={{ borderColor: "var(--color-brand)", borderWidth: 1 }}
    >
      <h2 className="font-bold mb-1">🧭 Como aprender isto por fora</h2>
      <p className="text-xs text-[var(--color-mut)] mb-4">
        O Matemonstro guarda suas anotações e testes. O conteúdo você busca aqui fora — com um roteiro pronto.
      </p>

      {steps.length > 0 && (
        <div className="mb-4">
          <div className="text-sm font-semibold mb-2">Roteiro sugerido</div>
          <ul className="space-y-1.5">
            {steps.map((s, i) => (
              <li key={i}>
                <label className="flex gap-2 text-sm cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={checked[i] ?? false}
                    onChange={() =>
                      setChecked((c) => c.map((v, k) => (k === i ? !v : v)))
                    }
                    className="mt-0.5 accent-[var(--color-brand)]"
                  />
                  <span className={checked[i] ? "line-through text-[var(--color-mut)]" : "text-[var(--color-txt2)]"}>
                    <Markdown className="inline">{s}</Markdown>
                  </span>
                </label>
              </li>
            ))}
          </ul>
        </div>
      )}

      {roadmap.searchQueries && roadmap.searchQueries.length > 0 && (
        <div className="mb-4">
          <div className="text-sm font-semibold mb-2">Buscas prontas</div>
          <div className="space-y-2">
            {roadmap.searchQueries.map((q, i) => (
              <div key={i} className="flex flex-wrap items-center gap-2 text-sm">
                <span className="flex-1 min-w-[10rem] text-[var(--color-txt2)]">“{q}”</span>
                <a className="btn !py-1 !px-2 text-xs" href={gUrl(q)} target="_blank" rel="noopener noreferrer">
                  🔎 Google
                </a>
                <a className="btn !py-1 !px-2 text-xs" href={ytUrl(q)} target="_blank" rel="noopener noreferrer">
                  ▶ YouTube
                </a>
              </div>
            ))}
          </div>
        </div>
      )}

      {roadmap.videos && roadmap.videos.length > 0 && (
        <div className="mb-4">
          <div className="text-sm font-semibold mb-2">Vídeos sugeridos</div>
          <ul className="space-y-1.5">
            {roadmap.videos.map((v, i) => (
              <li key={i} className="text-sm">
                <a
                  className="text-[var(--color-brand)] hover:underline"
                  href={ytUrl(`${v.title}${v.channel ? " " + v.channel : ""}`)}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  ▶ {v.title}
                </a>
                {v.channel && <span className="text-[var(--color-mut)]"> — {v.channel}</span>}
                {v.note && <span className="text-[var(--color-mut)] italic"> · {v.note}</span>}
              </li>
            ))}
          </ul>
        </div>
      )}

      {roadmap.articles && roadmap.articles.length > 0 && (
        <div className="mb-4">
          <div className="text-sm font-semibold mb-2">Artigos & notas de aula</div>
          <ul className="space-y-1.5">
            {roadmap.articles.map((a, i) => (
              <li key={i} className="text-sm text-[var(--color-txt2)]">
                📄 {a.title}
                {a.where && <span className="text-[var(--color-mut)]"> — {a.where}</span>}
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="mt-4 pt-3 border-t border-[var(--color-line)] flex flex-wrap gap-2">
        <span className="text-sm text-[var(--color-mut)] w-full">
          Estudou por fora? Agora fixe aqui dentro:
        </span>
        <button className="btn btn-primary !py-1 text-xs" onClick={() => scrollToId("exercicios")}>
          🧮 Resolver os testes
        </button>
        <button className="btn !py-1 text-xs" onClick={() => scrollToId("anotacoes")}>
          📝 Anotar o principal
        </button>
      </div>
    </section>
  );
}
