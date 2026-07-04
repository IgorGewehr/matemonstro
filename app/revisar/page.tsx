"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { useApp } from "@/components/AppState";
import { useCelebrate } from "@/components/Celebrate";
import { XP } from "@/lib/gamification";
import {
  dueCards,
  dueSoon,
  describeInterval,
  isLeech,
  review as previewReview,
  type Grade,
} from "@/lib/srs";
import { cappedDueCards } from "@/lib/scheduler";
import { getSubRef } from "@/lib/curriculum";
import Markdown from "@/components/Markdown";

const GRADES: { g: Grade; label: string; color: string; key: string }[] = [
  { g: "errei", label: "Errei", color: "#ff6b6b", key: "1" },
  { g: "dificil", label: "Difícil", color: "#f6c453", key: "2" },
  { g: "bom", label: "Bom", color: "#7c5cff", key: "3" },
  { g: "facil", label: "Fácil", color: "#00d3a7", key: "4" },
];

type Predicted = "sim" | "talvez" | "nao";
const PREDICTIONS: { p: Predicted; label: string; color: string }[] = [
  { p: "sim", label: "Vou lembrar", color: "#00d3a7" },
  { p: "talvez", label: "Talvez", color: "#f6c453" },
  { p: "nao", label: "Não vou", color: "#ff6b6b" },
];

/**
 * Enterro de irmãos: reordena de forma estável para evitar dois cartões do
 * mesmo subtópico em sequência quando há alternativas na fila.
 */
function burySiblings<T extends { subId: string }>(items: T[]): T[] {
  const pool = [...items];
  const out: T[] = [];
  let lastSub: string | null = null;
  while (pool.length) {
    let idx = pool.findIndex((c) => c.subId !== lastSub);
    if (idx === -1) idx = 0; // só restam irmãos: inevitável
    const [picked] = pool.splice(idx, 1);
    out.push(picked);
    lastSub = picked.subId;
  }
  return out;
}

export default function RevisarPage() {
  // recordReviewEvent e settings.calibration vêm da fundação de dados (spec 01);
  // isLeech vem do scheduler FSRS-lite (spec 02). Programado contra esses contratos.
  const { ready, cards, gradeCard, settings, recordReviewEvent } = useApp();
  const [queue, setQueue] = useState<string[] | null>(null);
  const [idx, setIdx] = useState(0);
  const [revealed, setRevealed] = useState(false);
  const [predicted, setPredicted] = useState<Predicted | undefined>(undefined);
  const [done, setDone] = useState(0);
  const { celebrate } = useCelebrate();
  const celebratedRef = useRef(false);

  const calibration = !!settings?.calibration;

  useEffect(() => {
    if (ready && queue === null) {
      // Teto diario de revisoes: o excedente fica vencido para amanha (mesma
      // fila que a home/badge/notificacao mostram — fonte unica em scheduler).
      const ordered = burySiblings(cappedDueCards(cards, settings, Date.now()));
      setQueue(ordered.map((c) => c.id));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready]);

  const soon = useMemo(() => (ready ? dueSoon(cards, Date.now(), 3).length : 0), [ready, cards]);
  const errorCount = useMemo(() => (ready ? cards.filter(isLeech).length : 0), [ready, cards]);

  const currentId = queue ? queue[idx] : undefined;
  const card = currentId ? cards.find((c) => c.id === currentId) : undefined;
  const finished = queue !== null && (idx >= queue.length || !card);

  // Confete ao fechar a sessao (uma vez), reforcando o ato mais importante do dia.
  useEffect(() => {
    if (finished && done > 0 && !celebratedRef.current) {
      celebratedRef.current = true;
      celebrate({
        kind: "generic",
        title: "Revisão fechada!",
        message: `+${done * XP.perReview} XP · ${done} cartões que você não vai esquecer tão cedo.`,
      });
    }
  }, [finished, done, celebrate]);

  async function grade(g: Grade) {
    if (!card) return;
    if (calibration && recordReviewEvent) {
      const now = Date.now();
      await recordReviewEvent({
        id: `${card.id}::${now}`,
        cardId: card.id,
        subId: card.subId,
        predicted,
        grade: g,
        ts: now,
      });
    }
    await gradeCard(card, g);
    setDone((d) => d + 1);
    const nextQueue = [...queue!];
    if (g === "errei") nextQueue.push(card.id); // volta no fim da sessão
    setQueue(nextQueue);
    setIdx((i) => i + 1);
    setRevealed(false);
    setPredicted(undefined);
  }

  function reveal(p?: Predicted) {
    if (p) setPredicted(p);
    setRevealed(true);
  }

  // atalhos de teclado
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (finished) return;
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
  }, [revealed, finished, idx, card, calibration, predicted]);

  if (!ready || queue === null) return <div className="text-[var(--color-mut)]">Carregando…</div>;

  if (finished) {
    // Cartões ainda vencidos = excedente cortado pelo teto do dia (voltam amanhã).
    const overflow = dueCards(cards, Date.now()).length;
    const cap = settings?.maxReviewsPerDay ?? 120;
    return (
      <div className="grid place-items-center min-h-[60vh]">
        <div className="panel p-8 text-center max-w-md mm-pop">
          <div
            className="text-4xl mb-3 font-bold"
            style={{ color: overflow > 0 ? "var(--color-brand)" : "#00d3a7" }}
          >
            {overflow > 0 ? "✓" : "✦"}
          </div>
          <h1 className="text-xl font-bold">{overflow > 0 ? "Teto do dia batido!" : "Revisões em dia!"}</h1>
          <p className="text-[var(--color-mut)] text-sm mt-2">
            {done > 0 ? `Você revisou ${done} cartões nesta sessão.` : "Nenhum cartão vence agora."}
            {overflow > 0
              ? ` Ainda há ${overflow} vencidos além do teto de ${cap}/dia — eles voltam amanhã (ajuste o teto em Ajustes).`
              : soon > 0 && ` ${soon} cartões vencem nos próximos 3 dias.`}
          </p>
          {done > 0 && (
            <div className="chip mt-4 mx-auto w-fit !text-[#00d3a7] !border-[#00d3a7]">
              +{done * XP.perReview} XP nesta sessão
            </div>
          )}
          <div className="flex gap-2 justify-center mt-5">
            <Link href="/" className="btn">Voltar ao Hoje</Link>
            {errorCount > 0 ? (
              <Link href="/revisar/erros" className="btn btn-primary">Treinar erros ({errorCount}) →</Link>
            ) : (
              <Link href="/trilhas" className="btn btn-primary">Estudar algo novo →</Link>
            )}
          </div>
        </div>
      </div>
    );
  }

  const ref = getSubRef(card!.subId);
  const total = queue.length;
  const pct = Math.round((idx / total) * 100);

  return (
    <div className="max-w-2xl mx-auto mm-enter">
      <div className="flex items-center justify-between mb-4 text-sm">
        <span className="text-[var(--color-mut)]">{idx + 1} de {total}</span>
        <div className="flex items-center gap-2">
          {errorCount > 0 && (
            <Link href="/revisar/erros" className="chip hover:border-[#ff6b6b] !text-[#ff6b6b]" title="Treinar o que você erra mais">
              Modo erros ({errorCount})
            </Link>
          )}
          {ref && (
            <Link href={`/estudar/${ref.track.id}/${ref.sub.id}`} className="chip hover:border-[var(--color-brand)]">
              {ref.sub.title}
            </Link>
          )}
        </div>
      </div>
      <div className="h-1 w-full rounded bg-[var(--color-raise)] mb-6 overflow-hidden">
        <div className="h-full" style={{ width: `${pct}%`, background: "linear-gradient(90deg,#7c5cff,#00d3a7)" }} />
      </div>

      <div
        className={`panel p-8 min-h-[260px] flex flex-col items-center justify-center text-center ${
          !revealed && !calibration ? "cursor-pointer" : ""
        }`}
        onClick={() => {
          if (!revealed && !calibration) setRevealed(true);
        }}
      >
        <div className="text-lg"><Markdown>{card!.front}</Markdown></div>
        {revealed ? (
          <div className="w-full mm-pop">
            <div className="my-5 w-full border-t border-[var(--color-line)]" />
            <div className="text-[var(--color-txt2)]"><Markdown>{card!.back}</Markdown></div>
          </div>
        ) : calibration ? (
          <div className="mt-6 w-full">
            <div className="text-xs text-[var(--color-mut)] mb-2">Antes de ver: você vai lembrar?</div>
            <div className="grid grid-cols-3 gap-2 max-w-sm mx-auto">
              {PREDICTIONS.map((x) => (
                <button
                  key={x.p}
                  onClick={() => reveal(x.p)}
                  className="btn !py-2 hover:!border-current transition-colors"
                  style={{ color: x.color }}
                >
                  {x.label}
                </button>
              ))}
            </div>
            <button onClick={() => reveal()} className="mt-3 text-[10px] text-[var(--color-mut)] underline">
              revelar sem prever
            </button>
          </div>
        ) : (
          <div className="mt-6 text-xs text-[var(--color-mut)]">clique ou aperte espaço para revelar</div>
        )}
      </div>

      {revealed && (
        <div className="grid grid-cols-4 gap-2 mt-4 mm-pop">
          {GRADES.map((x) => {
            const preview = previewReview(card!, x.g, Date.now(), { requestRetention: settings?.requestRetention });
            return (
              <button
                key={x.g}
                onClick={() => grade(x.g)}
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
    </div>
  );
}
