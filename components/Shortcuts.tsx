"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";

// Gerenciador global de atalhos: chord "g h/t/r/n/p" e "?" para ajuda.
// Nao interfere quando o foco esta em campos de texto nem com modificadores.
function isEditable(el: EventTarget | null): boolean {
  const n = el as HTMLElement | null;
  if (!n) return false;
  const tag = n.tagName;
  return (
    tag === "INPUT" ||
    tag === "TEXTAREA" ||
    tag === "SELECT" ||
    n.isContentEditable === true
  );
}

export default function Shortcuts() {
  const router = useRouter();
  const pendingG = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const clearG = () => {
      pendingG.current = false;
      if (timer.current) {
        clearTimeout(timer.current);
        timer.current = null;
      }
    };

    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (isEditable(e.target)) return;

      // Abre a ajuda de atalhos no palette.
      if (e.key === "?") {
        e.preventDefault();
        clearG();
        window.dispatchEvent(new CustomEvent("mm:open-palette", { detail: { help: true } }));
        return;
      }

      if (pendingG.current) {
        const dest =
          e.key === "h"
            ? "/"
            : e.key === "t"
              ? "/trilhas"
              : e.key === "r"
                ? "/revisar"
                : e.key === "n"
                  ? "/notas"
                  : e.key === "p"
                    ? "/praticar"
                    : e.key === "b"
                      ? "/biblioteca"
                      : e.key === "d"
                        ? "/provas"
                        : e.key === "s"
                          ? "/simulado"
                          : null;
        clearG();
        if (dest) {
          e.preventDefault();
          router.push(dest);
        }
        return;
      }

      if (e.key === "g") {
        pendingG.current = true;
        if (timer.current) clearTimeout(timer.current);
        timer.current = setTimeout(clearG, 900);
      }
    };

    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      if (timer.current) clearTimeout(timer.current);
    };
  }, [router]);

  return null;
}
