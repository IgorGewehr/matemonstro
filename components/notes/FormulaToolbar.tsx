"use client";

import { useMemo, useState, type RefObject } from "react";
import {
  NOTES_LATEX_SNIPPETS,
  SYMBOL_PALETTE,
  insertLatexSnippet,
  type LatexSnippet,
  type LatexSymbol,
} from "@/lib/notes-latex";

const GROUPS: LatexSnippet["group"][] = ["Estrutura", "Calculo", "Algebra", "Grego", "Logica"];
const GROUP_LABEL: Record<LatexSnippet["group"], string> = {
  Estrutura: "Estrutura",
  Calculo: "Cálculo",
  Algebra: "Álgebra",
  Grego: "Grego",
  Logica: "Lógica",
};

export interface FormulaToolbarProps {
  textareaRef: RefObject<HTMLTextAreaElement | null>;
  value: string;
  onInsert: (next: string, selStart: number, selEnd: number) => void;
}

export default function FormulaToolbar({ textareaRef, value, onInsert }: FormulaToolbarProps) {
  const [group, setGroup] = useState<LatexSnippet["group"]>("Estrutura");

  const byGroup = useMemo(() => {
    const m = new Map<LatexSnippet["group"], LatexSnippet[]>();
    for (const g of GROUPS) m.set(g, []);
    for (const s of NOTES_LATEX_SNIPPETS ?? []) {
      if (!m.has(s.group)) m.set(s.group, []);
      m.get(s.group)!.push(s);
    }
    return m;
  }, []);

  function apply(snippet: LatexSnippet | LatexSymbol) {
    const ta = textareaRef.current;
    if (!ta) return;
    const start = ta.selectionStart ?? value.length;
    const end = ta.selectionEnd ?? value.length;
    const res = insertLatexSnippet(value, start, end, snippet);
    onInsert(res.value, res.selectionStart, res.selectionEnd);
  }

  const items = byGroup.get(group) ?? [];

  return (
    <div className="notes-toolbar">
      <div className="flex flex-wrap gap-1 mb-2">
        {GROUPS.map((g) => (
          <button
            key={g}
            type="button"
            onClick={() => setGroup(g)}
            className={`chip !py-0.5 ${group === g ? "!border-[var(--color-brand)] !text-[var(--color-brand)]" : ""}`}
          >
            {GROUP_LABEL[g]}
          </button>
        ))}
      </div>
      <div className="flex flex-wrap gap-1.5 mb-2">
        {items.length === 0 && (
          <span className="text-xs text-[var(--color-mut)]">Sem snippets neste grupo.</span>
        )}
        {items.map((s) => (
          <button
            key={s.id}
            type="button"
            title={s.latex}
            onClick={() => apply(s)}
            className="btn !py-1 !px-2.5 text-xs"
          >
            {s.label}
          </button>
        ))}
      </div>
      {SYMBOL_PALETTE && SYMBOL_PALETTE.length > 0 && (
        <div className="flex flex-wrap gap-1 pt-2 border-t border-[var(--color-line)]">
          {SYMBOL_PALETTE.map((sym) => (
            <button
              key={sym.latex}
              type="button"
              title={sym.label ?? sym.latex}
              onClick={() => apply(sym)}
              className="notes-symbol-btn"
            >
              {sym.label ?? sym.latex}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
