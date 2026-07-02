"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useAuth } from "./AuthProvider";
import { AuthError } from "@/lib/authClient";
import { passwordStrength } from "@/lib/password-strength";
import { useFocusTrap } from "@/lib/useFocusTrap";
import RecoveryCodesPanel from "./RecoveryCodesPanel";

type Mode = "login" | "signup" | "recover" | "codes";

// Dialog global de autenticacao. Abre via evento 'mm:open-auth' (disparado
// pelo AccountButton ou por qualquer outro componente) e opcionalmente aceita
// detail: { tab?: 'login' | 'signup' }.
export default function AuthDialog() {
  const { login, signup, recover } = useAuth();
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<Mode>("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [codes, setCodes] = useState<string[]>([]);
  const emailRef = useRef<HTMLInputElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);

  useFocusTrap(dialogRef, open);

  const close = useCallback(() => {
    setOpen(false);
    setEmail("");
    setPassword("");
    setCode("");
    setError(null);
    setInfo(null);
    setBusy(false);
    setCodes([]);
  }, []);

  useEffect(() => {
    const onOpen = (e: Event) => {
      const detail = (e as CustomEvent).detail as { tab?: "login" | "signup" } | undefined;
      setMode(detail?.tab === "signup" ? "signup" : "login");
      setError(null);
      setInfo(null);
      setEmail("");
      setPassword("");
      setCode("");
      setOpen(true);
    };
    window.addEventListener("mm:open-auth", onOpen as EventListener);
    return () => window.removeEventListener("mm:open-auth", onOpen as EventListener);
  }, []);

  useEffect(() => {
    if (open && mode !== "codes") requestAnimationFrame(() => emailRef.current?.focus());
  }, [open, mode]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      // na tela de codigos, Esc nao fecha por acidente — o botao confirma que salvou
      if (e.key === "Escape" && mode !== "codes") close();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, close, mode]);

  const strength = passwordStrength(password, email);
  const needsStrongPassword = mode === "signup" || mode === "recover";

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    setError(null);
    if (!email.trim() || !password) {
      setError(mode === "recover" ? "Preencha e-mail, código e a nova senha." : "Preencha e-mail e senha.");
      return;
    }
    if (needsStrongPassword && strength.score === 0) {
      setError(strength.hint ?? "Escolha uma senha mais forte.");
      return;
    }
    if (mode === "recover" && !code.trim()) {
      setError("Informe um dos seus códigos de recuperação.");
      return;
    }
    setBusy(true);
    try {
      if (mode === "signup") {
        const recoveryCodes = await signup(email.trim(), password);
        if (recoveryCodes?.length) {
          setCodes(recoveryCodes);
          setMode("codes");
          return; // não fecha: usuário precisa salvar os códigos
        }
        close();
      } else if (mode === "recover") {
        const left = await recover(email.trim(), code, password);
        setInfo(
          `Senha redefinida — você já está logado. Restam ${left} código(s) de recuperação; gere novos em Conta → Segurança.`
        );
        setMode("login");
        setPassword("");
        setCode("");
      } else {
        await login(email.trim(), password);
        close();
      }
    } catch (err) {
      setError(err instanceof AuthError ? err.message : "Nao foi possivel completar a acao. Tente novamente.");
    } finally {
      setBusy(false);
    }
  }

  if (!open) return null;

  // ---- Tela de códigos de recuperação (pós-cadastro, mostrados UMA vez) ----
  if (mode === "codes") {
    return (
      <div
        className="fixed inset-0 z-50 flex items-center justify-center px-4 bg-black/60 backdrop-blur-sm"
        role="dialog"
        aria-modal="true"
        aria-label="Códigos de recuperação"
      >
        <div ref={dialogRef} className="panel w-full max-w-md p-5 shadow-2xl">
          <h2 className="font-bold text-lg">Guarde seus códigos de recuperação</h2>
          <p className="text-sm text-[var(--color-mut)] mt-1">
            Sem e-mail de recuperação, <span className="text-[var(--color-txt)] font-semibold">estes códigos são o único
            jeito de recuperar sua conta</span> se você esquecer a senha. Eles aparecem só agora.
          </p>
          <RecoveryCodesPanel codes={codes} email={email.trim()} />
          <button className="btn btn-primary w-full mt-4" onClick={close}>
            Salvei meus códigos — continuar
          </button>
        </div>
      </div>
    );
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center px-4 bg-black/60 backdrop-blur-sm"
      onMouseDown={close}
      role="dialog"
      aria-modal="true"
      aria-label="Entrar ou criar conta"
    >
      <div
        ref={dialogRef}
        className="panel w-full max-w-sm p-5 shadow-2xl"
        onMouseDown={(e) => e.stopPropagation()}
      >
        {mode !== "recover" ? (
          <div className="flex items-center gap-2 mb-4">
            {(
              [
                ["login", "Entrar"],
                ["signup", "Criar conta"],
              ] as [Mode, string][]
            ).map(([m, label]) => (
              <button
                key={m}
                type="button"
                onClick={() => {
                  setMode(m);
                  setError(null);
                }}
                className={`flex-1 rounded-xl px-3 py-2 text-sm font-semibold transition-colors ${
                  mode === m
                    ? "bg-[var(--color-raise)] text-[var(--color-txt)]"
                    : "text-[var(--color-mut)] hover:text-[var(--color-txt)]"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        ) : (
          <div className="mb-4">
            <h2 className="font-bold">Recuperar acesso</h2>
            <p className="text-xs text-[var(--color-mut)] mt-1">
              Use um dos códigos de recuperação que você salvou ao criar a conta.
            </p>
          </div>
        )}

        <form onSubmit={onSubmit} className="grid gap-3">
          <label className="grid gap-1">
            <span className="text-xs text-[var(--color-mut)]">E-mail</span>
            <input
              ref={emailRef}
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="email"
              placeholder="voce@exemplo.com"
              className="rounded-xl border border-[var(--color-line)] bg-[var(--color-well)] px-3 py-2 text-sm outline-none focus:border-[var(--color-brand)]"
            />
          </label>

          {mode === "recover" && (
            <label className="grid gap-1">
              <span className="text-xs text-[var(--color-mut)]">Código de recuperação</span>
              <input
                value={code}
                onChange={(e) => setCode(e.target.value)}
                autoComplete="one-time-code"
                placeholder="XXXX-XXXX"
                className="rounded-xl border border-[var(--color-line)] bg-[var(--color-well)] px-3 py-2 text-sm font-mono outline-none focus:border-[var(--color-brand)]"
              />
            </label>
          )}

          <label className="grid gap-1">
            <span className="text-xs text-[var(--color-mut)]">{mode === "recover" ? "Nova senha" : "Senha"}</span>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete={mode === "login" ? "current-password" : "new-password"}
              placeholder={mode === "login" ? "Sua senha" : "Mínimo 8 caracteres"}
              className="rounded-xl border border-[var(--color-line)] bg-[var(--color-well)] px-3 py-2 text-sm outline-none focus:border-[var(--color-brand)]"
            />
          </label>

          {needsStrongPassword && password.length > 0 && (
            <div aria-live="polite">
              <div className="flex gap-1 mb-1">
                {[0, 1, 2].map((i) => (
                  <span
                    key={i}
                    className="h-1 flex-1 rounded-full"
                    style={{ background: i < strength.score ? strength.color : "var(--color-raise)" }}
                  />
                ))}
              </div>
              <span className="text-[11px]" style={{ color: strength.color }}>
                {strength.label}
                {strength.hint ? ` — ${strength.hint}` : ""}
              </span>
            </div>
          )}

          {error && <div className="text-xs text-[#ff6b6b]">{error}</div>}
          {info && <div className="text-xs text-[var(--color-brand2)]">{info}</div>}

          <button type="submit" disabled={busy} className="btn btn-primary mt-1 disabled:opacity-60">
            {busy ? "Aguarde…" : mode === "signup" ? "Criar conta" : mode === "recover" ? "Redefinir senha" : "Entrar"}
          </button>
        </form>

        {mode === "login" && (
          <button
            type="button"
            onClick={() => {
              setMode("recover");
              setError(null);
              setInfo(null);
            }}
            className="mt-3 w-full text-center text-xs text-[var(--color-mut)] hover:text-[var(--color-brand)]"
          >
            Esqueci a senha — usar código de recuperação
          </button>
        )}
        {mode === "recover" && (
          <button
            type="button"
            onClick={() => {
              setMode("login");
              setError(null);
            }}
            className="mt-3 w-full text-center text-xs text-[var(--color-mut)] hover:text-[var(--color-brand)]"
          >
            ← Voltar para o login
          </button>
        )}

        <div className="mt-3 text-[11px] text-[var(--color-mut)] text-center leading-relaxed">
          Seus dados locais continuam salvos neste dispositivo mesmo sem conta.
        </div>
      </div>
    </div>
  );
}
