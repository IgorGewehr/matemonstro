// Build do alvo desktop (Tauri): valida + rebundla o currículo e roda o
// `next build` com BUILD_TARGET=desktop (output:"export" → out/).
//
// app/api/** contém route handlers com POST, que quebram `output:"export"`.
// A pasta é movida para FORA de app/ durante o build e restaurada em finally
// (mesmo em falha). Se .desktop-excluded-api já existir, um build anterior foi
// interrompido no meio — abortamos com instrução clara em vez de sobrescrever.
//
// POR QUE NÃO usar o hack de "placeholder RSC" (deixar as rotas de api com um
// GET vazio ou generateStaticParams fake): os params ficam BAKED no payload
// RSC dos HTML exportados — o shell hidrataria com dados errados (hydration
// mismatch silencioso). Mover a pasta é feio, mas honesto e reversível.
import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const apiDir = path.join(root, "app", "api");
const excludedDir = path.join(root, ".desktop-excluded-api");

if (fs.existsSync(excludedDir)) {
  console.error(
    "✗ .desktop-excluded-api já existe — um build desktop anterior foi interrompido.\n" +
      "  Restaure manualmente antes de continuar:  mv .desktop-excluded-api app/api"
  );
  process.exit(1);
}

const run = (cmd, env = {}) =>
  execSync(cmd, { stdio: "inherit", env: { ...process.env, ...env } });

run("npm run validate");
run("npm run bundle");

let moved = false;
try {
  fs.renameSync(apiDir, excludedDir);
  moved = true;
  run("next build", { BUILD_TARGET: "desktop" });
  console.log("\n✓ Export estático em out/ (alvo desktop)");
} finally {
  if (moved) fs.renameSync(excludedDir, apiDir);
}
