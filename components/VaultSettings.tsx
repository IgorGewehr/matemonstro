"use client";

// Seção "Vault e backups" de /config — SÓ desktop (Tauri). Mostra a pasta do
// vault de notas (.md estilo Obsidian), permite trocá-la (dialog nativo; a
// pasta escolhida entra no fs-scope automaticamente no Tauri 2) e restaurar
// snapshots diários do estado gravados em vault/.matemonstro/backups/.

import { useEffect, useState } from "react";
import { isTauri } from "@/lib/platform";
import { useApp } from "@/components/AppState";

export default function VaultSettings() {
  const { importData } = useApp();
  const [vaultPath, setVaultPathState] = useState<string>("");
  const [backups, setBackups] = useState<string[]>([]);
  const [msg, setMsg] = useState<string>("");

  useEffect(() => {
    if (!isTauri()) return;
    (async () => {
      const repo = await import("@/lib/notes-repo-fs");
      setVaultPathState(await repo.getVaultPath());
      const files = await repo.listVaultFiles(".matemonstro/backups");
      setBackups(files.filter((f) => /^state-\d{4}-\d{2}-\d{2}\.json$/.test(f)).sort().reverse());
    })().catch((e) => console.warn("VaultSettings", e));
  }, []);

  if (!isTauri()) return null;

  async function changeFolder() {
    try {
      const { open } = await import("@tauri-apps/plugin-dialog");
      const dir = await open({ directory: true, title: "Escolher pasta do vault" });
      if (typeof dir !== "string" || !dir) return;
      const repo = await import("@/lib/notes-repo-fs");
      await repo.setVaultPath(dir);
      setMsg("Vault movido. Recarregando…");
      window.location.reload();
    } catch (e) {
      setMsg("Não foi possível trocar a pasta do vault.");
      console.error(e);
    }
  }

  async function restore(file: string) {
    if (!window.confirm(`Restaurar o backup ${file}? O estado atual será substituído.`)) return;
    try {
      const repo = await import("@/lib/notes-repo-fs");
      const json = await repo.readVaultFile(`.matemonstro/backups/${file}`);
      await importData(json);
      setMsg("Backup restaurado. Recarregando…");
      window.location.reload();
    } catch (e) {
      setMsg("Falha ao restaurar o backup.");
      console.error(e);
    }
  }

  return (
    <section className="panel p-5 space-y-3">
      <h2 className="font-bold">Vault e backups (desktop)</h2>
      <p className="text-xs text-[var(--color-mut)]">
        Suas notas são arquivos <code>.md</code> reais nesta pasta — abra-a no Obsidian se quiser.
        O progresso ganha um snapshot diário em <code>.matemonstro/backups/</code>.
      </p>
      <div className="text-xs font-mono break-all bg-[var(--color-well)] rounded-lg p-2 border border-[var(--color-line)]">
        {vaultPath || "…"}
      </div>
      <div className="flex gap-2 flex-wrap">
        <button className="btn" onClick={changeFolder}>
          Trocar pasta
        </button>
      </div>
      {backups.length > 0 && (
        <div className="space-y-1 mm-stagger">
          <div className="text-xs uppercase tracking-wide text-[var(--color-mut)]">
            Snapshots do progresso
          </div>
          {backups.map((f) => (
            <div key={f} className="flex items-center justify-between text-xs gap-2">
              <span className="font-mono">{f}</span>
              <button className="btn !px-2 !py-1" onClick={() => restore(f)}>
                Restaurar
              </button>
            </div>
          ))}
        </div>
      )}
      {msg && (
        <div className="chip" role="status" aria-live="polite">
          {msg}
        </div>
      )}
    </section>
  );
}
