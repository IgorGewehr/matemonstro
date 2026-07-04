"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useApp } from "@/components/AppState";
import {
  DAY,
  describeInterval,
  isLeech,
  retrievability,
  review as previewReview,
  type Grade,
} from "@/lib/srs";
import { getSubRef } from "@/lib/curriculum";
import Markdown from "@/components/Markdown";
import type { ExerciseAttempt } from "@/lib/types";

const GRADES: { g: Grade; label: string; color: string; key: string }[] = [
  { g: "errei", label: "Errei", color: "#ff6b6b", key: "1" },
  { g: "dificil", label: "Difícil", color: "#f6c453", key: "2" },
  { g: "bom", label: "Bom", color: "var(--color-brand)", key: "3" },
  { g: "facil", label: "Fácil", color: "#00d3a7", key: "4" },
];

type PracticeGrade = "errei" | "quase" | "acertei";
const PG: { g: PracticeGrade; label: string; color: string; days: number }[] = [
  { g: "errei", label: "Errei de novo", color: "#ff6b6b", days: 10 / 1440 },
  { g: "quase", label: "Quase", color: "#f6c453", days: 1 },
  { g: "acertei", label: "Acertei", color: "#00d3a7", days: 3 },
];

// Descritores leves da fila (os cartões são re-buscados por id a cada render,
// pois o SRS muda o objeto após a graduação).
type QItem =
  | { kind: "card"; id: string; subId: string; bad: number }
  | { kind: "ex"; exKey: string; subId: string; trackId: string; bad: number };

function exIndex(exKey: string): number {
  const m = exKey.match(/(\d+)\s*$/);
  return m ? parseInt(m[1], 10) : NaN;
}

export default function RevisarErrosPage() {
  // attempts / recordAttempt vêm da fundação de dados (spec 01);
  // isLeech / retrievability vêm do FSRS-lite (spec 02).
  const { ready, cards, gradeCard, attempts, recordAttempt, progress, settings } = useApp();
  const [queue, setQueue] = useState<QItem[] | null>(null);
  const [idx, setIdx] = useState(0);
  const [revealed, setRevealed] = useState(false);
  const [done, setDone] = useState(0);

  useEffect(() => {
    if (!ready || queue !== null) return;
    const now = Date.now();

    const leeches: QItem[] = cards.filter(isLeech).map((c) => {
      const r = retrievability(c, now);
      const rr = Number.isFinite(r) ? r : 0;
      return { kind: "card", id: c.id, subId: c.subId, bad: 1 - rr + Math.min(c.lapses, 5) * 0.02 };
    });

    // última tentativa por exercício: só conta como erro se o estado mais recente for "errei"
    const latest = new Map<string, ExerciseAttempt>();
    const src = attempts instanceof Map ? attempts.values() : ([] as ExerciseAttempt[]);
    for (const a of src) {
      const prev = latest.get(a.exKey);
      if (!prev || a.ts > prev.ts) latest.set(a.exKey, a);
    }
    const errored: QItem[] = [...latest.values()]
      .filter((a) => a.grade === "errei")
      .map((a) => ({ kind: "ex", exKey: a.exKey, subId: a.subId, trackId: a.trackId, bad: 0.9 }));

    const all = [...leeches, ...errored].sort((x, y) => y.bad - x.bad);
    setQueue(all);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready]);

  const item = queue ? queue[idx] : undefined;
  const finished = queue !== null && (idx >= queue.length || !item);

  const card = useMemo(() => {
    if (!item || item.kind !== "card") return undefined;
    return cards.find((c) => c.id === item.id);
  }, [item, cards]);

  async function advance(pushBack?: QItem) {
    setDone((d) => d + 1);
    if (pushBack) {
      setQueue((q) => (q ? [...q, pushBack] : q));
    }
    setIdx((i) => i + 1);
    setRevealed(false);
  }

  async function gradeCardItem(g: Grade) {
    if (!card || !item) return;
    await gradeCard(card, g);
    await advance(g === "errei" ? item : undefined);
  }

  async function gradeExItem(pg: PracticeGrade) {
    if (!item || item.kind !== "ex") return;
    const now = Date.now();
    const cfg = PG.find((x) => x.g === pg)!;
    if (recordAttempt) {
      await recordAttempt({
        id: `${item.exKey}::${now}`,
        exKey: item.exKey,
        subId: item.subId,
        trackId: item.trackId,
        grade: pg,
        ts: now,
        due: now + cfg.days * DAY,
      });
    }
    await advance(pg === "errei" ? item : undefined);
  }

  // atalhos de teclado (apenas para cartões)
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (finished || !item || item.kind !== "card") return;
      if (!revealed && (e.key === " " || e.key === "Enter")) {
        e.preventDefault();
        setRevealed(true);
      } else if (revealed) {
        const found = GRADES.find((x) => x.key === e.key);
        if (found) gradeCardItem(found.g);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [revealed, finished, idx, card, item]);

  if (!ready || queue === null) return <div className="text-[var(--color-mut)]">Carregando…</div>;

  if (queue.length === 0 || finished) {
    return (
      <div className="grid place-items-center min-h-[60vh]">
        <div className="panel p-8 text-center max-w-md mm-pop">
          <div className="text-4xl mb-3 text-[var(--color-brand)] font-bold">
            {queue.length === 0 ? "✓" : "✦"}
          </div>
          <h1 className="text-xl font-bold">
            {queue.length === 0 ? "Nada para treinar aqui" : "Sessão de erros concluída!"}
          </h1>
          <p className="text-[var(--color-mut)] text-sm mt-2">
            {queue.length === 0
              ? "Você não tem cartões-problema nem exercícios errados no momento. Continue estudando e praticando — o que você errar aparece aqui."
              : `Você treinou ${done} itens que costumava errar. Repetir os erros até virar acerto é onde a nota muda.`}
          </p>
          <div className="flex gap-2 justify-center mt-5">
            <Link href="/revisar" className="btn">Revisão normal</Link>
            <Link href="/" className="btn btn-primary">Voltar ao Hoje</Link>
          </div>
        </div>
      </div>
    );
  }

  const ref = getSubRef(item!.subId);
  const pitfalls = ref?.sub.commonPitfalls ?? [];
  const keyPoints = (progress.get(item!.subId)?.keyPoints ?? "").trim();
  const total = queue.length;
  const pct = Math.round((idx / total) * 100);

  return (
    <div className="max-w-2xl mx-auto mm-enter">
      <div className="flex items-center justify-between mb-4 text-sm">
        <span className="text-[#ff6b6b] font-semibold">Modo erros — {idx + 1} de {total}</span>
        {ref && (
          <Link href={`/estudar/${ref.track.id}/${ref.sub.id}`} className="chip hover:border-[var(--color-brand)]">
            {ref.sub.title}
          </Link>
        )}
      </div>
      <div className="h-1 w-full rounded bg-[var(--color-raise)] mb-6 overflow-hidden">
        <div className="h-full" style={{ width: `${pct}%`, background: "linear-gradient(90deg,#ff6b6b,#f6c453)" }} />
      </div>

      {/* Item */}
      {item!.kind === "card" && card ? (
        <>
          <div
            className={`panel p-8 min-h-[220px] flex flex-col items-center justify-center text-center ${
              !revealed ? "cursor-pointer" : ""
            }`}
            onClick={() => !revealed && setRevealed(true)}
          >
            <div className="text-lg"><Markdown>{card.front}</Markdown></div>
            {revealed ? (
              <div className="w-full mm-pop">
                <div className="my-5 w-full border-t border-[var(--color-line)]" />
                <div className="text-[var(--color-txt2)]"><Markdown>{card.back}</Markdown></div>
              </div>
            ) : (
              <div className="mt-6 text-xs text-[var(--color-mut)]">clique ou aperte espaço para revelar</div>
            )}
          </div>
          {revealed && (
            <div className="grid grid-cols-4 gap-2 mt-4 mm-pop">
              {GRADES.map((x) => {
                const preview = previewReview(card, x.g, Date.now(), { requestRetention: settings?.requestRetention });
                return (
                  <button
                    key={x.g}
                    onClick={() => gradeCardItem(x.g)}
                    className="btn flex-col !py-3 hover:!border-current transition-colors"
                    style={{ color: x.color }}
                  >
                    <span className="font-bold">{x.label}</span>
                    <span className="text-[10px] text-[var(--color-mut)]">{describeInterval(preview)}</span>
                  </button>
                );
              })}
            </div>
          )}
        </>
      ) : (
        <ExerciseCard
          item={item as Extract<QItem, { kind: "ex" }>}
          revealed={revealed}
          onReveal={() => setRevealed(true)}
          onGrade={gradeExItem}
        />
      )}

      {/* Âncoras: por que costumo errar + o principal com minhas palavras */}
      {(pitfalls.length > 0 || keyPoints) && (
        <div className="mt-5 space-y-3">
          {pitfalls.length > 0 && (
            <div className="panel p-4">
              <div className="text-sm font-semibold text-[var(--color-warm)] mb-2">Por que eu costumo errar isto</div>
              <ul className="space-y-1.5">
                {pitfalls.map((c, i) => (
                  <li key={i} className="flex gap-2 text-sm text-[var(--color-warm)]">
                    <span>•</span>
                    <span><Markdown className="inline">{c}</Markdown></span>
                  </li>
                ))}
              </ul>
            </div>
          )}
          {keyPoints && (
            <details className="panel p-4">
              <summary className="text-sm font-semibold cursor-pointer select-none text-[var(--color-brand)]">
                ✎ Minhas anotações (o principal)
              </summary>
              <div className="mt-2 text-sm"><Markdown>{keyPoints}</Markdown></div>
            </details>
          )}
        </div>
      )}
    </div>
  );
}

function ExerciseCard({
  item,
  revealed,
  onReveal,
  onGrade,
}: {
  item: Extract<QItem, { kind: "ex" }>;
  revealed: boolean;
  onReveal: () => void;
  onGrade: (g: PracticeGrade) => void;
}) {
  const ref = getSubRef(item.subId);
  const i = exIndex(item.exKey);
  const ex = ref && Number.isFinite(i) ? ref.sub.exercises?.[i] : undefined;

  return (
    <>
      <div className="panel p-6 min-h-[200px]">
        <div className="flex items-center gap-2 mb-3">
          <span className="chip !text-[#ff6b6b] !border-[#ff6b6b]">Exercício que você errou</span>
          {ex && <span className="chip !py-0.5" title={`Dificuldade ${ex.difficulty}/5`}>{"●".repeat(ex.difficulty)}</span>}
        </div>
        {ex ? (
          <div className="text-[15px]"><Markdown>{ex.prompt}</Markdown></div>
        ) : (
          <div className="text-sm text-[var(--color-mut)]">
            Exercício <code className="text-[var(--color-txt2)]">{item.exKey}</code>
            {ref && <> — de <strong>{ref.sub.title}</strong></>}. Reveja o enunciado na aula e tente de novo.
          </div>
        )}
        {ex?.hint && !revealed && (
          <details className="mt-3">
            <summary className="text-xs text-[var(--color-brand)] cursor-pointer select-none">Dica</summary>
            <div className="mt-1 text-sm"><Markdown>{ex.hint}</Markdown></div>
          </details>
        )}
        {!revealed ? (
          <button onClick={onReveal} className="btn btn-primary mt-4">Tentei — mostrar como me saí</button>
        ) : (
          <div className="mt-4">
            {ex?.hint && (
              <div className="mb-3 p-3 rounded-xl bg-[var(--color-card)] border border-[var(--color-line)]">
                <div className="text-xs text-[var(--color-mut)] mb-1">Dica / caminho</div>
                <Markdown>{ex.hint}</Markdown>
              </div>
            )}
            <div className="text-sm text-[var(--color-mut)] mb-2">Como você se saiu desta vez?</div>
            <div className="grid grid-cols-3 gap-2">
              {PG.map((x) => (
                <button
                  key={x.g}
                  onClick={() => onGrade(x.g)}
                  className="btn flex-col !py-3 hover:!border-current transition-colors"
                  style={{ color: x.color }}
                >
                  <span className="font-bold">{x.label}</span>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </>
  );
}
