"use client";

// Provider global de celebracao: escuta o CustomEvent 'mm:celebrate' emitido
// pelo AppState (spec 01) ao concluir subtopicos/trilhas e dispara um toast +
// confeti (CSS keyframes em globals.css). Tambem expoe useCelebrate() para
// disparar celebracoes manuais de qualquer lugar.
import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import { index, getTrack } from "@/lib/curriculum";

type CelebrateKind = "subtopic" | "track" | "levelup" | "insignia" | "generic";

interface CelebrateInput {
  kind?: CelebrateKind;
  title?: string;
  message?: string;
  trackId?: string;
  trackTitle?: string;
  levelName?: string;
  level?: number;
}

interface Celebration {
  id: number;
  kind: CelebrateKind;
  emoji: string;
  title: string;
  message: string;
  pieces: number;
}

interface CelebrateCtx {
  celebrate: (input: CelebrateInput) => void;
}

const Ctx = createContext<CelebrateCtx | null>(null);

const CONFETTI_COLORS = ["#7c5cff", "#00d3a7", "#f6c453", "#ff6b6b", "#ffb347", "#e6e8f0"];

// Cor do glifo de destaque no toast, por tipo de celebracao (troco/insignia em
// dourado, conclusao de subtopico em verde — mesma paleta usada nos chips do
// app; levelup/generic ficam na cor de texto padrao).
const EMOJI_ACCENT: Record<CelebrateKind, string> = {
  track: "text-[var(--color-gold)]",
  insignia: "text-[var(--color-gold)]",
  levelup: "",
  subtopic: "text-[var(--color-brand2)]",
  generic: "",
};

// Detalhe do evento 'mm:celebrate' (contrato definido pela spec 01).
interface CelebrateEventDetail {
  type?: "subtopic" | "track" | "levelup" | "insignia";
  subId?: string;
  trackId?: string;
  trackTitle?: string;
  levelName?: string;
  level?: number;
}

function buildCelebration(input: CelebrateInput, id: number): Celebration {
  const kind = input.kind ?? "generic";
  if (kind === "track") {
    const track = input.trackId ? getTrack(input.trackId) : undefined;
    const title = track?.title ?? input.trackTitle ?? "Trilha concluida";
    // Usa a copy do milestone (youCanNow) quando existir para esta trilha.
    const milestone = index?.milestones?.find((m) => m.after === input.trackId);
    const message =
      input.message ??
      milestone?.youCanNow ??
      `Voce fechou ${title} inteirinha. Proximo teorema te espera.`;
    return {
      id,
      kind,
      emoji: "✦",
      title: `Trilha concluida — ${title}!`,
      message,
      pieces: 80,
    };
  }
  if (kind === "insignia") {
    const name = input.levelName ?? "nova insígnia";
    return {
      id,
      kind,
      emoji: "✦",
      title: `Insígnia conquistada — ${name}!`,
      message:
        input.message ??
        `Você agora é um Matemático Nível ${input.level ?? "?"}. Veja sua insígnia em Conquistas.`,
      pieces: 110,
    };
  }
  if (kind === "levelup") {
    const name = input.levelName ?? "novo nivel";
    return {
      id,
      kind,
      emoji: "✦",
      title: `Novo nivel — ${name}!`,
      message: input.message ?? `O monstro cresceu. Voce agora e ${name}.`,
      pieces: 80,
    };
  }
  if (kind === "subtopic") {
    return {
      id,
      kind,
      emoji: "✓",
      title: "Subtopico concluido!",
      message: input.message ?? "Mais um pedaco dominado. Anota o principal e segue o baile.",
      pieces: 36,
    };
  }
  return {
    id,
    kind: "generic",
    emoji: "✦",
    title: input.title ?? "Boa!",
    message: input.message ?? "",
    pieces: 44,
  };
}

export function Celebrate({ children }: { children: React.ReactNode }) {
  const [active, setActive] = useState<Celebration | null>(null);
  const seq = useRef(0);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const celebrate = useCallback((input: CelebrateInput) => {
    seq.current += 1;
    const c = buildCelebration(input, seq.current);
    setActive(c);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(
      () => setActive(null),
      c.kind === "track" || c.kind === "levelup" || c.kind === "insignia" ? 6500 : 4500
    );
  }, []);

  useEffect(() => {
    function onCelebrate(ev: Event) {
      const detail = (ev as CustomEvent<CelebrateEventDetail>).detail ?? {};
      const kind: CelebrateKind =
        detail.type === "track"
          ? "track"
          : detail.type === "levelup"
            ? "levelup"
            : detail.type === "insignia"
              ? "insignia"
              : "subtopic";
      celebrate({
        kind,
        trackId: detail.trackId,
        trackTitle: detail.trackTitle,
        levelName: detail.levelName,
        level: detail.level,
      });
    }
    window.addEventListener("mm:celebrate", onCelebrate as EventListener);
    return () => window.removeEventListener("mm:celebrate", onCelebrate as EventListener);
  }, [celebrate]);

  useEffect(() => {
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, []);

  const dismiss = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    setActive(null);
  }, []);

  return (
    <Ctx.Provider value={{ celebrate }}>
      {children}
      {active && <CelebrationOverlay celebration={active} onDismiss={dismiss} />}
    </Ctx.Provider>
  );
}

function CelebrationOverlay({
  celebration,
  onDismiss,
}: {
  celebration: Celebration;
  onDismiss: () => void;
}) {
  // Gera as pecas de confeti uma vez por celebracao (key = id).
  const pieces = React.useMemo(() => {
    const arr: React.CSSProperties[] = [];
    for (let i = 0; i < celebration.pieces; i++) {
      const left = Math.random() * 100;
      const drift = (Math.random() * 2 - 1) * 18; // vw de deriva horizontal
      arr.push({
        left: `${left}%`,
        background: CONFETTI_COLORS[i % CONFETTI_COLORS.length],
        animationDelay: `${Math.random() * 0.5}s`,
        animationDuration: `${2.2 + Math.random() * 1.8}s`,
        // consumido pelo keyframe mm-confetti-fall em globals.css
        ["--mm-x" as string]: `${drift}vw`,
        transform: `rotate(${Math.random() * 360}deg)`,
      });
    }
    return arr;
  }, [celebration.id, celebration.pieces]);

  return (
    <div
      className="fixed inset-0 z-[120] pointer-events-none overflow-hidden"
      aria-live="polite"
    >
      <div aria-hidden="true" className="absolute inset-0">
        {pieces.map((style, i) => (
          <span key={`${celebration.id}-${i}`} className="mm-confetti-piece" style={style} />
        ))}
      </div>

      <div className="absolute inset-x-0 top-4 flex justify-center px-4">
        <div
          role="status"
          className="mm-pop panel p-4 pr-3 max-w-sm w-full flex items-start gap-3 pointer-events-auto shadow-2xl border-[var(--color-brand)]"
        >
          <span className={`text-2xl leading-none ${EMOJI_ACCENT[celebration.kind]}`}>
            {celebration.emoji}
          </span>
          <div className="flex-1 min-w-0">
            <div className="font-bold">{celebration.title}</div>
            {celebration.message && (
              <div className="text-sm text-[var(--color-mut)] mt-0.5">{celebration.message}</div>
            )}
          </div>
          <button
            type="button"
            onClick={onDismiss}
            aria-label="Fechar"
            className="btn btn-ghost !px-2 !py-1 text-[var(--color-mut)]"
          >
            ✕
          </button>
        </div>
      </div>
    </div>
  );
}

export function useCelebrate(): CelebrateCtx {
  const c = useContext(Ctx);
  // Fallback no-op caso seja usado fora do provider (nao quebra a arvore).
  if (!c) return { celebrate: () => {} };
  return c;
}
