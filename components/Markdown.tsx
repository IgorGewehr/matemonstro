"use client";

import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";

// ---- Callouts matematicos (estilo Obsidian): "> [!teorema] Titulo" ----
// Um blockquote cujo primeiro texto comeca com [!tipo] vira um bloco destacado
// (div.callout) com titulo colorido e icone. Tipos em PT-BR + aliases comuns.
// Estilos em globals.css (usam CSS vars — funcionam em todos os temas).

interface MdNode {
  type: string;
  children?: MdNode[];
  value?: string;
  data?: {
    hName?: string;
    hProperties?: Record<string, unknown>;
  };
}

interface CalloutDef {
  key: string;
  label: string;
  icon: string;
}

const CALLOUT_TYPES: Record<string, CalloutDef> = {};
function defCallout(key: string, label: string, icon: string, ...aliases: string[]) {
  const def: CalloutDef = { key, label, icon };
  for (const name of [key, ...aliases]) CALLOUT_TYPES[name] = def;
}
defCallout("definicao", "Definição", "≔", "definição", "def", "definition");
defCallout("teorema", "Teorema", "◆", "theorem", "thm");
defCallout("lema", "Lema", "◇", "lemma");
defCallout("proposicao", "Proposição", "▣", "proposição", "prop");
defCallout("corolario", "Corolário", "▷", "corolário", "corollary");
defCallout("demonstracao", "Demonstração", "∎", "demonstração", "prova", "proof", "dem");
defCallout("exemplo", "Exemplo", "✎", "example", "ex");
defCallout("contraexemplo", "Contraexemplo", "⊘", "counterexample");
defCallout("intuicao", "Intuição", "∿", "intuição", "ideia", "idea", "insight");
defCallout("atencao", "Atenção", "⚠", "atenção", "cuidado", "warning", "erro");
defCallout("duvida", "Dúvida", "?", "dúvida", "pergunta", "question");
defCallout("resumo", "Resumo", "§", "summary", "tldr");
defCallout("nota", "Nota", "✦", "note", "info", "obs");

const MARKER_RE = /^\[!([\p{L}-]+)\]\s*/u;

function transformBlockquote(node: MdNode): void {
  const first = node.children?.[0];
  if (!first || first.type !== "paragraph" || !first.children?.length) return;
  const head = first.children[0];
  if (head.type !== "text" || typeof head.value !== "string") return;
  const m = MARKER_RE.exec(head.value);
  if (!m) return;
  const def = CALLOUT_TYPES[m[1].toLowerCase()];
  if (!def) return;

  head.value = head.value.slice(m[0].length);

  // A "linha do titulo" = filhos inline do primeiro paragrafo ate a primeira
  // quebra de linha (suporta $math$ no titulo); o resto vira corpo.
  const titleChildren: MdNode[] = [];
  const bodyChildren: MdNode[] = [];
  let splitDone = false;
  for (const child of first.children) {
    if (splitDone) {
      bodyChildren.push(child);
      continue;
    }
    if (child.type === "text" && typeof child.value === "string" && child.value.includes("\n")) {
      const idx = child.value.indexOf("\n");
      const before = child.value.slice(0, idx);
      const after = child.value.slice(idx + 1);
      if (before.trim()) titleChildren.push({ type: "text", value: before });
      if (after) bodyChildren.push({ type: "text", value: after });
      splitDone = true;
    } else {
      titleChildren.push(child);
    }
  }
  while (
    titleChildren.length &&
    titleChildren[0].type === "text" &&
    !(titleChildren[0].value ?? "").trim()
  ) {
    titleChildren.shift();
  }
  if (titleChildren.length === 0) titleChildren.push({ type: "text", value: def.label });

  const titleNode: MdNode = {
    type: "paragraph",
    data: { hName: "div", hProperties: { className: "callout-title", "data-icon": def.icon } },
    children: titleChildren,
  };
  const rest = node.children!.slice(1);
  const newChildren: MdNode[] = [titleNode];
  if (bodyChildren.length) newChildren.push({ type: "paragraph", children: bodyChildren });
  newChildren.push(...rest);
  node.children = newChildren;
  node.data = {
    ...(node.data ?? {}),
    hName: "div",
    hProperties: { className: `callout callout-${def.key}`, "data-callout": def.key },
  };
}

function remarkCallouts() {
  return (tree: MdNode) => {
    const visit = (n: MdNode) => {
      n.children?.forEach(visit);
      if (n.type === "blockquote") transformBlockquote(n);
    };
    visit(tree);
  };
}

const REMARK_PLUGINS = [remarkGfm, remarkMath, remarkCallouts];
const REHYPE_PLUGINS: unknown[] = [[rehypeKatex, { throwOnError: false, strict: false }]];

export default function Markdown({ children, className }: { children: string; className?: string }) {
  return (
    <div className={`mathbody ${className ?? ""}`}>
      <ReactMarkdown
        remarkPlugins={REMARK_PLUGINS as never}
        rehypePlugins={REHYPE_PLUGINS as never}
      >
        {children || ""}
      </ReactMarkdown>
    </div>
  );
}
