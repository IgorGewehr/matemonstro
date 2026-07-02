# Ícones do PWA (placeholders)

Estes PNGs são **placeholders gerados programaticamente** (um "monstrinho"
minimalista sobre fundo `#0c0d14`), apenas para o manifest ser válido e o app
instalável. Troque por arte final quando houver.

| Arquivo            | Tamanho   | `purpose` | Uso                                   |
| ------------------ | --------- | --------- | ------------------------------------- |
| `icon-192.png`     | 192×192   | `any`     | Ícone padrão (home screen / aba)      |
| `icon-512.png`     | 512×512   | `any`     | Splash / ícone em alta resolução      |
| `maskable-512.png` | 512×512   | `maskable`| Adaptável (safe zone ~80%, Android)   |

## Como regenerar / substituir

- **Substituir:** exporte a arte final nos mesmos nomes/tamanhos. Para o
  `maskable`, mantenha o conteúdo dentro da _safe zone_ central (~80% do
  quadro) para não ser cortado em máscaras circulares.
- **Regenerar os placeholders:** o script usado foi
  `scripts/` não versionado; qualquer gerador de PNG RGBA 8-bit serve. Nenhuma
  dependência de runtime — são assets estáticos servidos de `public/icons/`.

O `manifest.webmanifest` referencia estes três arquivos. Se renomear, atualize
o manifest também.
