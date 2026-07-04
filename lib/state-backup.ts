// Backup do estado não-nota (progresso/SRS/settings — IndexedDB) em disco,
// SÓ no desktop: o IDB do webview é confiável mas não é sagrado (cleaners,
// corrupção rara). Snapshot diário de exportAll() em
// vault/.matemonstro/backups/state-YYYY-MM-DD.json, retém os 7 mais recentes.
// Restore manual via /config (importAll). Chamado do AppState no mount.

import { exportAll } from "./store";
import { isTauri } from "./platform";

const KEEP = 7;
const DIR = ".matemonstro/backups";

export async function maybeBackupState(): Promise<void> {
  if (!isTauri()) return;
  try {
    // Pede persistência do storage do webview (best-effort, uma vez por boot).
    await navigator.storage?.persist?.();

    const { writeVaultFile, listVaultFiles } = await import("./notes-repo-fs");
    const today = new Date().toISOString().slice(0, 10);
    const existing = (await listVaultFiles(DIR)).filter((f) => /^state-\d{4}-\d{2}-\d{2}\.json$/.test(f)).sort();
    if (existing.includes(`state-${today}.json`)) return; // já tem o de hoje

    await writeVaultFile(`${DIR}/state-${today}.json`, await exportAll());

    // Poda os antigos além dos KEEP mais recentes (remove via .trash não se
    // aplica a backups: são nossos, remoção direta é ok).
    const all = [...existing, `state-${today}.json`].sort();
    if (all.length > KEEP) {
      const { remove } = await import("@tauri-apps/plugin-fs");
      const { getVaultPath } = await import("./notes-repo-fs");
      const { join } = await import("@tauri-apps/api/path");
      const vault = await getVaultPath();
      for (const f of all.slice(0, all.length - KEEP)) {
        try {
          await remove(await join(vault, DIR, f));
        } catch {
          /* backup antigo travado não é fatal */
        }
      }
    }
  } catch (err) {
    console.warn("Backup de estado em disco falhou (não fatal)", err);
  }
}
