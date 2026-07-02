// Daily note (diário de estudo): uma nota por dia, com prompts de reflexão de
// matemático — o fechamento honesto do dia de estudo. Reusa toda a infra de
// notas (sync, busca, grafo, ⌘K). Funções puras.

import type { Note } from "./types";

export function dailyKey(now: number = Date.now()): string {
  return new Date(now).toISOString().slice(0, 10); // YYYY-MM-DD
}

export function dailyTitle(now: number = Date.now()): string {
  return `Diário — ${dailyKey(now)}`;
}

export function findDailyNote(notes: Note[], now: number = Date.now()): Note | undefined {
  const title = dailyTitle(now).toLowerCase();
  return notes.find((n) => !n.deleted && (n.title ?? "").trim().toLowerCase() === title);
}

export function dailyTemplate(now: number = Date.now()): string {
  const human = new Date(now).toLocaleDateString("pt-BR", {
    weekday: "long",
    day: "numeric",
    month: "long",
  });
  return `_${human}_

> [!resumo] O que eu aprendi hoje
> $\\;$

> [!atencao] Onde travei
> O ponto exato — e o que eu tentei.

> [!duvida] Perguntas em aberto
> $\\;$

**Liguei com:** [[ ]]

**Amanhã eu começo por:** $\\;$

#diario`;
}
