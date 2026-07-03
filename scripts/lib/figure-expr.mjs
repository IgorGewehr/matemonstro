// Compilador de expressoes de figura, SEM framework — espelha a whitelist de
// components/Figure.tsx para que o validador (node) confirme, em tempo de build,
// que toda figure.expr/overlay compila e avalia a um numero. Mantido em sincronia
// com Figure.tsx de proposito (a versao do componente e a fonte de verdade visual).

export function splitTop(s) {
  const out = [];
  let depth = 0;
  let cur = "";
  for (const ch of s) {
    if (ch === "(") depth++;
    else if (ch === ")") depth--;
    if (ch === "," && depth === 0) { out.push(cur); cur = ""; }
    else cur += ch;
  }
  out.push(cur);
  return out;
}

export function compile(expr, vars) {
  let js = (expr ?? "").trim();
  if (!js) return null;
  js = js.replace(/π/g, "pi").replace(/−/g, "-").replace(/\^/g, "**");
  const fns = [
    "sqrt", "cbrt", "sinh", "cosh", "tanh", "asin", "acos", "atan2", "atan",
    "sin", "cos", "tan", "exp", "sign", "floor", "ceil", "round", "abs",
    "log", "min", "max", "pow",
  ];
  for (const fn of fns) js = js.replace(new RegExp("\\b" + fn + "\\b", "g"), "Math." + fn);
  js = js.replace(/\bpi\b/g, "Math.PI");
  js = js.replace(/\bln\b/g, "Math.log");
  js = js.replace(/\be\b/g, "Math.E");
  const varRe = vars.length ? new RegExp("\\b(" + vars.join("|") + ")\\b", "g") : null;
  let check = js.replace(/Math\.[A-Za-z0-9]+/g, "");
  if (varRe) check = check.replace(varRe, "");
  const stripped = check.replace(/[0-9.+\-*/(),\s]/g, "");
  if (stripped.length) return null;
  try {
    // eslint-disable-next-line no-new-func
    const fn = new Function(...vars, "return (" + js + ");");
    const probe = fn(...vars.map(() => 1));
    if (typeof probe !== "number") return null;
    return fn;
  } catch {
    return null;
  }
}

// Variaveis livres esperadas por tipo de figura.
export function varsForKind(kind, paramNames) {
  if (kind === "parametric") return ["t", ...paramNames];
  if (kind === "vectorfield") return ["x", "y", ...paramNames];
  return ["x", ...paramNames];
}

// Valida uma figura inteira; retorna lista de problemas (vazia = ok).
export function validateFigure(fig) {
  const problems = [];
  const KINDS = new Set(["plot2d", "vectorfield", "riemann", "series", "parametric"]);
  if (!KINDS.has(fig?.kind)) return [`kind invalido "${fig?.kind}"`];
  const paramNames = (fig.params ?? []).map((p) => p.name);
  for (const p of fig.params ?? []) {
    if (typeof p.name !== "string" || !p.name) problems.push("param sem name");
    if (typeof p.min !== "number" || typeof p.max !== "number" || typeof p.default !== "number")
      problems.push(`param "${p.name}" com min/max/default nao-numerico`);
  }
  const vars = varsForKind(fig.kind, paramNames);

  if (fig.kind === "parametric" || fig.kind === "vectorfield") {
    const parts = splitTop(fig.expr ?? "");
    if (parts.length < 2) problems.push(`${fig.kind} precisa de 2 componentes separados por virgula`);
    for (const [i, part] of parts.slice(0, 2).entries()) {
      const localVars = fig.kind === "parametric" ? ["t", ...paramNames] : ["x", "y", ...paramNames];
      if (!compile(part, localVars)) problems.push(`componente ${i + 1} nao compila: "${part.trim()}"`);
    }
  } else {
    if (!compile(fig.expr, vars)) problems.push(`expr nao compila: "${fig.expr}"`);
    if (fig.kind === "riemann" && !paramNames.includes("n"))
      problems.push(`riemann sem param "n" (numero de retangulos)`);
  }

  for (const [i, ov] of (fig.overlay ?? []).entries()) {
    if (!compile(ov, vars)) problems.push(`overlay[${i}] nao compila: "${ov}"`);
  }
  return problems;
}
