// Catalogo de snippets/paleta LaTeX para a barra de formulas do editor de notas
// (components/notes/FormulaToolbar.tsx). Cada snippet traz o LaTeX a inserir e,
// opcionalmente, o deslocamento do cursor apos a insercao (posicao relativa ao
// inicio do texto inserido); sem `cursorOffset`, o cursor vai para o fim do
// texto inserido.

export type LatexSnippetGroup = "Estrutura" | "Calculo" | "Algebra" | "Grego" | "Logica";

export interface LatexSnippet {
  id: string;
  label: string; // rotulo em PT-BR do botao
  group: LatexSnippetGroup;
  latex: string; // LaTeX a inserir no corpo da nota
  cursorOffset?: number; // posicao do cursor apos a insercao, relativa ao inicio de `latex`
}

// Marcador interno usado so na definicao dos templates abaixo, para indicar
// onde o cursor deve ficar depois de inserido; e removido do LaTeX final
// (nunca aparece em `latex`). Sequencia de texto que nunca ocorre em LaTeX.
const CURSOR = "@@";

function snip(id: string, label: string, group: LatexSnippetGroup, template: string): LatexSnippet {
  const idx = template.indexOf(CURSOR);
  const latex = template.split(CURSOR).join("");
  return { id, label, group, latex, cursorOffset: idx >= 0 ? idx : undefined };
}

export const NOTES_LATEX_SNIPPETS: LatexSnippet[] = [
  // ---- Estrutura ----
  snip("fracao", "Fração", "Estrutura", `\\frac{${CURSOR}}{}`),
  snip("raiz", "Raiz", "Estrutura", `\\sqrt{${CURSOR}}`),
  snip("raiz-n", "Raiz n-ésima", "Estrutura", `\\sqrt[n]{${CURSOR}}`),
  snip("potencia", "Potência", "Estrutura", `^{${CURSOR}}`),
  snip("indice", "Índice (subscrito)", "Estrutura", `_{${CURSOR}}`),

  // ---- Calculo ----
  snip("integral", "Integral", "Calculo", `\\int_{${CURSOR}}^{} \\,dx`),
  snip("somatorio", "Somatório", "Calculo", `\\sum_{i=${CURSOR}1}^{n}`),
  snip("produtorio", "Produtório", "Calculo", `\\prod_{i=${CURSOR}1}^{n}`),
  snip("limite", "Limite", "Calculo", `\\lim_{x \\to ${CURSOR}}`),
  snip("derivada-parcial", "Derivada parcial", "Calculo", `\\frac{\\partial ${CURSOR}}{\\partial x}`),

  // ---- Algebra (estruturas de algebra linear) ----
  snip("matriz2x2", "Matriz 2x2", "Algebra", `\\begin{pmatrix} ${CURSOR}a & b \\\\ c & d \\end{pmatrix}`),
  snip("sistema", "Sistema (casos)", "Algebra", `\\begin{cases} ${CURSOR} \\\\ \\end{cases}`),
  snip("vetor", "Vetor", "Algebra", `\\vec{${CURSOR}}`),

  // ---- Letras gregas ----
  snip("alfa", "alpha (α)", "Grego", `\\alpha ${CURSOR}`),
  snip("beta", "beta (β)", "Grego", `\\beta ${CURSOR}`),
  snip("gama", "gamma (γ)", "Grego", `\\gamma ${CURSOR}`),
  snip("delta", "delta (δ)", "Grego", `\\delta ${CURSOR}`),
  snip("epsilon", "epsilon (ε)", "Grego", `\\epsilon ${CURSOR}`),
  snip("theta", "theta (θ)", "Grego", `\\theta ${CURSOR}`),
  snip("lambda", "lambda (λ)", "Grego", `\\lambda ${CURSOR}`),
  snip("mu", "mu (μ)", "Grego", `\\mu ${CURSOR}`),
  snip("pi", "pi (π)", "Grego", `\\pi ${CURSOR}`),
  snip("sigma", "sigma (σ)", "Grego", `\\sigma ${CURSOR}`),
  snip("phi", "phi (φ)", "Grego", `\\phi ${CURSOR}`),
  snip("omega", "omega (ω)", "Grego", `\\omega ${CURSOR}`),

  // ---- Conjuntos / logica ----
  snip("pertence", "Pertence (∈)", "Logica", `\\in ${CURSOR}`),
  snip("subconjunto", "Subconjunto (⊂)", "Logica", `\\subset ${CURSOR}`),
  snip("uniao", "União (∪)", "Logica", `\\cup ${CURSOR}`),
  snip("intersecao", "Interseção (∩)", "Logica", `\\cap ${CURSOR}`),
  snip("paratodo", "Para todo (∀)", "Logica", `\\forall ${CURSOR}`),
  snip("existe", "Existe (∃)", "Logica", `\\exists ${CURSOR}`),
  snip("implica", "Implica (⇒)", "Logica", `\\Rightarrow ${CURSOR}`),
  snip("sse", "Se e somente se (⇔)", "Logica", `\\Leftrightarrow ${CURSOR}`),
  snip("negacao", "Negação (¬)", "Logica", `\\neg ${CURSOR}`),
  snip("vazio", "Conjunto vazio (∅)", "Logica", `\\emptyset ${CURSOR}`),
  snip("reais", "Números reais (ℝ)", "Logica", `\\mathbb{R} ${CURSOR}`),
  snip("naturais", "Números naturais (ℕ)", "Logica", `\\mathbb{N} ${CURSOR}`),
];

export interface LatexSymbol {
  latex: string;
  label?: string;
}

// Paleta de simbolos de insercao rapida (um clique, sem placeholders),
// exibida junto da barra de formulas.
export const SYMBOL_PALETTE: LatexSymbol[] = [
  { latex: "\\pm ", label: "±" },
  { latex: "\\times ", label: "×" },
  { latex: "\\div ", label: "÷" },
  { latex: "\\leq ", label: "≤" },
  { latex: "\\geq ", label: "≥" },
  { latex: "\\neq ", label: "≠" },
  { latex: "\\approx ", label: "≈" },
  { latex: "\\infty ", label: "∞" },
  { latex: "\\partial ", label: "∂" },
  { latex: "\\nabla ", label: "∇" },
  { latex: "\\cdot ", label: "·" },
  { latex: "\\to ", label: "→" },
  { latex: "\\mapsto ", label: "↦" },
  { latex: "\\therefore ", label: "∴" },
];

export function getSnippet(id: string): LatexSnippet | undefined {
  return NOTES_LATEX_SNIPPETS.find((s) => s.id === id);
}

export function snippetsByGroup(group: LatexSnippetGroup): LatexSnippet[] {
  return NOTES_LATEX_SNIPPETS.filter((s) => s.group === group);
}

export interface TextEditResult {
  value: string;
  selectionStart: number;
  selectionEnd: number;
}

/** O ponto `pos` esta dentro de um trecho de matematica ($...$ ou $$...$$)?
 * Heuristica: conta os `$` nao-escapados antes de `pos` — impar = dentro. */
export function insideMath(value: string, pos: number): boolean {
  let count = 0;
  for (let i = 0; i < pos && i < value.length; i++) {
    if (value[i] === "$" && value[i - 1] !== "\\") count++;
  }
  return count % 2 === 1;
}

/**
 * Insere um snippet em `value` no lugar da selecao [selectionStart, selectionEnd)
 * e devolve o novo texto + a posicao de cursor a aplicar no <textarea>.
 *
 * Se o ponto de insercao NAO estiver dentro de $...$, o LaTeX e embrulhado
 * automaticamente em `$...$` — sem isso a pre-visualizacao mostraria o comando
 * cru (\sqrt{} etc.), que era exatamente a confusao do editor antigo.
 */
export function insertLatexSnippet(
  value: string,
  selectionStart: number,
  selectionEnd: number,
  snippet: LatexSnippet | LatexSymbol
): TextEditResult {
  const before = value.slice(0, selectionStart);
  const after = value.slice(selectionEnd);

  const needsWrap = !insideMath(value, selectionStart);
  const raw = snippet.latex;
  // No embrulho, espacos das bordas ficam FORA dos cifroes ("\pm " → "$\pm$ ").
  const trailing = needsWrap && raw.endsWith(" ") ? " " : "";
  const core = needsWrap ? raw.trimEnd() : raw;
  const inserted = needsWrap ? `$${core}$${trailing}` : raw;

  const next = before + inserted + after;
  const hasPlaceholder = "cursorOffset" in snippet && snippet.cursorOffset !== undefined;
  let offset: number;
  if (hasPlaceholder) {
    // cursor no placeholder, deslocado pelo "$" de abertura quando embrulhado
    offset = (snippet as LatexSnippet).cursorOffset! + (needsWrap ? 1 : 0);
  } else {
    // sem placeholder: cursor depois de TUDO (fora do "$" de fechamento)
    offset = inserted.length;
  }
  const cursor = selectionStart + offset;
  return { value: next, selectionStart: cursor, selectionEnd: cursor };
}
