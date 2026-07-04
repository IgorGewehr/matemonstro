"use client";

// Onboarding: wizard modal de 4 passos disparado na primeira visita
// (!settings.onboarded). Coleta objetivo, tempo, ponto de partida e meta,
// persiste em Settings e roteia para o primeiro item de estudo.
import React, { useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useApp } from "@/components/AppState";
import { index, getTrack, tracks } from "@/lib/curriculum";
import { useFocusTrap } from "@/lib/useFocusTrap";
import type { Track, Settings } from "@/lib/types";

type Goal = "base" | "if" | "mestrado";

const GOALS: { id: Goal; emoji: string; title: string; desc: string }[] = [
  {
    id: "base",
    emoji: "○",
    title: "Comecar do zero",
    desc: "Reconstruir a base com calma, da aritmetica ao calculo.",
  },
  {
    id: "if",
    emoji: "▤",
    title: "Concurso / IF",
    desc: "Foco no que mais cai em concurso de professor e institutos federais.",
  },
  {
    id: "mestrado",
    emoji: "∫",
    title: "Mestrado",
    desc: "Preparar analise, algebra e topologia para prova de ingresso.",
  },
];

const MINUTE_OPTIONS = [20, 30, 45, 60, 90, 120];

// Sugere trilhas de partida conforme o objetivo, resolvendo ids -> Track.
function suggestedTracks(goal: Goal): Track[] {
  let ids: string[] = [];
  if (goal === "if") ids = index?.ifConcursoCore ?? [];
  else if (goal === "mestrado") {
    const pm = index?.prelimMap;
    ids = pm ? [...(pm.analise ?? []), ...(pm.algebra ?? []), ...(pm.topologiaGeometria ?? [])] : [];
  } else {
    ids = index?.phases?.[0]?.trackIds ?? index?.recommendedOrder ?? [];
  }
  const seen = new Set<string>();
  const out: Track[] = [];
  for (const id of ids) {
    if (seen.has(id)) continue;
    const t = getTrack(id);
    if (t) {
      out.push(t);
      seen.add(id);
    }
    if (out.length >= 4) break;
  }
  // fallback: primeiras trilhas do curriculo
  if (!out.length) return tracks.slice(0, 4);
  return out;
}

export default function Onboarding() {
  const { ready, settings, updateSettings, setStatus } = useApp();
  const router = useRouter();

  const [step, setStep] = useState(0);
  const [goal, setGoal] = useState<Goal>("base");
  const [minutes, setMinutes] = useState(settings.minutesPerDay || 60);
  const [days, setDays] = useState(settings.daysPerWeek || 5);
  const [startTrack, setStartTrack] = useState<string | null>(null);
  const [goalDate, setGoalDate] = useState<string>("");
  const [saving, setSaving] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const dialogRef = useRef<HTMLDivElement>(null);

  const suggestions = useMemo(() => suggestedTracks(goal), [goal]);
  useFocusTrap(dialogRef, ready && !settings.onboarded && !dismissed);

  // Nao renderiza nada ate os dados carregarem, se ja fez onboarding, ou se pulou.
  if (!ready || settings.onboarded || dismissed) return null;

  const totalSteps = 4;

  async function finish() {
    setSaving(true);
    try {
      const patch: Partial<Settings> = {
        onboarded: true,
        goal,
        minutesPerDay: minutes,
        daysPerWeek: days,
      };
      if (goalDate) {
        const ts = new Date(goalDate + "T00:00:00").getTime();
        if (Number.isFinite(ts)) patch.goalDate = ts;
      }
      await updateSettings(patch);

      let destination = "/";
      if (startTrack) {
        const t = getTrack(startTrack);
        const firstSub = t?.subtopics?.[0];
        if (t && firstSub) {
          await setStatus(firstSub.id, "doing");
          destination = `/estudar/${t.id}/${firstSub.id}`;
        }
      }
      router.push(destination);
    } finally {
      setSaving(false);
      setDismissed(true);
    }
  }

  async function skip() {
    setDismissed(true);
    await updateSettings({ onboarded: true });
  }

  return (
    <div className="fixed inset-0 z-[130] grid place-items-center p-4 bg-black/60 backdrop-blur-sm">
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="mm-onboarding-title"
        className="panel w-full max-w-lg p-6 md:p-7"
      >
        <div className="flex items-center justify-between mb-4">
          <div className="chip">Bem-vindo ao Matemonstro</div>
          <button type="button" onClick={skip} className="btn btn-ghost !px-2 !py-1 text-sm text-[var(--color-mut)]">
            Pular
          </button>
        </div>

        {/* Passo 1 — Objetivo */}
        {step === 0 && (
          <div>
            <h2 id="mm-onboarding-title" className="text-xl font-bold mb-1">
              Qual e o seu objetivo?
            </h2>
            <p className="text-sm text-[var(--color-mut)] mb-4">
              Isso ajusta a ordem das trilhas e o que priorizamos no seu plano.
            </p>
            <div className="space-y-2">
              {GOALS.map((g) => (
                <button
                  key={g.id}
                  type="button"
                  onClick={() => setGoal(g.id)}
                  className={`w-full text-left panel p-3 flex items-center gap-3 transition-colors ${
                    goal === g.id ? "!border-[var(--color-brand)]" : ""
                  }`}
                >
                  <span className="text-2xl">{g.emoji}</span>
                  <div className="flex-1">
                    <div className="font-semibold">{g.title}</div>
                    <div className="text-xs text-[var(--color-mut)]">{g.desc}</div>
                  </div>
                  <span className={goal === g.id ? "text-[var(--color-brand)]" : "text-[var(--color-mut)]"}>
                    {goal === g.id ? "●" : "○"}
                  </span>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Passo 2 — Tempo */}
        {step === 1 && (
          <div>
            <h2 id="mm-onboarding-title" className="text-xl font-bold mb-1">
              Quanto tempo por dia?
            </h2>
            <p className="text-sm text-[var(--color-mut)] mb-4">
              Sem culpa: o plano se ajusta ao tempo que voce realmente tem.
            </p>
            <div className="text-xs uppercase tracking-wide text-[var(--color-mut)] mb-2">Minutos por dia</div>
            <div className="flex flex-wrap gap-2 mb-5">
              {MINUTE_OPTIONS.map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => setMinutes(m)}
                  className={`chip cursor-pointer ${minutes === m ? "!bg-[var(--color-brand)] !text-white !border-transparent" : ""}`}
                >
                  {m} min
                </button>
              ))}
            </div>
            <div className="text-xs uppercase tracking-wide text-[var(--color-mut)] mb-2">Dias por semana</div>
            <div className="flex flex-wrap gap-2">
              {[3, 4, 5, 6, 7].map((d) => (
                <button
                  key={d}
                  type="button"
                  onClick={() => setDays(d)}
                  className={`chip cursor-pointer ${days === d ? "!bg-[var(--color-brand)] !text-white !border-transparent" : ""}`}
                >
                  {d}x
                </button>
              ))}
            </div>
            <p className="text-xs text-[var(--color-mut)] mt-3">
              Os {7 - days} dias de folga nao quebram sua sequencia.{" "}
              <span className="text-[var(--color-warm)]">Δ</span>
            </p>
          </div>
        )}

        {/* Passo 3 — Ponto de partida */}
        {step === 2 && (
          <div>
            <h2 id="mm-onboarding-title" className="text-xl font-bold mb-1">
              Por onde comecar?
            </h2>
            <p className="text-sm text-[var(--color-mut)] mb-4">
              Escolha uma trilha para iniciar hoje — ou siga a ordem recomendada.
            </p>
            <div className="space-y-2 max-h-64 overflow-y-auto">
              <button
                type="button"
                onClick={() => setStartTrack(null)}
                className={`w-full text-left panel p-3 flex items-center gap-3 ${
                  startTrack === null ? "!border-[var(--color-brand)]" : ""
                }`}
              >
                <span className="text-xl text-[var(--color-brand)]">▸</span>
                <div className="flex-1">
                  <div className="font-semibold">Seguir a ordem recomendada</div>
                  <div className="text-xs text-[var(--color-mut)]">Deixa o app escolher o primeiro passo.</div>
                </div>
              </button>
              {suggestions.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => setStartTrack(t.id)}
                  className={`w-full text-left panel p-3 flex items-center gap-3 ${
                    startTrack === t.id ? "!border-[var(--color-brand)]" : ""
                  }`}
                >
                  <span className="text-xl text-[var(--color-mut)]">□</span>
                  <div className="flex-1 min-w-0">
                    <div className="font-semibold truncate">{t.title}</div>
                    <div className="text-xs text-[var(--color-mut)] truncate">
                      {t.tagline ?? t.phaseLabel}
                    </div>
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Passo 4 — Meta opcional */}
        {step === 3 && (
          <div>
            <h2 id="mm-onboarding-title" className="text-xl font-bold mb-1">
              Tem uma data-alvo?
            </h2>
            <p className="text-sm text-[var(--color-mut)] mb-4">
              Opcional. Se tiver uma prova ou concurso, a gente calcula seu ritmo para chegar la.
            </p>
            <label htmlFor="mm-goal-date" className="text-xs uppercase tracking-wide text-[var(--color-mut)] block mb-2">
              Data da meta
            </label>
            <input
              id="mm-goal-date"
              type="date"
              value={goalDate}
              onChange={(e) => setGoalDate(e.target.value)}
              className="w-full rounded-xl bg-[var(--color-card)] border border-[var(--color-line)] px-3 py-2 text-sm"
            />
            <div className="panel p-3 mt-4 text-sm text-[var(--color-mut)]">
              <div className="text-[var(--color-txt)] font-semibold mb-1">Tudo pronto:</div>
              Objetivo <b className="text-[var(--color-txt)]">{GOALS.find((g) => g.id === goal)?.title}</b> •{" "}
              {minutes} min/dia • {days}x por semana
              {startTrack && (
                <>
                  {" "}• comecando por <b className="text-[var(--color-txt)]">{getTrack(startTrack)?.title}</b>
                </>
              )}
            </div>
          </div>
        )}

        {/* Navegacao */}
        <div className="flex items-center justify-between mt-6">
          <div className="flex gap-1.5" aria-hidden="true">
            {Array.from({ length: totalSteps }).map((_, i) => (
              <span
                key={i}
                className="h-1.5 rounded-full transition-all"
                style={{
                  width: i === step ? 22 : 8,
                  background: i <= step ? "var(--color-brand)" : "#2c3147",
                }}
              />
            ))}
          </div>
          <div className="flex gap-2">
            {step > 0 && (
              <button type="button" onClick={() => setStep((s) => s - 1)} className="btn">
                Voltar
              </button>
            )}
            {step < totalSteps - 1 ? (
              <button type="button" onClick={() => setStep((s) => s + 1)} className="btn btn-primary">
                Proximo →
              </button>
            ) : (
              <button type="button" onClick={finish} disabled={saving} className="btn btn-primary">
                {saving ? "Salvando…" : "Comecar a estudar →"}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
