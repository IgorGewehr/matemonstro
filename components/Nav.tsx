"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useApp } from "./AppState";
import { dueCards, isLeech } from "@/lib/srs";
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
      { href: "/notas", label: "Notas", icon: "🗒" },
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

export default function Nav() {
  const pathname = usePathname();
  const { cards, attempts, ready } = useApp();
  const now = Date.now();
  const due = ready ? dueCards(cards, now).length : 0;

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
    return (
      <Link
        key={l.href}
        href={l.href}
        prefetch
        aria-current={active ? "page" : undefined}
        className={`group relative flex items-center gap-3 rounded-xl px-3 py-2 text-sm whitespace-nowrap transition-colors duration-100 ${
          active
            ? "bg-[var(--color-raise)] text-[var(--color-txt)] font-semibold"
            : "text-[var(--color-txt3)] hover:bg-[var(--color-raise)] hover:text-[var(--color-txt)]"
        }`}
      >
        {active && (
          <span className="absolute left-0 top-2 bottom-2 w-[3px] rounded-full bg-[var(--color-brand)]" aria-hidden="true" />
        )}
        <span
          className={`w-5 text-center transition-colors ${
            active ? "text-[var(--color-brand)]" : "text-[var(--color-mut)] group-hover:text-[var(--color-txt)]"
          }`}
          aria-hidden="true"
        >
          {l.icon}
        </span>
        <span>{l.label}</span>
        {l.href === "/revisar" && (due > 0 || errors > 0) && (
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
      </Link>
    );
  };

  return (
    <nav
      aria-label="Navegação principal"
      className="md:w-60 md:min-h-screen md:border-r border-[var(--color-line)] md:sticky md:top-0 px-3 py-4 md:py-6 flex md:flex-col gap-1 bg-[var(--color-scrim)] backdrop-blur-xl overflow-x-auto"
    >
      <Link href="/" className="hidden md:flex items-center gap-2 px-3 mb-3 group">
        <span className="grid place-items-center w-8 h-8 rounded-xl bg-gradient-to-br from-[#7c5cff] to-[#00d3a7] text-black font-black text-lg" aria-hidden="true">
          ∑
        </span>
        <span className="font-extrabold tracking-tight text-lg">
          Mate<span className="text-[var(--color-brand)]">monstro</span>
        </span>
      </Link>

      <button
        type="button"
        onClick={() => window.dispatchEvent(new Event("mm:open-palette"))}
        aria-label="Buscar (Ctrl+K)"
        className="flex items-center gap-3 rounded-xl px-3 py-2 text-sm text-[var(--color-txt3)] border border-[var(--color-line)] bg-[var(--color-well)] hover:border-[var(--color-line2)] hover:text-[var(--color-txt)] transition-colors mb-1"
      >
        <span className="text-[var(--color-mut)]" aria-hidden="true">⌕</span>
        <span>Buscar…</span>
        <span className="ml-auto text-[10px] text-[var(--color-mut)] border border-[var(--color-line2)] rounded px-1.5 py-0.5">⌘K</span>
      </button>

      {groups.map((g, gi) => (
        <div key={gi} className={g.title ? "md:mt-2" : ""}>
          {g.title && (
            <div className="hidden md:block px-3 pt-2 pb-1 text-[10px] font-semibold uppercase tracking-wider text-[var(--color-mut)]">
              {g.title}
            </div>
          )}
          <div className="flex md:flex-col gap-1">{g.items.map(renderItem)}</div>
        </div>
      ))}

      <div className="mt-auto">
        <AccountButton />
        <div className="hidden md:block px-3 pt-4 text-[11px] text-[var(--color-mut)] leading-relaxed">
          Da base ao mestrado.<br />Um teorema por vez.
        </div>
      </div>
    </nav>
  );
}
