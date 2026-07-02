// Templates de nota para o fluxo de estudo de matematica pura (Zettelkasten
// matematico): cada template combina callouts (> [!tipo]) com os campos que um
// matematico em formacao deveria preencher — exemplos E nao-exemplos de uma
// definicao, hipoteses/tese de um teorema, estrategia de demonstracao, etc.
// Consumidos pelo NoteEditor (menu "Template").

export interface NoteTemplate {
  id: string;
  label: string;
  icon: string;
  hint: string;
  body: string;
}

export const NOTE_TEMPLATES: NoteTemplate[] = [
  {
    id: "definicao",
    label: "Definição",
    icon: "≔",
    hint: "Conceito novo: enunciado, exemplos e não-exemplos",
    body: `> [!definicao] Nome do conceito
> Enunciado preciso: $\\;$

**Exemplos:**
- $\\;$

**Não-exemplos (onde a definição falha):**
- $\\;$

**Relacionado:** [[ ]]

#definicao`,
  },
  {
    id: "teorema",
    label: "Teorema",
    icon: "◆",
    hint: "Hipóteses, tese, intuição e esboço de prova",
    body: `> [!teorema] Nome do teorema
> **Hipóteses:** $\\;$
> **Tese:** $\\;$

> [!intuicao] Por que é verdade
> A ideia em uma frase, sem símbolos.

> [!demonstracao] Esboço
> 1. $\\;$

**O que quebra sem cada hipótese:** [[ ]]

#teorema`,
  },
  {
    id: "demonstracao",
    label: "Demonstração",
    icon: "∎",
    hint: "Treino de prova: estratégia, passos e onde travou",
    body: `> [!demonstracao] Quero provar
> $\\;$

**Estratégia:** direta · contrapositiva · contradição · indução

**Passos:**
1. $\\;$

> [!atencao] Onde travei
> O passo exato em que a prova emperrou — e o que destravou.

#demonstracao`,
  },
  {
    id: "exemplo",
    label: "Exemplo trabalhado",
    icon: "✎",
    hint: "Problema resolvido + a técnica que ele ensina",
    body: `> [!exemplo] Problema
> $\\;$

**Resolução:**
1. $\\;$

> [!intuicao] Moral da história
> Que técnica esse exemplo ensina? Quando usá-la de novo?

#exemplo`,
  },
  {
    id: "contraexemplo",
    label: "Contraexemplo",
    icon: "⊘",
    hint: "Afirmação falsa + o exemplo que a derruba",
    body: `> [!contraexemplo] Afirmação falsa
> "$\\;$"

**O contraexemplo:** $\\;$

**Por que funciona:** $\\;$

**A hipótese que faltou:** $\\;$

#contraexemplo`,
  },
  {
    id: "duvida",
    label: "Dúvida",
    icon: "?",
    hint: "O que não entendi, o que já sei, onde procurar",
    body: `> [!duvida] O que não entendi
> $\\;$

**O que eu já sei:** $\\;$

**Onde procurar / a quem perguntar:** [[ ]]

#duvida`,
  },
  {
    id: "resumo",
    label: "Resumo de aula",
    icon: "§",
    hint: "Zettel de aula: ideias centrais e conexões",
    body: `> [!resumo] Em uma frase
> $\\;$

**Conceitos centrais:** [[ ]]

**Conexões com o que já sei:** $\\;$

**Perguntas em aberto:** $\\;$

#resumo`,
  },
];
