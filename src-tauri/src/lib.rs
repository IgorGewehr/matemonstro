// Core Rust config-only (decisão de arquitetura 2026-07-04): zero comandos
// custom na v1. Toda a lógica vive no frontend; o Rust só registra os plugins
// oficiais — fs (vault de notas .md), dialog (escolher pasta do vault) e
// store (path do vault + flags, persistidos FORA do webview).
#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_store::Builder::default().build())
        .run(tauri::generate_context!())
        .expect("erro ao iniciar o Matemonstro");
}
