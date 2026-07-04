// Deteccao de plataforma: o runtime Tauri injeta __TAURI_INTERNALS__ no
// window do webview. Unico ponto de branching web/desktop do codebase —
// qualquer comportamento desktop-only deve passar por aqui.
export function isTauri(): boolean {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}
