# ∑ Matemonstro

Guia de estudos **interativo** de matemática — da base ao mestrado em matemática pura.
Feito para sair do zero, atravessar todo o bacharelado e chegar pronto para concursos de IF e provas de mestrado.

Não é só um roadmap: é um app que **adapta o plano ao seu tempo**, te faz **anotar o principal**, e usa **revisão espaçada (SRS)** para você nunca mais esquecer o que aprendeu.

## O que tem dentro

- **27 trilhas** organizadas em 3 fases (Fundações → Núcleo → Avançado/Pré-Pós), cobrindo Cálculo, Álgebra Linear, Análise Real, Álgebra Abstrata, Topologia, Análise Complexa, Medida, Análise Funcional, Galois, Geometria Diferencial, Topologia Algébrica, e mais.
- Cada subtópico é uma **aula completa**: objetivos, conceitos-chave, teoremas (com _por que importa_), resumo, exemplo resolvido, erros comuns, exercícios com dicas, e flashcards.
- **Revisão espaçada (SM-2)**: os flashcards de cada aula entram numa fila e voltam nos intervalos certos.
- **Plano de hoje adaptativo**: você diz quantos minutos tem por dia e o app monta a fila (revisões primeiro, depois estudo novo).
- **Projeção de conclusão** vs. sua data-meta (ex.: edital de concurso ou prova de mestrado).
- **Anotações por aula** ("o principal" + notas livres com LaTeX), salvas localmente.
- Matemática renderizada com **KaTeX**.

## Rodando

```bash
npm install
npm run bundle   # monta lib/curriculum-data.json a partir de data/curriculum/
npm run dev      # http://localhost:3000
```

`npm run build` já roda o bundle automaticamente.

## Onde os dados ficam

- **Conteúdo do currículo**: `data/curriculum/tracks/*.json` (uma trilha por arquivo) + `data/curriculum/index.json` (plano/fases). O `npm run bundle` junta tudo em `lib/curriculum-data.json`.
- **Seu progresso, anotações e revisões**: ficam só no seu navegador (IndexedDB). Exporte um backup em **Ajustes** de vez em quando.

## Editar / expandir o currículo

Cada arquivo em `data/curriculum/tracks/` segue o mesmo esquema (veja qualquer um deles).
Edite, crie novos, e rode `npm run validate` e depois `npm run bundle`.

## Stack

Next.js 15 (App Router) · React 19 · TypeScript · Tailwind v4 · IndexedDB (`idb`) · KaTeX.
