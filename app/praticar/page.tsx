"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useApp } from "@/components/AppState";
import Markdown from "@/components/Markdown";
import { buildAllPracticeItems } from "@/lib/practice-data";
import {
  buildPracticeQueue,
  gradePractice,
  practiceStats,
  latestByExKey,
  type PracticeItem,
  type PracticeFilters,
  type PracticeGrade,
} from "@/lib/practice";

const GRADES: { g: PracticeGrade; label: string; color: string; key: string; hint: string }[] = [
  { g: "errei", label: "Errei", color: "#ff6b6b", key: "1", hint: "volta já nesta sessão" },
  { g: "quase", label: "Quase", color: "#f6c453", key: "2", hint: "volta amanhã" },
  { g: "acertei", label: "Acertei", color: "#00d3a7", key: "3", hint: "espaça no tempo" },
];

// Constrói todos os itens praticáveis do currículo (builder compartilhado;
// depende de `ready` porque o currículo carrega em runtime).
function useAllItems(ready: boolean): PracticeItem[] {
  // eslint-disable-next-line react-hooks/exhaustive-deps
  return useMemo(() => buildAllPracticeItems(), [ready]);
}

export default function PraticarPage() {
  const { ready, attempts, recordAttempt } = useApp();
  const allItems = useAllItems(ready);
  const attemptsArr = useMemo(() => [...attempts.values()], [attempts]);

  const [filters, setFilters] = useState<PracticeFilters>({ exam: "all", difficulty: 0 });
  const [queue, setQueue] = useState<PracticeItem[] | null>(null);
  const [idx, setIdx] = useState(0);
  const [revealed, setRevealed] = useState(false);
  const [session, setSession] = useState({ acertei: 0, quase: 0, errei: 0 });

  // Opções de filtro derivadas dos itens (só o que existe aparece).
  const trackOptions = useMemo(() => {
    const seen = new Map<string, string>();
    for (const it of allItems) if (!seen.has(it.trackId)) seen.set(it.trackId, it.trackTitle);
    return [...seen.entries()];
  }, [allItems]);
  const sourceOptions = useMemo(() => {
    const s = new Set<string>();
    for (const it of allItems) if (it.source?.exam) s.add(it.source.exam);
    return [...s].sort();
  }, [allItems]);

  const stats = useMemo(() => practiceStats(attemptsArr), [attemptsArr]);
  const preview = useMemo(
    () => buildPracticeQueue(allItems, attemptsArr, filters, Date.now()),
    [allItems, attemptsArr, filters]
  );

  function startDeck() {
    setQueue(buildPracticeQueue(allItems, attemptsArr, filters, Date.now()));
    setIdx(0);
    setRevealed(false);
    setSession({ acertei: 0, quase: 0, errei: 0 });
  }

  const current = queue ? queue[idx] : undefined;
  const finished = queue !== null && (idx >= queue.length || !current);

  async function grade(g: PracticeGrade) {
    if (!current || !queue) return;
    const now = Date.now();
    const latest = latestByExKey(attemptsArr).get(current.exKey);
    const attempt = gradePractice(current, g, latest, now);
    await recordAttempt(attempt);
    setSession((s) => ({ ...s, [g]: s[g] + 1 }));
    const nextQueue = [...queue];
    if (g === "errei") nextQueue.push(current); // reaparece na deck
    setQueue(nextQueue);
    setIdx((i) => i + 1);
    setRevealed(false);
  }

  // Atalhos: espaço/enter revela; 1/2/3 avaliam.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (!current || finished) return;
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === "INPUT" || tag === "SELECT" || tag === "TEXTAREA") return;
      if (!revealed && (e.key === " " || e.key === "Enter")) {
        e.preventDefault();
        setRevealed(true);
      } else if (revealed) {
        const found = GRADES.find((x) => x.key === e.key);
        if (found) grade(found.g);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [revealed, finished, idx, current]);

  if (!ready) return <div className="text-[var(--color-mut)]">Carregando…</div>;

  // ---- Tela de configuração / entrada da deck ----
  if (queue === null) {
    return (
      <div className="max-w-3xl mx-auto space-y-6">
        <header>
          <h1 className="text-2xl md:text-3xl font-extrabold tracking-tight">✎ Banco de prática</h1>
          <p className="text-[var(--color-mut)] mt-1 text-sm">
            Aqui você <span className="text-[var(--color-txt)] font-semibold">resolve exercícios</span> — a habilidade que
            concurso e mestrado cobram. (Memorizar definições fica no{" "}
            <Link href="/revisar" className="text-[var(--color-brand)]">Revisar</Link>.) Tente no papel, revele a
            solução e se avalie: o que erra volta, o que acerta se espaça.
          </p>
        </header>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <StatCard value={stats.totalAttempts} label="Tentativas" />
          <StatCard value={`${Math.round(stats.accuracy * 100)}%`} label="Acerto" accent="#00d3a7" />
          <StatCard value={stats.streak} label="Sequência" accent="#f6c453" />
          <StatCard value={stats.distinctPracticed} label="Exercícios vistos" />
        </div>

        <section className="panel p-6 space-y-5 text-center">
          <div>
            <div className="text-3xl font-extrabold">{preview.length}</div>
            <div className="text-xs text-[var(--color-mut)]">exercícios prontos para praticar agora</div>
          </div>
          <button className="btn btn-primary !px-8 !py-3 text-base mx-auto" onClick={startDeck} disabled={preview.length === 0}>
            ▶ Começar agora
          </button>

          <div className="flex items-center justify-center gap-2 flex-wrap pt-1">
            <span className="text-xs text-[var(--color-mut)]">Foco:</span>
            {([["all", "Tudo"], ["if", "Concurso IF"], ["mestrado", "Mestrado"]] as const).map(([v, l]) => (
              <button
                key={v}
                onClick={() => setFilters((f) => ({ ...f, exam: v }))}
                className={`chip ${(filters.exam ?? "all") === v ? "!border-[var(--color-brand)] !text-[var(--color-txt)]" : ""}`}
              >
                {l}
              </button>
            ))}
          </div>

          <details className="text-left">
            <summary className="text-xs text-[var(--color-brand)] cursor-pointer select-none text-center">
              Filtros avançados (trilha, dificuldade, fonte)
            </summary>
            <div className="grid sm:grid-cols-3 gap-3 mt-3">
              <Field label="Trilha">
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
              </Field>
              <Field label="Dificuldade">
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
              </Field>
              <Field label="Fonte (prova)">
                <select
                  className="w-full rounded-xl bg-[var(--color-well)] border border-[var(--color-line)] p-2.5 text-sm outline-none focus:border-[var(--color-brand)] disabled:opacity-50"
                  value={filters.source ?? ""}
                  onChange={(e) => setFilters((f) => ({ ...f, source: e.target.value || undefined }))}
                  disabled={sourceOptions.length === 0}
                >
                  <option value="">Todas</option>
                  {sourceOptions.map((s) => (
                    <option key={s} value={s}>{s}</option>
                  ))}
                </select>
              </Field>
            </div>
            <button className="btn mt-3 text-xs" onClick={() => setFilters({ exam: "all", difficulty: 0 })}>
              Limpar filtros
            </button>
          </details>

          {preview.length === 0 && (
            <p className="text-xs text-[#ff8080]">Nenhum exercício com esses filtros — troque o foco ou limpe os filtros.</p>
          )}
        </section>
      </div>
    );
  }

  // ---- Fim da deck ----
  if (finished) {
    const total = session.acertei + session.quase + session.errei;
    return (
      <div className="grid place-items-center min-h-[60vh]">
        <div className="panel p-8 text-center max-w-md">
          <div className="text-5xl mb-3">{session.errei === 0 && total > 0 ? "🏆" : "✎"}</div>
          <h1 className="text-xl font-bold">Prática concluída!</h1>
          <p className="text-[var(--color-mut)] text-sm mt-2">
            {total > 0
              ? `Você resolveu ${total} tentativas: ${session.acertei} certas, ${session.quase} quase, ${session.errei} erradas.`
              : "Nenhum exercício praticado."}
          </p>
          <div className="flex gap-2 justify-center mt-5">
            <button className="btn" onClick={() => setQueue(null)}>Novos filtros</button>
            <button className="btn btn-primary" onClick={startDeck}>Praticar de novo →</button>
          </div>
        </div>
      </div>
    );
  }

  // ---- Card em andamento ----
  const item = current!;
  const total = queue!.length;
  const pct = Math.round((idx / total) * 100);
  const hasSolution = !!(item.solution || (item.steps && item.steps.length));

  return (
    <div className="max-w-2xl mx-auto">
      <div className="flex items-center justify-between mb-3 text-sm gap-2">
        <span className="text-[var(--color-mut)]">{idx + 1} de {total}</span>
        <div className="flex items-center gap-1.5 flex-wrap justify-end">
          {item.source && (
            <span className="chip !py-0.5" title="Fonte">
              {item.source.exam}{item.source.year ? ` ${item.source.year}` : ""}
              {item.source.institution ? ` · ${item.source.institution}` : ""}
            </span>
          )}
          <span className="chip !py-0.5" title={`Dificuldade ${item.difficulty}/5`}>{"●".repeat(item.difficulty)}</span>
        </div>
      </div>
      <div className="h-1 w-full rounded bg-[var(--color-raise)] mb-4 overflow-hidden">
        <div className="h-full" style={{ width: `${pct}%`, background: "linear-gradient(90deg,#7c5cff,#00d3a7)" }} />
      </div>

      <div className="text-xs text-[var(--color-mut)] mb-2">
        {item.subId !== item.trackId ? (
          <Link href={`/estudar/${item.trackId}/${item.subId}`} className="hover:text-[var(--color-txt)]">
            {item.trackTitle} · {item.subTitle}
          </Link>
        ) : (
          <span>{item.trackTitle} · {item.subTitle}</span>
        )}
      </div>

      <div className="panel p-6">
        <div className="text-[15px]"><Markdown>{item.prompt}</Markdown></div>

        {!revealed && item.hint && (
          <details className="mt-3">
            <summary className="text-xs text-[var(--color-brand)] cursor-pointer select-none">Dica</summary>
            <div className="mt-1 text-sm"><Markdown>{item.hint}</Markdown></div>
          </details>
        )}

        {revealed ? (
          <div className="mt-5 pt-4 border-t border-[var(--color-line)]">
            {hasSolution ? (
              <>
                <div className="text-xs uppercase tracking-wide text-[var(--color-brand2)] mb-2">Solução</div>
                {item.solution && <Markdown>{item.solution}</Markdown>}
                {item.steps && item.steps.length > 0 && (
                  <ol className="mt-2 space-y-1.5 list-decimal list-inside">
                    {item.steps.map((s, i) => (
                      <li key={i} className="text-sm text-[var(--color-txt2)]"><Markdown className="inline">{s}</Markdown></li>
                    ))}
                  </ol>
                )}
              </>
            ) : (
              <p className="text-sm text-[var(--color-mut)]">
                Sem solução cadastrada — confira sua resposta pelo enunciado{item.hint ? " e pela dica" : ""} e
                avalie-se com honestidade.
              </p>
            )}
          </div>
        ) : (
          <div className="mt-5">
            <button className="btn btn-primary w-full" onClick={() => setRevealed(true)}>
              Tentei — ver solução
            </button>
            <p className="mt-2 text-center text-[11px] text-[var(--color-mut)]">
              resolva no papel primeiro; só então revele (espaço)
            </p>
          </div>
        )}
      </div>

      {revealed && (
        <div className="grid grid-cols-3 gap-2 mt-4">
          {GRADES.map((x) => (
            <button
              key={x.g}
              onClick={() => grade(x.g)}
              className="btn flex-col !py-3 hover:!border-current"
              style={{ color: x.color }}
            >
              <span className="font-bold">{x.label}</span>
              <span className="text-[10px] text-[var(--color-mut)]">{x.hint}</span>
            </button>
          ))}
        </div>
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

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="block text-xs text-[var(--color-mut)] mb-1">{label}</span>
      {children}
    </label>
  );
}
