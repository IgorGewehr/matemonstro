"use client";

// Simulado cronometrado: condições de prova de verdade. Sorteia questões com
// gabarito, roda o relógio, e na correção cada erro volta pro SRS de prática
// (modo erros). Histórico de desempenho fica no aparelho.

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { useApp } from "@/components/AppState";
import Markdown from "@/components/Markdown";
import {
  simPool,
  drawSimQuestions,
  suggestedMinutes,
  formatClock,
  loadSimHistory,
  saveSimResult,
  type SimResult,
} from "@/lib/simulado";
import { gradePractice, latestByExKey, type PracticeItem, type PracticeFilters } from "@/lib/practice";

type Phase = "config" | "running" | "review" | "done";
type SelfGrade = "certa" | "errada" | "branco";

const COUNTS = [5, 10, 15, 20];

export default function SimuladoPage() {
  const { ready, attempts, recordAttempt } = useApp();
  const attemptsArr = useMemo(() => [...attempts.values()], [attempts]);

  const [phase, setPhase] = useState<Phase>("config");
  const [exam, setExam] = useState<"all" | "if" | "mestrado">("all");
  const [count, setCount] = useState(10);
  const [minutes, setMinutes] = useState<number | null>(null); // null = sugerido
  const [history, setHistory] = useState<SimResult[]>([]);

  const [questions, setQuestions] = useState<PracticeItem[]>([]);
  const [answers, setAnswers] = useState<Record<number, string>>({});
  const [grades, setGrades] = useState<Record<number, SelfGrade>>({});
  const [cursor, setCursor] = useState(0);
  const [remaining, setRemaining] = useState(0);
  const [usedSec, setUsedSec] = useState(0);
  const startRef = useRef(0);
  const totalSecRef = useRef(0);

  const filters: PracticeFilters = useMemo(() => ({ exam, difficulty: 0 }), [exam]);
  // depende de `ready`: o currículo carrega em runtime
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const pool = useMemo(() => simPool(filters), [filters, ready]);
  const effMinutes = minutes ?? suggestedMinutes(count);

  useEffect(() => {
    loadSimHistory().then(setHistory).catch(() => {});
  }, []);

  // Relógio: 1 tick/segundo enquanto roda; em 0, entrega automaticamente.
  useEffect(() => {
    if (phase !== "running") return;
    const t = setInterval(() => {
      const elapsed = (Date.now() - startRef.current) / 1000;
      const left = totalSecRef.current - elapsed;
      setRemaining(left);
      if (left <= 0) {
        setUsedSec(totalSecRef.current);
        setPhase("review");
      }
    }, 1000);
    return () => clearInterval(t);
  }, [phase]);

  function start() {
    const qs = drawSimQuestions(pool, Math.min(count, pool.length));
    if (qs.length === 0) return;
    setQuestions(qs);
    setAnswers({});
    setGrades({});
    setCursor(0);
    startRef.current = Date.now();
    totalSecRef.current = effMinutes * 60;
    setRemaining(effMinutes * 60);
    setPhase("running");
  }

  function deliver() {
    setUsedSec(Math.min(totalSecRef.current, (Date.now() - startRef.current) / 1000));
    setPhase("review");
  }

  const allGraded = questions.length > 0 && questions.every((_, i) => grades[i]);

  async function register() {
    if (!allGraded) return;
    const now = Date.now();
    const latest = latestByExKey(attemptsArr);
    let certas = 0;
    let erradas = 0;
    let emBranco = 0;
    for (let i = 0; i < questions.length; i++) {
      const g = grades[i]!;
      if (g === "certa") {
        certas++;
        await recordAttempt(gradePractice(questions[i], "acertei", latest.get(questions[i].exKey), now + i));
      } else if (g === "errada") {
        erradas++;
        await recordAttempt(gradePractice(questions[i], "errei", latest.get(questions[i].exKey), now + i));
      } else {
        emBranco++;
      }
    }
    const result: SimResult = {
      ts: now,
      total: questions.length,
      certas,
      erradas,
      emBranco,
      minutes: effMinutes,
      usedSec: Math.round(usedSec),
      exam,
    };
    setHistory(await saveSimResult(result));
    setPhase("done");
  }

  if (!ready) return <div className="text-[var(--color-mut)]">Carregando…</div>;

  // ---- Configuração ----
  if (phase === "config") {
    return (
      <div className="max-w-3xl mx-auto space-y-6">
        <header>
          <h1 className="text-2xl md:text-3xl font-extrabold tracking-tight">◷ Simulado</h1>
          <p className="text-[var(--color-mut)] mt-1 text-sm">
            Prova de verdade tem relógio. Sorteamos questões com gabarito, você resolve no papel sob pressão de
            tempo, e cada erro volta pro <Link href="/revisar/erros" className="text-[var(--color-brand)]">modo erros</Link>.
          </p>
        </header>

        <section className="panel p-6 space-y-5">
          <Row label="Foco">
            {([["all", "Tudo"], ["if", "Concurso IF"], ["mestrado", "Mestrado"]] as const).map(([v, l]) => (
              <button
                key={v}
                onClick={() => setExam(v)}
                aria-pressed={exam === v}
                className={`chip ${exam === v ? "!border-[var(--color-brand)] !text-[var(--color-txt)]" : ""}`}
              >
                {l}
              </button>
            ))}
          </Row>
          <Row label="Questões">
            {COUNTS.map((c) => (
              <button
                key={c}
                onClick={() => { setCount(c); setMinutes(null); }}
                aria-pressed={count === c}
                className={`chip ${count === c ? "!border-[var(--color-brand)] !text-[var(--color-txt)]" : ""}`}
              >
                {c}
              </button>
            ))}
          </Row>
          <Row label="Tempo">
            <button
              onClick={() => setMinutes(null)}
              aria-pressed={minutes === null}
              className={`chip ${minutes === null ? "!border-[var(--color-brand)] !text-[var(--color-txt)]" : ""}`}
            >
              sugerido · {suggestedMinutes(count)} min
            </button>
            {[30, 60, 90, 120].map((m) => (
              <button
                key={m}
                onClick={() => setMinutes(m)}
                aria-pressed={minutes === m}
                className={`chip ${minutes === m ? "!border-[var(--color-brand)] !text-[var(--color-txt)]" : ""}`}
              >
                {m} min
              </button>
            ))}
          </Row>

          <div className="text-center pt-2">
            <div className="text-xs text-[var(--color-mut)] mb-3">
              {pool.length} questões com gabarito disponíveis neste foco
            </div>
            <button className="btn btn-primary !px-8 !py-3 text-base" onClick={start} disabled={pool.length === 0}>
              ◷ Iniciar simulado — {Math.min(count, pool.length)} questões · {effMinutes} min
            </button>
          </div>
        </section>

        {history.length > 0 && (
          <section className="panel p-5">
            <h2 className="font-bold mb-3 text-sm">Histórico</h2>
            <div className="space-y-2">
              {history.slice(0, 8).map((h) => {
                const pct = h.total ? Math.round((h.certas / h.total) * 100) : 0;
                const color = pct >= 70 ? "#00d3a7" : pct >= 50 ? "#f6c453" : "#ff6b6b";
                return (
                  <div key={h.ts} className="flex items-center gap-3 text-sm">
                    <span className="font-bold w-14 text-right" style={{ color }}>{pct}%</span>
                    <div className="flex-1 h-1.5 rounded bg-[var(--color-raise)] overflow-hidden">
                      <div className="h-full" style={{ width: `${pct}%`, background: color }} />
                    </div>
                    <span className="text-[var(--color-mut)] text-xs whitespace-nowrap">
                      {h.certas}/{h.total} · {formatClock(h.usedSec)} ·{" "}
                      {new Date(h.ts).toLocaleDateString("pt-BR", { day: "2-digit", month: "short" })}
                    </span>
                  </div>
                );
              })}
            </div>
          </section>
        )}
      </div>
    );
  }

  // ---- Prova rodando ----
  if (phase === "running") {
    const q = questions[cursor];
    const fracLeft = totalSecRef.current ? remaining / totalSecRef.current : 0;
    const clockColor = fracLeft < 0.1 ? "#ff6b6b" : fracLeft < 0.25 ? "#f6c453" : "var(--color-txt)";
    return (
      <div className="max-w-3xl mx-auto space-y-4 pb-10">
        <div className="panel p-3 sticky top-3 z-20 backdrop-blur bg-[var(--color-scrim)] flex items-center gap-3 flex-wrap">
          <span className="font-mono text-2xl font-bold tabular-nums" style={{ color: clockColor }} aria-live="off">
            {formatClock(remaining)}
          </span>
          <div className="flex gap-1 flex-wrap flex-1 justify-center">
            {questions.map((_, i) => (
              <button
                key={i}
                onClick={() => setCursor(i)}
                aria-label={`Questão ${i + 1}${answers[i]?.trim() ? " (respondida)" : ""}`}
                aria-current={i === cursor ? "true" : undefined}
                className="w-7 h-7 rounded-lg text-xs font-bold border transition-colors"
                style={{
                  borderColor: i === cursor ? "var(--color-brand)" : "#2c3147",
                  background: answers[i]?.trim() ? "#7c5cff33" : "transparent",
                  color: i === cursor ? "var(--color-brand)" : "var(--color-mut)",
                }}
              >
                {i + 1}
              </button>
            ))}
          </div>
          <button className="btn !py-1.5 text-xs" onClick={deliver}>
            Entregar
          </button>
        </div>

        <div className="panel p-6">
          <div className="flex items-center justify-between mb-3 text-xs text-[var(--color-mut)]">
            <span>Questão {cursor + 1} de {questions.length}</span>
            <span className="chip !py-0.5">{"●".repeat(q.difficulty)}</span>
          </div>
          <div className="text-[15px]"><Markdown>{q.prompt}</Markdown></div>
          <textarea
            value={answers[cursor] ?? ""}
            onChange={(e) => setAnswers((a) => ({ ...a, [cursor]: e.target.value }))}
            placeholder="Rascunho da resposta (opcional — o de verdade é no papel)"
            className="w-full min-h-28 mt-4 rounded-xl bg-[var(--color-well)] border border-[var(--color-line)] p-3 text-sm font-mono outline-none focus:border-[var(--color-brand)] resize-y"
          />
        </div>

        <div className="flex justify-between">
          <button className="btn" onClick={() => setCursor((c) => Math.max(0, c - 1))} disabled={cursor === 0}>
            ← Anterior
          </button>
          <button
            className="btn btn-primary"
            onClick={() => setCursor((c) => Math.min(questions.length - 1, c + 1))}
            disabled={cursor === questions.length - 1}
          >
            Próxima →
          </button>
        </div>
      </div>
    );
  }

  // ---- Correção ----
  if (phase === "review") {
    return (
      <div className="max-w-3xl mx-auto space-y-4 pb-10">
        <header className="panel p-5">
          <h1 className="text-xl font-extrabold">Correção — seja honesto</h1>
          <p className="text-sm text-[var(--color-mut)] mt-1">
            Tempo usado: <span className="font-mono">{formatClock(usedSec)}</span> de {effMinutes} min. Compare
            cada resposta com o gabarito e marque. Erradas voltam pro modo erros.
          </p>
        </header>

        {questions.map((q, i) => (
          <div key={q.exKey + i} className="panel p-5 space-y-3">
            <div className="flex items-center justify-between text-xs text-[var(--color-mut)]">
              <span className="font-bold text-sm text-[var(--color-txt)]">Questão {i + 1}</span>
              <span>{q.trackTitle}</span>
            </div>
            <Markdown>{q.prompt}</Markdown>
            {answers[i]?.trim() && (
              <div className="p-3 rounded-xl bg-[var(--color-well)] border border-[var(--color-line)]">
                <div className="text-[10px] uppercase tracking-widest text-[var(--color-mut)] mb-1">Seu rascunho</div>
                <Markdown className="!text-[13px]">{answers[i]}</Markdown>
              </div>
            )}
            <div className="p-3 rounded-xl bg-[var(--color-well)] border-l-2 border-[var(--color-brand2)] border border-[var(--color-line)]">
              <div className="text-[10px] uppercase tracking-widest text-[var(--color-brand2)] mb-1">Gabarito</div>
              {q.steps && q.steps.length > 0 && (
                <ol className="space-y-1 mb-1">
                  {q.steps.map((s, k) => (
                    <li key={k} className="flex gap-2 text-sm">
                      <span className="chip !py-0 !px-1.5 shrink-0 h-fit">{k + 1}</span>
                      <div className="flex-1"><Markdown className="inline">{s}</Markdown></div>
                    </li>
                  ))}
                </ol>
              )}
              {q.solution && <Markdown className="!text-[13px]">{q.solution}</Markdown>}
            </div>
            <div className="flex gap-2">
              {([["certa", "Certa", "#00d3a7"], ["errada", "Errada", "#ff6b6b"], ["branco", "Em branco", "#8a90a6"]] as const).map(
                ([g, label, color]) => (
                  <button
                    key={g}
                    onClick={() => setGrades((gr) => ({ ...gr, [i]: g }))}
                    aria-pressed={grades[i] === g}
                    className="chip !py-1"
                    style={grades[i] === g ? { borderColor: color, color } : undefined}
                  >
                    {label}
                  </button>
                )
              )}
            </div>
          </div>
        ))}

        <div className="panel p-4 sticky bottom-3 backdrop-blur bg-[var(--color-scrim)] flex items-center gap-3">
          <span className="text-xs text-[var(--color-mut)]">
            {Object.keys(grades).length} de {questions.length} corrigidas
          </span>
          <button className="btn btn-primary ml-auto" onClick={register} disabled={!allGraded}>
            Registrar resultado
          </button>
        </div>
      </div>
    );
  }

  // ---- Resultado ----
  const last = history[0];
  const pct = last && last.total ? Math.round((last.certas / last.total) * 100) : 0;
  const color = pct >= 70 ? "#00d3a7" : pct >= 50 ? "#f6c453" : "#ff6b6b";
  return (
    <div className="grid place-items-center min-h-[60vh]">
      <div className="panel p-8 text-center max-w-md w-full">
        <div className="text-5xl font-extrabold mb-1" style={{ color }}>{pct}%</div>
        <h1 className="text-lg font-bold">Simulado registrado</h1>
        {last && (
          <p className="text-sm text-[var(--color-mut)] mt-2">
            {last.certas} certas · {last.erradas} erradas · {last.emBranco} em branco — em {formatClock(last.usedSec)}.
          </p>
        )}
        {last && last.erradas > 0 && (
          <p className="text-xs text-[#ff8080] mt-2">
            As erradas já estão agendadas no <Link href="/revisar/erros" className="underline">modo erros</Link>.
          </p>
        )}
        <div className="flex gap-2 justify-center mt-5">
          <button className="btn" onClick={() => setPhase("config")}>Ver histórico</button>
          <button className="btn btn-primary" onClick={() => { setPhase("config"); setTimeout(start, 0); }}>
            Outro simulado →
          </button>
        </div>
      </div>
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2 flex-wrap">
      <span className="text-xs text-[var(--color-mut)] w-16">{label}</span>
      {children}
    </div>
  );
}
