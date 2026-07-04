"use client";

import { useState } from "react";
import Link from "next/link";
import { useAuth } from "./AuthProvider";

// Botao de conta para a Nav: mostra o e-mail + "Sair" quando logado, ou um
// atalho para abrir o AuthDialog quando deslogado. Nunca renderiza dados
// sensiveis (apenas o e-mail do proprio usuario).
export default function AccountButton({ compact = false }: { compact?: boolean }) {
  const { user, ready, logout } = useAuth();
  const [busy, setBusy] = useState(false);

  function openAuth(tab: "login" | "signup" = "login") {
    window.dispatchEvent(new CustomEvent("mm:open-auth", { detail: { tab } }));
  }

  async function onLogout() {
    if (busy) return;
    setBusy(true);
    try {
      await logout();
    } finally {
      setBusy(false);
    }
  }

  if (!ready) {
    return (
      <div className={`flex items-center gap-3 rounded-xl px-3 py-2 text-sm text-[var(--color-mut)] ${compact ? "md:justify-center md:px-0" : ""}`}>
        <span className="w-5 text-center" aria-hidden="true">
          ○
        </span>
        {!compact && <span>Carregando…</span>}
      </div>
    );
  }

  if (user) {
    if (compact) {
      return (
        <Link
          href="/conta"
          className="hidden md:flex items-center justify-center rounded-xl py-2 text-sm text-[var(--color-brand2)] hover:text-[var(--color-txt)] transition-colors"
          title={`${user.email} — conta & segurança`}
          aria-label="Conta e segurança"
        >
          <span aria-hidden="true">●</span>
        </Link>
      );
    }
    return (
      <div className="flex items-center gap-2 rounded-xl px-3 py-2 text-sm text-[var(--color-txt3)]">
        <Link
          href="/conta"
          className="flex items-center gap-2 min-w-0 flex-1 hover:text-[var(--color-txt)] transition-colors"
          title={`${user.email} — conta & segurança`}
        >
          <span className="w-5 text-center text-[var(--color-brand2)]" aria-hidden="true">
            ●
          </span>
          <span className="min-w-0 flex-1 truncate">{user.email}</span>
        </Link>
        <button
          type="button"
          onClick={onLogout}
          disabled={busy}
          className="shrink-0 text-xs text-[var(--color-mut)] hover:text-[var(--color-txt)] transition-colors disabled:opacity-60"
        >
          Sair
        </button>
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={() => openAuth("login")}
      title={compact ? "Entrar / Criar conta" : undefined}
      className={`flex items-center gap-3 rounded-xl px-3 py-2 text-sm text-[var(--color-txt3)] border border-[var(--color-line)] bg-[var(--color-well)] hover:border-[var(--color-line2)] hover:text-[var(--color-txt)] transition-colors w-full ${compact ? "md:justify-center md:px-0" : ""}`}
    >
      <span className="text-[var(--color-mut)]" aria-hidden="true">
        ◇
      </span>
      {!compact && <span>Entrar / Criar conta</span>}
    </button>
  );
}
