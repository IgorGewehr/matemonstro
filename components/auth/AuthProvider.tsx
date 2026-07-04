"use client";

import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import type { AuthUser } from "@/lib/authClient";
import * as authClient from "@/lib/authClient";
import { isTauri } from "@/lib/platform";

interface AuthCtx {
  user: AuthUser | null;
  ready: boolean;
  /** Devolve os códigos de recuperação (mostrados UMA vez) gerados no cadastro. */
  signup: (email: string, password: string) => Promise<string[] | undefined>;
  login: (email: string, password: string) => Promise<void>;
  /** Reset de senha via código de recuperação (loga automaticamente). */
  recover: (email: string, code: string, newPassword: string) => Promise<number>;
  logout: () => Promise<void>;
  refresh: () => Promise<void>;
}

const Ctx = createContext<AuthCtx | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [ready, setReady] = useState(false);

  const refresh = useCallback(async () => {
    if (isTauri()) return; // desktop v1: 100% deslogado, sem chamadas de auth
    try {
      const { user: u } = await authClient.me();
      setUser(u);
    } catch {
      setUser(null);
    }
  }, []);

  useEffect(() => {
    // Desktop (Tauri): nao existe servidor de auth — o app e local-first e
    // 100% deslogado na v1. user=null tambem mata todo o codigo de sync
    // (AppState/NotesProvider) sem precisar de guards espalhados.
    if (isTauri()) {
      setUser(null);
      setReady(true);
      return;
    }
    let alive = true;
    authClient
      .me()
      .then(({ user: u }) => {
        if (!alive) return;
        setUser(u);
      })
      .catch(() => {
        if (!alive) return;
        setUser(null);
      })
      .finally(() => {
        if (alive) setReady(true);
      });
    return () => {
      alive = false;
    };
  }, []);

  const signup = useCallback(async (email: string, password: string) => {
    const { user: u, recoveryCodes } = await authClient.signup(email, password);
    setUser(u);
    return recoveryCodes;
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    const { user: u } = await authClient.login(email, password);
    setUser(u);
  }, []);

  const recover = useCallback(async (email: string, code: string, newPassword: string) => {
    const { user: u, codesLeft } = await authClient.recover(email, code, newPassword);
    setUser(u);
    return codesLeft;
  }, []);

  const logout = useCallback(async () => {
    await authClient.logout();
    setUser(null);
  }, []);

  const value = useMemo<AuthCtx>(
    () => ({ user, ready, signup, login, recover, logout, refresh }),
    [user, ready, signup, login, recover, logout, refresh]
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAuth(): AuthCtx {
  const c = useContext(Ctx);
  if (!c) throw new Error("useAuth deve ser usado dentro de <AuthProvider>");
  return c;
}
