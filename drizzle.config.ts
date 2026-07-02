import { defineConfig } from "drizzle-kit";

// Config opcional para gerar migrations com `drizzle-kit generate` / inspecionar
// com `drizzle-kit studio`. O app em si NAO depende de migrations geradas: o
// schema e criado idempotentemente em runtime por lib/server/db/migrate.ts.
export default defineConfig({
  schema: "./lib/server/db/schema.ts",
  out: "./lib/server/db/migrations",
  dialect: "sqlite",
  dbCredentials: {
    url: process.env.DB_PATH || "./.data/matemonstro.db",
  },
});
