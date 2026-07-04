"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { useApp } from "./AppState";
import { isLeech } from "@/lib/srs";
import { cappedDueCards } from "@/lib/scheduler";
import AccountButton from "@/components/auth/AccountButton";

type Item = { href: string; label: string; icon: string };
const groups: { title: string | null; items: Item[] }[] = [
  { title: null, items: [{ href: "/", label: "Hoje", icon: "◉" }] },
  {
    title: "Estudar",
    items: [
      { href: "/trilhas", label: "Trilhas", icon: "▤" },
      { href: "/mapa", label: "Mapa (grafo)", icon: "❖" },
      { href: "/revisar", label: "Revisar", icon: "↻" },
      { href: "/praticar", label: "Praticar", icon: "✎" },
      { href: "/provas", label: "Provas", icon: "∎" },
      { href: "/simulado", label: "Simulado", icon: "◷" },
      { href: "/biblioteca", label: "Biblioteca", icon: "≔" },
      { href: "/notas", label: "Notas", icon: "∴" },
    ],
  },
  {
    title: "Evolução",
    items: [
      { href: "/plano", label: "Plano", icon: "◈" },
      { href: "/progresso", label: "Progresso", icon: "▚" },
      { href: "/conquistas", label: "Conquistas", icon: "✦" },
    ],
  },
  { title: null, items: [{ href: "/config", label: "Ajustes", icon: "⚙" }] },
];

const NAV_KEY = "mm:nav"; // "full" | "rail"

export default function Nav() {
  const pathname = usePathname();
  const { cards, attempts, settings, ready } = useApp();
  // Sidebar retrátil (só desktop): "rail" = trilho estreito com ícones.
  // Começa "full" no SSR e adota a preferência salva após montar (evita
  // hydration mismatch; o layout-shift é imperceptível).
  const [rail, setRail] = useState(false);
  useEffect(() => {
    try {
      setRail(localStorage.getItem(NAV_KEY) === "rail");
    } catch {
      /* ignora */
    }
  }, []);
  function toggleRail() {
    setRail((r) => {
      try {
        localStorage.setItem(NAV_KEY, r ? "full" : "rail");
      } catch {
        /* ignora */
      }
      return !r;
    });
  }

  const now = Date.now();
  const due = ready ? cappedDueCards(cards, settings, now).length : 0;

  const errCards = ready ? cards.filter(isLeech).length : 0;
  const latestByEx = new Map<string, { grade: string; ts: number }>();
  if (ready && attempts) {
    for (const a of attempts.values()) {
      const p = latestByEx.get(a.exKey);
      if (!p || a.ts > p.ts) latestByEx.set(a.exKey, a);
    }
  }
  const errEx = ready ? [...latestByEx.values()].filter((a) => a.grade === "errei").length : 0;
  const errors = errCards + errEx;

  const isActive = (href: string) => (href === "/" ? pathname === "/" : pathname.startsWith(href));

  const renderItem = (l: Item) => {
    const active = isActive(l.href);
    const showBadges = l.href === "/revisar" && (due > 0 || errors > 0);
    return (
      <Link
        key={l.href}
        href={l.href}
        prefetch
        aria-current={active ? "page" : undefined}
        aria-label={rail ? l.label : undefined}
        title={rail ? l.label : undefined}
        className={`group relative flex items-center gap-3 rounded-xl px-3 py-2 text-sm whitespace-nowrap transition-colors duration-150 ease-out ${
          rail ? "md:justify-center md:px-0" : ""
        } ${
          active
            ? "bg-[var(--color-raise)] text-[var(--color-txt)] font-semibold"
            : "text-[var(--color-txt3)] hover:bg-[var(--color-raise)] hover:text-[var(--color-txt)]"
        }`}
      >
        {active && (
          <span className="absolute left-0 top-2 bottom-2 w-[3px] rounded-full bg-[var(--color-brand)]" aria-hidden="true" />
        )}
        <span
          className={`w-5 text-center transition-colors duration-150 ease-out ${
            active ? "text-[var(--color-brand)]" : "text-[var(--color-mut)] group-hover:text-[var(--color-txt)]"
          }`}
          aria-hidden="true"
        >
          {l.icon}
        </span>
        <span className={rail ? "md:hidden" : ""}>{l.label}</span>
        {showBadges && !rail && (
          <span className="ml-auto flex items-center gap-1">
            {due > 0 && (
              <span className="rounded-full px-1.5 py-0.5 text-[10px] font-bold bg-[var(--color-brand)] text-white">
                {due}
                <span className="sr-only"> revisões pendentes</span>
              </span>
            )}
            {errors > 0 && (
              <span className="rounded-full px-1.5 py-0.5 text-[10px] font-bold bg-[#ff6b6b] text-white">
                {errors}
                <span className="sr-only"> itens no modo erros</span>
              </span>
            )}
          </span>
        )}
        {showBadges && rail && (
          <span
            className="hidden md:block absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-[var(--color-brand)]"
            aria-hidden="true"
          >
            <span className="sr-only">{due + errors} pendências de revisão</span>
          </span>
        )}
      </Link>
    );
  };

  return (
    <nav
      aria-label="Navegação principal"
      className={`${
        rail ? "md:w-16" : "md:w-60"
      } md:min-h-screen md:border-r border-[var(--color-line)] md:sticky md:top-0 px-3 py-4 md:py-6 flex md:flex-col gap-1 bg-[var(--color-scrim)] backdrop-blur-xl overflow-x-auto md:overflow-x-visible transition-[width] duration-200`}
    >
      <div className={`hidden md:flex items-center mb-3 ${rail ? "justify-center" : "justify-between px-3"}`}>
        <Link href="/" className="flex items-center gap-2 group" aria-label="Início">
          <span
            className="grid place-items-center w-8 h-8 rounded-xl bg-gradient-to-br from-[var(--color-brand)] to-[var(--color-brand2)] text-black font-black text-lg"
            aria-hidden="true"
          >
            ∑
          </span>
          {!rail && (
            <span className="font-extrabold tracking-tight text-lg">
              Mate<span className="text-[var(--color-brand)]">monstro</span>
            </span>
          )}
        </Link>
        {!rail && (
          <button
            type="button"
            onClick={toggleRail}
            aria-label="Recolher menu"
            title="Recolher menu"
            className="text-[var(--color-mut)] hover:text-[var(--color-txt)] rounded-lg px-1.5 py-1 transition-colors"
          >
            ⟨
          </button>
        )}
      </div>
      {rail && (
        <button
          type="button"
          onClick={toggleRail}
          aria-label="Expandir menu"
          title="Expandir menu"
          className="hidden md:grid place-items-center text-[var(--color-mut)] hover:text-[var(--color-txt)] rounded-lg py-1 mb-1 transition-colors"
        >
          ⟩
        </button>
      )}

      <button
        type="button"
        onClick={() => window.dispatchEvent(new Event("mm:open-palette"))}
        aria-label="Buscar (Ctrl+K)"
        title={rail ? "Buscar (⌘K)" : undefined}
        className={`flex items-center gap-3 rounded-xl px-3 py-2 text-sm text-[var(--color-txt3)] border border-[var(--color-line)] bg-[var(--color-well)] hover:border-[var(--color-line2)] hover:text-[var(--color-txt)] transition-colors mb-1 ${
          rail ? "md:justify-center md:px-0" : ""
        }`}
      >
        <span className="text-[var(--color-mut)]" aria-hidden="true">⌕</span>
        {!rail && (
          <>
            <span>Buscar…</span>
            <span className="ml-auto text-[10px] text-[var(--color-mut)] border border-[var(--color-line2)] rounded px-1.5 py-0.5">
              ⌘K
            </span>
          </>
        )}
      </button>

      {groups.map((g, gi) => (
        <div key={gi} className={g.title ? "md:mt-2" : ""}>
          {g.title && !rail && (
            <div className="hidden md:block px-3 pt-2 pb-1 text-[10px] font-semibold uppercase tracking-wider text-[var(--color-mut)]">
              {g.title}
            </div>
          )}
          {g.title && rail && <div className="hidden md:block mx-3 my-2 border-t border-[var(--color-line)]" aria-hidden="true" />}
          <div className="flex md:flex-col gap-1">{g.items.map(renderItem)}</div>
        </div>
      ))}

      <div className="mt-auto">
        <AccountButton compact={rail} />
        {!rail && (
          <div className="hidden md:block px-3 pt-4 text-[11px] text-[var(--color-mut)] leading-relaxed">
            Da base ao mestrado.<br />Um teorema por vez.
          </div>
        )}
      </div>
    </nav>
  );
}
