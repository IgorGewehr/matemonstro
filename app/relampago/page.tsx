"use client";

// Estudo relâmpago — a arma contra o "no fim nunca estudo".
// A promessa é minúscula (~2 min, poucos cartões) e o fim é uma VITÓRIA garantida:
// terminar registra o dia (streak + momentum) e celebra. Energia de ativação ~ um toque.

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { useApp } from "@/components/AppState";
import { useCelebrate } from "@/components/Celebrate";
import { XP } from "@/lib/gamification";
import { dueCards, describeInterval, review as previewReview, type Grade } from "@/lib/srs";
import { getSubRef } from "@/lib/curriculum";
import Markdown from "@/components/Markdown";

const LIMIT = 5; // ~2-3 min: pequeno o bastante para nunca assustar

const GRADES: { g: Grade; label: string; color: string; key: string }[] = [
  { g: "errei", label: "Errei", color: "#ff6b6b", key: "1" },
  { g: "dificil", label: "Difícil", color: "#f6c453", key: "2" },
  { g: "bom", label: "Bom", color: "var(--color-brand)", key: "3" },
  { g: "facil", label: "Fácil", color: "#00d3a7", key: "4" },
];

/** Evita dois cartões do mesmo subtópico em sequência quando dá. */
function burySiblings<T extends { subId: string }>(items: T[]): T[] {
  const pool = [...items];
  const out: T[] = [];
  let last: string | null = null;
  while (pool.length) {
    let i = pool.findIndex((c) => c.subId !== last);
    if (i === -1) i = 0;
    const [p] = pool.splice(i, 1);
    out.push(p);
    last = p.subId;
  }
  return out;
}

export default function RelampagoPage() {
  const { ready, cards, gradeCard, settings } = useApp();
  const { celebrate } = useCelebrate();
  const [queue, setQueue] = useState<string[] | null>(null);
  const [idx, setIdx] = useState(0);
  const [revealed, setRevealed] = useState(false);
  const [done, setDone] = useState(0);
  const celebratedRef = useRef(false);

  useEffect(() => {
    if (ready && queue === null) {
      const picked = burySiblings(dueCards(cards, Date.now())).slice(0, LIMIT);
      setQueue(picked.map((c) => c.id));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready]);

  const currentId = queue ? queue[idx] : undefined;
  const card = currentId ? cards.find((c) => c.id === currentId) : undefined;
  const finished = queue !== null && (idx >= queue.length || !card);
  const empty = queue !== null && queue.length === 0;

  useEffect(() => {
    if (finished && done > 0 && !celebratedRef.current) {
      celebratedRef.current = true;
      celebrate({
        kind: "generic",
        title: "Relâmpago fechado! ⚡",
        message: `${done} cartões em 2 minutos. O dia de hoje já conta — sua sequência está segura.`,
      });
    }
  }, [finished, done, celebrate]);

  async function grade(g: Grade) {
    if (!card) return;
    await gradeCard(card, g);
    setDone((d) => d + 1);
    setIdx((i) => i + 1);
    setRevealed(false);
  }

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (finished) return;
      if (!revealed && (e.key === " " || e.key === "Enter")) {
        e.preventDefault();
        setRevealed(true);
      } else if (revealed) {
        const f = GRADES.find((x) => x.key === e.key);
        if (f) grade(f.g);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [revealed, finished, idx, card]);

  const ref = useMemo(() => (card ? getSubRef(card.subId) : undefined), [card]);

  if (!ready || queue === null) return <div className="text-[var(--color-mut)]">Carregando…</div>;

  if (empty) {
    return (
      <div className="grid place-items-center min-h-[60vh]">
        <div className="panel p-8 text-center max-w-md mm-pop">
          <div className="text-4xl mb-3">✦</div>
          <h1 className="text-xl font-bold">Memória em dia!</h1>
          <p className="text-[var(--color-mut)] text-sm mt-2">
            Nada vencido agora. Que tal 2 minutos numa aula nova? Começar é a parte difícil — e você já está aqui.
          </p>
          <div className="flex gap-2 justify-center mt-5">
            <Link href="/" className="btn">Voltar ao Hoje</Link>
            <Link href="/trilhas" className="btn btn-primary">Abrir uma aula →</Link>
          </div>
        </div>
      </div>
    );
  }

  if (finished) {
    return (
      <div className="grid place-items-center min-h-[60vh]">
        <div className="panel p-8 text-center max-w-md mm-pop">
          <div className="text-5xl mb-3" style={{ color: "#00d3a7" }}>⚡</div>
          <h1 className="text-xl font-bold">Relâmpago fechado!</h1>
          <p className="text-[var(--color-mut)] text-sm mt-2">
            {done > 0
              ? `${done} cartões em ~2 min. O dia de hoje já conta — pouquinho vira muito.`
              : "Sessão encerrada."}
          </p>
          {done > 0 && (
            <div className="chip mt-4 mx-auto w-fit !text-[#00d3a7] !border-[#00d3a7]">
              +{done * XP.perReview} XP
            </div>
          )}
          <div className="flex gap-2 justify-center mt-5">
            <Link href="/" className="btn">Voltar ao Hoje</Link>
            <Link href="/revisar" className="btn btn-primary">Continuar revisando →</Link>
          </div>
        </div>
      </div>
    );
  }

  const total = queue.length;
  const pct = Math.round((idx / total) * 100);

  return (
    <div className="max-w-2xl mx-auto mm-enter">
      <div className="flex items-center justify-between mb-2 text-sm">
        <span className="chip">⚡ Relâmpago</span>
        <span className="text-[var(--color-mut)]">{idx + 1} de {total}</span>
      </div>
      <div className="h-1 w-full rounded bg-[var(--color-raise)] mb-6 overflow-hidden">
        <div className="h-full" style={{ width: `${pct}%`, background: "var(--grad-brand)" }} />
      </div>

      {ref && (
        <div className="mb-3 text-center">
          <span className="text-xs text-[var(--color-mut)]">{ref.sub.title}</span>
        </div>
      )}

      <div
        className={`panel p-8 min-h-[240px] flex flex-col items-center justify-center text-center ${!revealed ? "cursor-pointer" : ""}`}
        onClick={() => !revealed && setRevealed(true)}
      >
        <div className="text-lg"><Markdown>{card!.front}</Markdown></div>
        {revealed ? (
          <div className="w-full mm-pop">
            <div className="my-5 w-full border-t border-[var(--color-line)]" />
            <div className="text-[var(--color-txt2)]"><Markdown>{card!.back}</Markdown></div>
          </div>
        ) : (
          <div className="mt-6 text-xs text-[var(--color-mut)]">clique ou aperte espaço para revelar</div>
        )}
      </div>

      {revealed && (
        <div className="grid grid-cols-4 gap-2 mt-4 mm-pop">
          {GRADES.map((x) => {
            const preview = previewReview(card!, x.g, Date.now(), {
              requestRetention: settings?.requestRetention,
              intervalScale: settings?.fsrsIntervalScale,
            });
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
