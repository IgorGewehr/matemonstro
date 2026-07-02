"use client";

// Treino de demonstração: a habilidade central do bacharelado→mestrado.
// Fluxo: enunciado → você ESCREVE a prova (LaTeX ao vivo) → revela a referência
// → auto-avaliação por rubrica (estratégia/rigor/completude) → alimenta o SRS
// de prática (o que vai mal cai no modo erros). Opcional: salvar como nota.

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useApp } from "@/components/AppState";
import { useNotes } from "@/components/notes/NotesProvider";
import Markdown from "@/components/Markdown";
import FormulaToolbar from "@/components/notes/FormulaToolbar";
import { buildProofItems } from "@/lib/proofs";
import {
  RUBRIC_AXES,
  EMPTY_RUBRIC,
  rubricComplete,
  rubricGrade,
  GRADE_MEANING,
  proofNoteBody,
  type ProofRubric,
} from "@/lib/proofs";
import {
  buildPracticeQueue,
  gradePractice,
  latestByExKey,
  type PracticeItem,
  type PracticeFilters,
} from "@/lib/practice";

const GRADE_COLOR: Record<string, string> = {
  acertei: "#00d3a7",
  quase: "#f6c453",
  errei: "#ff6b6b",
};

export default function ProvasPage() {
  const router = useRouter();
  const { ready, attempts, recordAttempt } = useApp();
  const { create: createNote } = useNotes();
  // depende de `ready`: o currículo carrega em runtime
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const allProofs = useMemo(() => buildProofItems(), [ready]);
  const attemptsArr = useMemo(() => [...attempts.values()], [attempts]);

  const [filters, setFilters] = useState<PracticeFilters>({ exam: "all", difficulty: 0 });
  const [queue, setQueue] = useState<PracticeItem[] | null>(null);
  const [idx, setIdx] = useState(0);
  const [proof, setProof] = useState("");
  const [revealed, setRevealed] = useState(false);
  const [rubric, setRubric] = useState<ProofRubric>(EMPTY_RUBRIC);
  const [savedNote, setSavedNote] = useState(false);
  const [session, setSession] = useState({ acertei: 0, quase: 0, errei: 0 });
  const [pendingSel, setPendingSel] = useState<{ start: number; end: number } | null>(null);

  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Reaplica a seleção do textarea depois de inserções da FormulaToolbar.
  useEffect(() => {
    if (pendingSel && textareaRef.current) {
      textareaRef.current.focus();
      textareaRef.current.setSelectionRange(pendingSel.start, pendingSel.end);
      setPendingSel(null);
    }
  }, [pendingSel, proof]);

  const trackOptions = useMemo(() => {
    const seen = new Map<string, string>();
    for (const it of allProofs) if (!seen.has(it.trackId)) seen.set(it.trackId, it.trackTitle);
    return [...seen.entries()];
  }, [allProofs]);

  const preview = useMemo(
    () => buildPracticeQueue(allProofs, attemptsArr, filters, Date.now()),
    [allProofs, attemptsArr, filters]
  );

  // Estatísticas específicas de demonstrações (tentativas cujo exKey é de prova).
  const proofStats = useMemo(() => {
    const proofKeys = new Set(allProofs.map((p) => p.exKey));
    const mine = attemptsArr.filter((a) => proofKeys.has(a.exKey));
    const solid = mine.filter((a) => a.grade === "acertei").length;
    return { total: mine.length, solid, distinct: new Set(mine.map((a) => a.exKey)).size };
  }, [allProofs, attemptsArr]);

  function start() {
    setQueue(buildPracticeQueue(allProofs, attemptsArr, filters, Date.now()));
    setIdx(0);
    resetItem();
    setSession({ acertei: 0, quase: 0, errei: 0 });
  }

  function resetItem() {
    setProof("");
    setRevealed(false);
    setRubric(EMPTY_RUBRIC);
    setSavedNote(false);
  }

  const current = queue ? queue[idx] : undefined;
  const finished = queue !== null && (idx >= queue.length || !current);
  const grade = rubricComplete(rubric) ? rubricGrade(rubric) : null;

  async function submitRubric() {
    if (!current || !queue || !grade) return;
    const now = Date.now();
    const latest = latestByExKey(attemptsArr).get(current.exKey);
    await recordAttempt(gradePractice(current, grade, latest, now));
    setSession((s) => ({ ...s, [grade]: s[grade] + 1 }));
    const nextQueue = [...queue];
    if (grade === "errei") nextQueue.push(current);
    setQueue(nextQueue);
    setIdx((i) => i + 1);
    resetItem();
  }

  async function saveAsNote() {
    if (!current || !grade || savedNote) return;
    const n = await createNote({
      title: `Demonstração — ${current.subTitle}`,
      body: proofNoteBody(current, proof, grade),
      tags: ["demonstracao", current.trackId],
      subtopicId: current.subId !== current.trackId ? current.subId : null,
    });
    setSavedNote(true);
    router.prefetch(`/notas/${n.id}`);
  }

  if (!ready) return <div className="text-[var(--color-mut)]">Carregando…</div>;

  // ---- Tela de entrada ----
  if (queue === null) {
    return (
      <div className="max-w-3xl mx-auto space-y-6">
        <header>
          <h1 className="text-2xl md:text-3xl font-extrabold tracking-tight">∎ Treino de demonstração</h1>
          <p className="text-[var(--color-mut)] mt-1 text-sm">
            A habilidade que separa quem <span className="text-[var(--color-txt)] font-semibold">faz conta</span> de quem{" "}
            <span className="text-[var(--color-txt)] font-semibold">faz matemática</span>. Escreva a prova de verdade, compare
            com a referência e avalie-se com uma rubrica de matemático: estratégia, rigor, completude.
          </p>
        </header>

        <div className="grid grid-cols-3 gap-3">
          <StatCard value={proofStats.total} label="Provas escritas" />
          <StatCard
            value={proofStats.total ? `${Math.round((proofStats.solid / proofStats.total) * 100)}%` : "—"}
            label="Sólidas (rubrica cheia)"
            accent="#00d3a7"
          />
          <StatCard value={proofStats.distinct} label="Enunciados distintos" />
        </div>

        <section className="panel p-6 space-y-5 text-center">
          <div>
            <div className="text-3xl font-extrabold">{preview.length}</div>
            <div className="text-xs text-[var(--color-mut)]">demonstrações prontas para treinar agora</div>
          </div>
          <button className="btn btn-primary !px-8 !py-3 text-base mx-auto" onClick={start} disabled={preview.length === 0}>
            ∎ Começar a provar
          </button>

          <div className="grid sm:grid-cols-2 gap-3 text-left">
            <label className="block">
              <span className="block text-xs text-[var(--color-mut)] mb-1">Trilha</span>
              <select
                className="w-full rounded-xl bg-[var(--color-well)] border border-[var(--color-line)] p-2.5 text-sm outline-none focus:border-[var(--color-brand)]"
                value={filters.trackId ?? ""}
                onChange={(e) => setFilters((f) => ({ ...f, trackId: e.target.value || undefined }))}
              >
                <option value="">Todas</option>
                {trackOptions.map(([id, title]) => (
                  <option key={id} value={id}>{title}</option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="block text-xs text-[var(--color-mut)] mb-1">Dificuldade</span>
              <select
                className="w-full rounded-xl bg-[var(--color-well)] border border-[var(--color-line)] p-2.5 text-sm outline-none focus:border-[var(--color-brand)]"
                value={filters.difficulty ?? 0}
                onChange={(e) => setFilters((f) => ({ ...f, difficulty: Number(e.target.value) }))}
              >
                <option value={0}>Todas</option>
                {[1, 2, 3, 4, 5].map((d) => (
                  <option key={d} value={d}>{"●".repeat(d)}</option>
                ))}
              </select>
            </label>
          </div>

          {preview.length === 0 && (
            <p className="text-xs text-[#ff8080]">Nada com esses filtros — limpe a trilha/dificuldade.</p>
          )}
        </section>

        <p className="text-xs text-[var(--color-mut)] text-center">
          Cálculo e exercícios diretos moram no <Link href="/praticar" className="text-[var(--color-brand)]">Praticar</Link>;
          aqui é só o que pede <em>prova</em>.
        </p>
      </div>
    );
  }

  // ---- Fim da sessão ----
  if (finished) {
    const total = session.acertei + session.quase + session.errei;
    return (
      <div className="grid place-items-center min-h-[60vh]">
        <div className="panel p-8 text-center max-w-md">
          <div className="text-5xl mb-3">∎</div>
          <h1 className="text-xl font-bold">Sessão de provas concluída</h1>
          <p className="text-[var(--color-mut)] text-sm mt-2">
            {total > 0
              ? `${total} demonstrações: ${session.acertei} sólidas, ${session.quase} quase, ${session.errei} para refazer.`
              : "Nenhuma demonstração registrada."}
          </p>
          {session.errei > 0 && (
            <p className="text-xs text-[#ff8080] mt-2">
              As que precisam refazer já estão no <Link href="/revisar/erros" className="underline">modo erros</Link>.
            </p>
          )}
          <div className="flex gap-2 justify-center mt-5">
            <button className="btn" onClick={() => setQueue(null)}>Novos filtros</button>
            <button className="btn btn-primary" onClick={start}>Treinar de novo →</button>
          </div>
        </div>
      </div>
    );
  }

  // ---- Sessão: escrever a prova ----
  const item = current!;
  const total = queue!.length;
  const pct = Math.round((idx / total) * 100);
  const hasReference = !!(item.solution || (item.steps && item.steps.length));

  return (
    <div className="max-w-4xl mx-auto space-y-4 pb-10">
      <div className="flex items-center justify-between text-sm gap-2">
        <span className="text-[var(--color-mut)]">{idx + 1} de {total}</span>
        <div className="flex items-center gap-1.5">
          <span className="chip !py-0.5" title={`Dificuldade ${item.difficulty}/5`}>{"●".repeat(item.difficulty)}</span>
          {item.subId !== item.trackId && (
            <Link href={`/estudar/${item.trackId}/${item.subId}`} className="chip !py-0.5 hover:!border-[var(--color-brand)]">
              {item.trackTitle} · {item.subTitle}
            </Link>
          )}
        </div>
      </div>
      <div className="h-1 w-full rounded bg-[var(--color-raise)] overflow-hidden">
        <div className="h-full" style={{ width: `${pct}%`, background: "linear-gradient(90deg,#7c5cff,#00d3a7)" }} />
      </div>

      <div className="panel p-6" style={{ borderLeft: "3px solid var(--color-brand)" }}>
        <div className="text-[10px] uppercase tracking-widest text-[var(--color-brand)] mb-2 font-bold">Enunciado</div>
        <div className="text-[15px]"><Markdown>{item.prompt}</Markdown></div>
        {!revealed && item.hint && (
          <details className="mt-3">
            <summary className="text-xs text-[var(--color-brand)] cursor-pointer select-none">Preciso de uma dica</summary>
            <div className="mt-1 text-sm"><Markdown>{item.hint}</Markdown></div>
          </details>
        )}
      </div>

      {/* Editor da demonstração */}
      <div className="panel p-4 space-y-3">
        <div className="flex items-center justify-between">
          <div className="text-sm font-bold">Sua demonstração</div>
          <span className="text-[11px] text-[var(--color-mut)]">markdown + LaTeX ($…$) · preview ao vivo</span>
        </div>
        <FormulaToolbar
          textareaRef={textareaRef}
          value={proof}
          onInsert={(next, s, e2) => {
            setProof(next);
            setPendingSel({ start: s, end: e2 });
          }}
        />
        <div className="grid md:grid-cols-2 gap-3">
          <textarea
            ref={textareaRef}
            value={proof}
            onChange={(e) => setProof(e.target.value)}
            placeholder={"Seja $\\varepsilon > 0$. Tome…\n\nEstruture: hipóteses → estratégia → passos → conclusão. ∎"}
            className="w-full min-h-[260px] rounded-xl bg-[var(--color-well)] border border-[var(--color-line)] p-3 text-sm font-mono outline-none focus:border-[var(--color-brand)] resize-y"
          />
          <div className="rounded-xl bg-[var(--color-well)] border border-[var(--color-line)] p-3 overflow-y-auto min-h-[260px]">
            <Markdown>{proof || "*Sua prova renderizada aparece aqui…*"}</Markdown>
          </div>
        </div>
        {!revealed && (
          <button className="btn btn-primary w-full" onClick={() => setRevealed(true)} disabled={!proof.trim()}>
            Terminei — comparar com a referência
          </button>
        )}
        {!revealed && !proof.trim() && (
          <p className="text-center text-[11px] text-[var(--color-mut)]">escreva pelo menos um esboço antes de revelar — é o esforço que ensina</p>
        )}
      </div>

      {/* Referência + rubrica */}
      {revealed && (
        <>
          <div className="panel p-5" style={{ borderLeft: "3px solid var(--color-brand2)" }}>
            <div className="text-[10px] uppercase tracking-widest text-[var(--color-brand2)] mb-2 font-bold">
              Referência
            </div>
            {hasReference ? (
              <>
                {item.steps && item.steps.length > 0 && (
                  <ol className="space-y-1.5 mb-2">
                    {item.steps.map((s, k) => (
                      <li key={k} className="flex gap-2 text-sm">
                        <span className="chip !py-0 !px-1.5 shrink-0 h-fit">{k + 1}</span>
                        <div className="flex-1"><Markdown className="inline">{s}</Markdown></div>
                      </li>
                    ))}
                  </ol>
                )}
                {item.solution && <Markdown>{item.solution}</Markdown>}
              </>
            ) : (
              <p className="text-sm text-[var(--color-mut)]">
                Sem referência cadastrada — avalie sua prova contra o enunciado{item.hint ? " e a dica" : ""}: cada
                hipótese foi usada? cada passo está justificado?
              </p>
            )}
          </div>

          <div className="panel p-5 space-y-4">
            <div className="text-sm font-bold">Rubrica — seja seu pior revisor</div>
            <div className="grid sm:grid-cols-3 gap-3">
              {RUBRIC_AXES.map((axis) => (
                <div key={axis.key} className="space-y-1.5">
                  <div className="text-xs font-semibold">{axis.label}</div>
                  <div className="text-[11px] text-[var(--color-mut)]">{axis.question}</div>
                  <div className="flex flex-col gap-1">
                    {axis.levels.map((lv, val) => (
                      <button
                        key={val}
                        onClick={() => setRubric((r) => ({ ...r, [axis.key]: val as 0 | 1 | 2 }))}
                        aria-pressed={rubric[axis.key] === val}
                        className={`chip !justify-start !py-1 w-full text-left transition-colors ${
                          rubric[axis.key] === val
                            ? val === 2
                              ? "!border-[#00d3a7] !text-[#00d3a7]"
                              : val === 1
                                ? "!border-[#f6c453] !text-[#f6c453]"
                                : "!border-[#ff6b6b] !text-[#ff6b6b]"
                            : ""
                        }`}
                      >
                        {lv}
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>

            <div className="flex flex-wrap items-center gap-3 pt-2 border-t border-[var(--color-line)]">
              {grade ? (
                <span className="text-sm font-semibold" style={{ color: GRADE_COLOR[grade] }}>
                  → {GRADE_MEANING[grade]}
                </span>
              ) : (
                <span className="text-xs text-[var(--color-mut)]">marque os três eixos para registrar</span>
              )}
              <div className="ml-auto flex gap-2">
                <button className="btn text-sm" onClick={saveAsNote} disabled={!grade || savedNote}>
                  {savedNote ? "✓ Salva nas notas" : "∎ Salvar como nota"}
                </button>
                <button className="btn btn-primary text-sm" onClick={submitRubric} disabled={!grade}>
                  Registrar e próxima →
                </button>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function StatCard({ value, label, accent }: { value: React.ReactNode; label: string; accent?: string }) {
  return (
    <div className="panel p-4">
      <div className="text-2xl font-bold" style={{ color: accent }}>{value}</div>
      <div className="text-xs text-[var(--color-mut)] mt-1">{label}</div>
    </div>
  );
}
