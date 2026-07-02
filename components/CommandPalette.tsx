"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useApp } from "./AppState";
import { searchSubtopics, searchTerms } from "@/lib/search";
import { useNotes } from "@/components/notes/NotesProvider";
import { searchNotes } from "@/lib/notes";
import { dailyTitle, dailyTemplate, findDailyNote } from "@/lib/daily";
import { useFocusTrap } from "@/lib/useFocusTrap";
import { useCurriculumReady } from "@/lib/useCurriculum";

// Item selecionavel da lista achatada (acoes + resultados + termos + ajuda).
interface PaletteItem {
  key: string;
  group: string;
  label: string;
  sub?: string;
  badge?: string;
  run: () => void | Promise<void>;
}

const HELP_ROWS: { keys: string; desc: string }[] = [
  { keys: "Ctrl / Cmd + K", desc: "Abrir esta busca" },
  { keys: "↑ ↓", desc: "Navegar resultados" },
  { keys: "Enter", desc: "Abrir o item selecionado" },
  { keys: "Esc", desc: "Fechar" },
  { keys: "g h", desc: "Ir para Hoje" },
  { keys: "g t", desc: "Ir para Trilhas" },
  { keys: "g r", desc: "Ir para Revisar" },
  { keys: "g n", desc: "Ir para Notas" },
  { keys: "g p", desc: "Ir para Praticar" },
  { keys: "g b", desc: "Ir para a Biblioteca" },
  { keys: "g d", desc: "Treinar demonstração" },
  { keys: "g s", desc: "Simulado com relógio" },
  { keys: "?", desc: "Abrir a ajuda de atalhos" },
];

export default function CommandPalette() {
  const router = useRouter();
  const { exportData } = useApp();
  const { notes, create: createNote } = useNotes();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [sel, setSel] = useState(0);
  const [showHelp, setShowHelp] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  useFocusTrap(panelRef, open);
  // re-renderiza quando o currículo (carregado em runtime) chega — a busca
  // de subtópicos/termos depende dele.
  const curReady = useCurriculumReady();

  const close = useCallback(() => {
    setOpen(false);
    setQ("");
    setSel(0);
    setShowHelp(false);
  }, []);

  const openPalette = useCallback((help = false) => {
    setShowHelp(help);
    setQ("");
    setSel(0);
    setOpen(true);
  }, []);

  // Abertura global: Ctrl/Cmd+K + evento 'mm:open-palette' (Nav / Shortcuts).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && (e.key === "k" || e.key === "K")) {
        e.preventDefault();
        setOpen((v) => !v);
        setShowHelp(false);
        setQ("");
        setSel(0);
      }
    };
    const onOpen = (e: Event) => {
      const detail = (e as CustomEvent).detail as { help?: boolean } | undefined;
      openPalette(!!detail?.help);
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener("mm:open-palette", onOpen as EventListener);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("mm:open-palette", onOpen as EventListener);
    };
  }, [openPalette]);

  // Foco no input ao abrir.
  useEffect(() => {
    if (open) requestAnimationFrame(() => inputRef.current?.focus());
  }, [open]);

  const go = useCallback(
    (href: string) => {
      close();
      router.push(href);
    },
    [close, router]
  );

  async function exportBackup() {
    close();
    const json = await exportData();
    const blob = new Blob([json], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `matemonstro-backup-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  // Acoes rapidas fixas (filtraveis pelo texto digitado).
  const actions: PaletteItem[] = useMemo(
    () => [
      { key: "a-hoje", group: "Acoes", label: "Ir para Hoje", badge: "◉", run: () => go("/") },
      { key: "a-trilhas", group: "Acoes", label: "Ver Trilhas", badge: "▤", run: () => go("/trilhas") },
      { key: "a-revisar", group: "Acoes", label: "Revisar cartoes", badge: "↻", run: () => go("/revisar") },
      {
        key: "a-foco",
        group: "Acoes",
        label: "Sessao de foco (25/50 min)",
        badge: "◉",
        run: () => {
          close();
          window.dispatchEvent(new CustomEvent("mm:start-focus", { detail: { label: "Estudo focado" } }));
        },
      },
      { key: "a-provas", group: "Acoes", label: "Treinar demonstracao", badge: "∎", run: () => go("/provas") },
      { key: "a-simulado", group: "Acoes", label: "Simulado com relogio", badge: "◷", run: () => go("/simulado") },
      {
        key: "a-diario",
        group: "Acoes",
        label: "Diario de hoje",
        badge: "✎",
        run: async () => {
          close();
          const existing = findDailyNote(notes);
          if (existing) {
            router.push(`/notas/${existing.id}`);
            return;
          }
          const n = await createNote({ title: dailyTitle(), body: dailyTemplate(), tags: ["diario"] });
          router.push(`/notas/${n.id}`);
        },
      },
      { key: "a-notas", group: "Acoes", label: "Minhas notas", badge: "≣", run: () => go("/notas") },
      { key: "a-grafo", group: "Acoes", label: "Grafo de notas", badge: "❖", run: () => go("/notas/grafo") },
      { key: "a-mapa", group: "Acoes", label: "Mapa do curriculo", badge: "⊞", run: () => go("/mapa") },
      { key: "a-biblioteca", group: "Acoes", label: "Biblioteca de resultados", badge: "≔", run: () => go("/biblioteca") },
      { key: "a-plano", group: "Acoes", label: "Plano do dia", badge: "◈", run: () => go("/plano") },
      { key: "a-progresso", group: "Acoes", label: "Progresso", badge: "▚", run: () => go("/progresso") },
      { key: "a-praticar", group: "Acoes", label: "Praticar", badge: "✎", run: () => go("/praticar") },
      { key: "a-conquistas", group: "Acoes", label: "Conquistas", badge: "★", run: () => go("/conquistas") },
      { key: "a-config", group: "Acoes", label: "Ajustes", badge: "⚙", run: () => go("/config") },
      { key: "a-export", group: "Acoes", label: "Exportar backup", badge: "⇩", run: exportBackup },
      { key: "a-help", group: "Acoes", label: "Ajuda de atalhos", badge: "?", run: () => { setShowHelp(true); setSel(0); } },
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [go, notes]
  );

  const nq = q.trim().toLowerCase();

  const items: PaletteItem[] = useMemo(() => {
    const out: PaletteItem[] = [];

    // Acoes: sem query mostra todas; com query, filtra por substring simples.
    const acts = nq
      ? actions.filter((a) => a.label.toLowerCase().includes(nq))
      : actions;
    out.push(...acts);

    if (q.trim()) {
      // Notas do usuario (titulo, corpo, tags e #tags do corpo).
      for (const note of searchNotes(notes, q).slice(0, 6)) {
        out.push({
          key: `n-${note.id}`,
          group: "Minhas notas",
          label: note.title || "Sem título",
          sub: (note.body || "").replace(/\s+/g, " ").slice(0, 60) || "nota vazia",
          badge: "≣",
          run: () => go(`/notas/${note.id}`),
        });
      }
      for (const hit of searchSubtopics(q, 20)) {
        out.push({
          key: `s-${hit.subId}`,
          group: "Subtopicos",
          label: hit.title,
          sub: `${hit.trackTitle}${hit.matchedIn !== "Titulo" ? ` · ${hit.matchedIn}` : ""}`,
          run: () => go(`/estudar/${hit.trackId}/${hit.subId}`),
        });
      }
      const terms = searchTerms(q, 6);
      for (const t of terms) {
        out.push({
          key: `t-${t.kind}-${t.subId}-${t.term}`,
          group: "Onde este termo aparece",
          label: `${t.term}`,
          sub: `${t.kind} · ${t.subTitle} — ${t.trackTitle}`,
          run: () => go(`/estudar/${t.trackId}/${t.subId}`),
        });
      }
      // Sempre oferece criar uma nota com o texto digitado como titulo.
      const newTitle = q.trim();
      out.push({
        key: "a-new-note",
        group: "Criar",
        label: `Nova nota: “${newTitle}”`,
        badge: "+",
        run: async () => {
          close();
          const n = await createNote({ title: newTitle, body: "" });
          router.push(`/notas/${n.id}`);
        },
      });
    }
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q, nq, actions, go, notes, curReady]);

  // Mantem a selecao dentro dos limites quando a lista muda.
  useEffect(() => {
    setSel((s) => (items.length ? Math.min(s, items.length - 1) : 0));
  }, [items.length]);

  // Rola o item selecionado para a vista.
  useEffect(() => {
    if (!open || showHelp) return;
    const el = listRef.current?.querySelector<HTMLElement>(`[data-idx="${sel}"]`);
    el?.scrollIntoView({ block: "nearest" });
  }, [sel, open, showHelp, items.length]);

  function onInputKey(e: React.KeyboardEvent) {
    if (e.key === "Escape") {
      e.preventDefault();
      close();
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      setShowHelp(false);
      setSel((s) => (items.length ? (s + 1) % items.length : 0));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setShowHelp(false);
      setSel((s) => (items.length ? (s - 1 + items.length) % items.length : 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      const it = items[sel];
      if (it) it.run();
    }
  }

  if (!open) return null;

  // Agrupa preservando o indice achatado (para setas/Enter).
  const groups: { name: string; rows: { item: PaletteItem; idx: number }[] }[] = [];
  items.forEach((item, idx) => {
    const last = groups[groups.length - 1];
    if (last && last.name === item.group) last.rows.push({ item, idx });
    else groups.push({ name: item.group, rows: [{ item, idx }] });
  });

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center px-4 pt-[12vh] bg-black/60 backdrop-blur-sm"
      onMouseDown={close}
      role="dialog"
      aria-modal="true"
      aria-label="Busca e comandos"
    >
      <div
        ref={panelRef}
        className="panel w-full max-w-xl overflow-hidden shadow-2xl"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-3 px-4 py-3 border-b border-[var(--color-line)]">
          <span className="text-[var(--color-mut)]" aria-hidden="true">
            ⌕
          </span>
          <input
            ref={inputRef}
            value={q}
            onChange={(e) => {
              setQ(e.target.value);
              setSel(0);
              setShowHelp(false);
            }}
            onKeyDown={onInputKey}
            placeholder="Buscar subtopico, teorema, conceito ou acao…"
            className="flex-1 bg-transparent outline-none text-[15px] placeholder:text-[var(--color-mut)]"
            aria-label="Buscar"
            autoComplete="off"
            spellCheck={false}
          />
          <span className="chip !px-2 !py-0.5 text-[10px]">Esc</span>
        </div>

        <div ref={listRef} className="max-h-[52vh] overflow-y-auto py-2">
          {showHelp ? (
            <div className="px-4 py-2">
              <div className="text-[11px] uppercase tracking-wide text-[var(--color-mut)] mb-2">
                Atalhos de teclado
              </div>
              <div className="grid gap-1.5">
                {HELP_ROWS.map((r) => (
                  <div key={r.keys} className="flex items-center justify-between text-sm">
                    <span className="text-[var(--color-mut)]">{r.desc}</span>
                    <span className="chip !px-2 !py-0.5 font-mono">{r.keys}</span>
                  </div>
                ))}
              </div>
            </div>
          ) : items.length === 0 ? (
            <div className="px-4 py-8 text-center text-sm text-[var(--color-mut)]">
              Nada encontrado para “{q}”.
            </div>
          ) : (
            groups.map((g) => (
              <div key={g.name} className="mb-1">
                <div className="px-4 pt-2 pb-1 text-[10px] uppercase tracking-wide text-[var(--color-mut)]">
                  {g.name}
                </div>
                {g.rows.map(({ item, idx }) => (
                  <button
                    key={item.key}
                    data-idx={idx}
                    onMouseEnter={() => setSel(idx)}
                    onClick={() => item.run()}
                    className={`w-full text-left px-4 py-2 flex items-center gap-3 transition-colors ${
                      idx === sel ? "bg-[var(--color-raise)]" : "hover:bg-[var(--color-card)]"
                    }`}
                  >
                    {item.badge && (
                      <span className="text-[var(--color-mut)] w-4 text-center" aria-hidden="true">
                        {item.badge}
                      </span>
                    )}
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm">{item.label}</span>
                      {item.sub && (
                        <span className="block truncate text-[11px] text-[var(--color-mut)]">
                          {item.sub}
                        </span>
                      )}
                    </span>
                    {idx === sel && (
                      <span className="chip !px-2 !py-0.5 text-[10px]" aria-hidden="true">
                        ↵
                      </span>
                    )}
                  </button>
                ))}
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
