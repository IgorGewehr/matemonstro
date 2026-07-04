"use client";

// Modo Foco: pomodoro integrado ao plano. Na era da atenção fragmentada, o app
// não só organiza o estudo — ele PROTEGE o tempo de estudo:
//  - armar: você escolhe 25/50 min para UMA tarefa (decisão única, sem menu);
//  - rodando: barra flutuante discreta + navegação escondida (imersão sem
//    cobrir o conteúdo que você está estudando);
//  - fim: sino suave, minutos registrados no diário de estudo (streak/heatmap
//    honestos) e pausa opcional de 5 min;
//  - abandonar exige confirmação — e ainda registra o que você já focou.
//
// Início por evento global: window.dispatchEvent(new CustomEvent("mm:start-focus",
// { detail: { label, minutes? } })).

import { useCallback, useEffect, useRef, useState } from "react";
import { useApp } from "./AppState";
import { useFocusTrap } from "@/lib/useFocusTrap";
import { ambience, AMBIENCE_SCENES, type AmbienceScene } from "@/lib/ambience";

type Phase = "idle" | "armed" | "running" | "done" | "break";

const SOUND_KEY = "mm:foco-som"; // "none" | AmbienceScene

const BREAK_MIN = 5;

function fmt(totalSec: number): string {
  const s = Math.max(0, Math.ceil(totalSec));
  return `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
}

// Sino suave de fim de sessão (WebAudio, sem asset). Melhor-esforço.
function chime() {
  try {
    const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) return;
    const ctx = new Ctx();
    [523.25, 659.25, 783.99].forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0.0001, ctx.currentTime + i * 0.18);
      gain.gain.exponentialRampToValueAtTime(0.18, ctx.currentTime + i * 0.18 + 0.03);
      gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + i * 0.18 + 0.9);
      osc.connect(gain).connect(ctx.destination);
      osc.start(ctx.currentTime + i * 0.18);
      osc.stop(ctx.currentTime + i * 0.18 + 1);
    });
    setTimeout(() => ctx.close().catch(() => {}), 2500);
  } catch {
    // sem áudio: o modal de conclusão já comunica
  }
  try {
    navigator.vibrate?.([120, 60, 120]);
  } catch {
    // sem vibração
  }
}

export default function FocusSession() {
  const { logStudy } = useApp();
  const [phase, setPhase] = useState<Phase>("idle");
  const [label, setLabel] = useState("Estudo focado");
  const [minutes, setMinutes] = useState(25);
  const [remaining, setRemaining] = useState(0);
  const [loggedMin, setLoggedMin] = useState(0);
  // Som ambiente generativo (lib/ambience): preferência persistida; o toggle
  // ♪ do pill vale só para a sessão atual.
  const [scene, setScene] = useState<AmbienceScene | "none">("none");
  const [soundOn, setSoundOn] = useState(true);
  useEffect(() => {
    try {
      const saved = localStorage.getItem(SOUND_KEY);
      if (saved === "none" || AMBIENCE_SCENES.some((s) => s.id === saved)) {
        setScene(saved as AmbienceScene | "none");
      }
    } catch {
      /* ignora */
    }
  }, []);
  function chooseScene(next: AmbienceScene | "none") {
    setScene(next);
    try {
      localStorage.setItem(SOUND_KEY, next);
    } catch {
      /* ignora */
    }
  }
  // O som vive exatamente enquanto a sessão roda (fade suave nas pontas).
  useEffect(() => {
    if (phase === "running" && scene !== "none" && soundOn) {
      ambience().start(scene);
      return () => ambience().stop();
    }
    ambience().stop();
  }, [phase, scene, soundOn]);
  useEffect(() => () => ambience().stop(0.2), []);
  const endRef = useRef(0);
  const startRef = useRef(0);
  const titleRef = useRef<string>("");
  const modalRef = useRef<HTMLDivElement>(null);

  const modalOpen = phase === "armed" || phase === "done";
  useFocusTrap(modalRef, modalOpen);

  // Entrada global: qualquer botão "◉ Foco" dispara este evento.
  useEffect(() => {
    const onStart = (e: Event) => {
      const d = (e as CustomEvent).detail as { label?: string; minutes?: number } | undefined;
      setLabel(d?.label?.trim() || "Estudo focado");
      if (d?.minutes === 25 || d?.minutes === 50) setMinutes(d.minutes);
      setPhase("armed");
    };
    window.addEventListener("mm:start-focus", onStart as EventListener);
    return () => window.removeEventListener("mm:start-focus", onStart as EventListener);
  }, []);

  // Imersão: esconde a navegação enquanto foca (CSS em globals).
  useEffect(() => {
    const active = phase === "running" || phase === "break";
    document.documentElement.toggleAttribute("data-mm-focus", active);
    return () => document.documentElement.removeAttribute("data-mm-focus");
  }, [phase]);

  // Relógio + título da aba ("24:31 · Foco").
  useEffect(() => {
    if (phase !== "running" && phase !== "break") return;
    if (!titleRef.current) titleRef.current = document.title;
    const tick = () => {
      const left = (endRef.current - Date.now()) / 1000;
      setRemaining(left);
      document.title = `${fmt(left)} · ${phase === "break" ? "Pausa" : "Foco"} — Matemonstro`;
      if (left <= 0) {
        if (phase === "running") {
          finish(true);
        } else {
          chime();
          setPhase("idle");
        }
      }
    };
    tick();
    const t = setInterval(tick, 500);
    return () => {
      clearInterval(t);
      if (titleRef.current) document.title = titleRef.current;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase]);

  // Sair da página no meio da sessão pede confirmação do navegador.
  useEffect(() => {
    if (phase !== "running") return;
    const onUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
    };
    window.addEventListener("beforeunload", onUnload);
    return () => window.removeEventListener("beforeunload", onUnload);
  }, [phase]);

  function begin() {
    startRef.current = Date.now();
    endRef.current = Date.now() + minutes * 60_000;
    setRemaining(minutes * 60);
    setPhase("running");
  }

  const finish = useCallback(
    (completed: boolean) => {
      const elapsedMin = Math.floor((Date.now() - startRef.current) / 60_000);
      const toLog = completed ? minutes : Math.min(elapsedMin, minutes);
      if (toLog >= 1) {
        logStudy(toLog).catch(() => {});
      }
      setLoggedMin(toLog);
      if (completed) {
        chime();
        setPhase("done");
      } else {
        setPhase("idle");
      }
    },
    [logStudy, minutes]
  );

  function abandon() {
    const elapsedMin = Math.floor((Date.now() - startRef.current) / 60_000);
    const msg =
      elapsedMin >= 1
        ? `Abandonar a sessão? Os ${elapsedMin} min que você já focou serão registrados.`
        : "Abandonar a sessão de foco?";
    if (window.confirm(msg)) finish(false);
  }

  function startBreak() {
    endRef.current = Date.now() + BREAK_MIN * 60_000;
    setRemaining(BREAK_MIN * 60);
    setPhase("break");
  }

  if (phase === "idle") return null;

  // ---- Armar: uma tarefa, uma duração, zero menu ----
  if (phase === "armed") {
    return (
      <div
        className="fixed inset-0 z-[150] grid place-items-center p-4 bg-black/70 backdrop-blur-sm"
        onMouseDown={() => setPhase("idle")}
        role="dialog"
        aria-modal="true"
        aria-label="Sessão de foco"
      >
        <div ref={modalRef} className="panel w-full max-w-sm p-6 text-center mm-pop" onMouseDown={(e) => e.stopPropagation()}>
          <div className="text-4xl mb-2" aria-hidden="true">◉</div>
          <h2 className="text-lg font-bold">Sessão de foco</h2>
          <p className="text-sm text-[var(--color-mut)] mt-1 mb-1">Uma coisa só, sem trocar de aba:</p>
          <p className="font-semibold text-[15px] mb-4 truncate" title={label}>{label}</p>
          <div className="flex justify-center gap-2 mb-4">
            {[25, 50].map((m) => (
              <button
                key={m}
                onClick={() => setMinutes(m)}
                aria-pressed={minutes === m}
                className={`chip !px-4 !py-1.5 ${minutes === m ? "!border-[var(--color-brand)] !text-[var(--color-brand)]" : ""}`}
              >
                {m} min
              </button>
            ))}
          </div>
          <div className="mb-5">
            <div className="text-[11px] uppercase tracking-wide text-[var(--color-mut)] mb-1.5">
              Som ambiente <span className="normal-case">(gerado por matemática, offline)</span>
            </div>
            <div className="flex justify-center gap-1.5 flex-wrap">
              <button
                onClick={() => chooseScene("none")}
                aria-pressed={scene === "none"}
                className={`chip !px-3 !py-1 text-xs ${scene === "none" ? "!border-[var(--color-brand)] !text-[var(--color-brand)]" : ""}`}
              >
                Silêncio
              </button>
              {AMBIENCE_SCENES.map((s) => (
                <button
                  key={s.id}
                  onClick={() => chooseScene(s.id)}
                  aria-pressed={scene === s.id}
                  className={`chip !px-3 !py-1 text-xs ${scene === s.id ? "!border-[var(--color-brand)] !text-[var(--color-brand)]" : ""}`}
                >
                  ♪ {s.label}
                </button>
              ))}
            </div>
          </div>
          <button className="btn btn-primary w-full !py-3" onClick={begin} autoFocus>
            ◉ Começar {minutes} min
          </button>
          <p className="text-[11px] text-[var(--color-mut)] mt-3">
            Celular longe, uma aba só. O menu some até o fim — o relógio fica com você.
          </p>
        </div>
      </div>
    );
  }

  // ---- Conclusão ----
  if (phase === "done") {
    return (
      <div className="fixed inset-0 z-[150] grid place-items-center p-4 bg-black/70 backdrop-blur-sm" role="dialog" aria-modal="true" aria-label="Sessão concluída">
        <div ref={modalRef} className="panel w-full max-w-sm p-6 text-center mm-pop">
          <div className="text-4xl mb-2" aria-hidden="true">◉</div>
          <h2 className="text-lg font-bold">{loggedMin} min de foco de verdade</h2>
          <p className="text-sm text-[var(--color-mut)] mt-1 mb-5">
            Registrado no seu dia — streak e heatmap agradecem. Agora levanta, bebe água: pausa curta faz parte do
            método.
          </p>
          <div className="flex gap-2 justify-center">
            <button className="btn" onClick={() => setPhase("idle")}>
              Encerrar
            </button>
            <button className="btn btn-primary" onClick={startBreak} autoFocus>
              Pausa de {BREAK_MIN} min →
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ---- Rodando / pausa: barra flutuante discreta (o conteúdo fica visível) ----
  const isBreak = phase === "break";
  const total = (isBreak ? BREAK_MIN : minutes) * 60;
  const pct = Math.max(0, Math.min(100, (remaining / total) * 100));
  return (
    <div
      className="fixed top-3 left-1/2 -translate-x-1/2 z-[150] panel !rounded-full px-4 py-2 flex items-center gap-3 shadow-2xl mm-pop"
      role="timer"
      aria-label={isBreak ? "Pausa" : `Foco: ${label}`}
    >
      <span aria-hidden="true" className={isBreak ? "text-[var(--color-brand2)]" : "text-[var(--color-brand)]"}>
        ◉
      </span>
      <span className="font-mono font-bold tabular-nums text-lg">{fmt(remaining)}</span>
      <span className="hidden sm:block text-xs text-[var(--color-mut)] max-w-[200px] truncate">
        {isBreak ? "pausa — longe da tela" : label}
      </span>
      <span className="w-16 h-1 rounded-full bg-[var(--color-raise)] overflow-hidden" aria-hidden="true">
        <span
          className="block h-full transition-[width] duration-500"
          style={{ width: `${pct}%`, background: isBreak ? "var(--color-brand2)" : "var(--color-brand)" }}
        />
      </span>
      {!isBreak && scene !== "none" && (
        <button
          className={`text-sm leading-none transition-colors ${soundOn ? "text-[var(--color-brand)]" : "text-[var(--color-mut)] opacity-50"}`}
          onClick={() => setSoundOn((v) => !v)}
          title={soundOn ? "Silenciar som ambiente" : "Religar som ambiente"}
          aria-pressed={soundOn}
        >
          ♪
        </button>
      )}
      {isBreak ? (
        <button className="text-xs text-[var(--color-mut)] hover:text-[var(--color-txt)]" onClick={() => setPhase("idle")}>
          encerrar
        </button>
      ) : (
        <button className="text-xs text-[var(--color-mut)] hover:text-[#ff6b6b]" onClick={abandon}>
          abandonar
        </button>
      )}
    </div>
  );
}
