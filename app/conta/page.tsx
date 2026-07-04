"use client";

// Página de conta & segurança: senha, códigos de recuperação, sessões ativas
// e zona de perigo. Tudo exige a senha atual para ações sensíveis.

import Link from "next/link";
import { useEffect, useState } from "react";
import { useAuth } from "@/components/auth/AuthProvider";
import RecoveryCodesPanel from "@/components/auth/RecoveryCodesPanel";
import { passwordStrength } from "@/lib/password-strength";
import {
  AuthError,
  changePassword,
  deleteAccount,
  getRecoveryCodesLeft,
  listSessions,
  regenerateRecoveryCodes,
  revokeOtherSessions,
  revokeSession,
  type SessionInfo,
} from "@/lib/authClient";

function deviceLabel(ua: string | null): string {
  if (!ua) return "Dispositivo desconhecido";
  const os = /iphone|ipad/i.test(ua)
    ? "iOS"
    : /android/i.test(ua)
      ? "Android"
      : /mac os x|macintosh/i.test(ua)
        ? "macOS"
        : /windows/i.test(ua)
          ? "Windows"
          : /linux/i.test(ua)
            ? "Linux"
            : "—";
  const browser = /edg\//i.test(ua)
    ? "Edge"
    : /firefox/i.test(ua)
      ? "Firefox"
      : /chrome|crios/i.test(ua)
        ? "Chrome"
        : /safari/i.test(ua)
          ? "Safari"
          : "Navegador";
  return `${browser} · ${os}`;
}

function ago(ts: number | null): string {
  if (!ts) return "—";
  const min = Math.floor((Date.now() - ts) / 60000);
  if (min < 1) return "agora";
  if (min < 60) return `há ${min} min`;
  const h = Math.floor(min / 60);
  if (h < 24) return `há ${h}h`;
  return `há ${Math.floor(h / 24)} dia(s)`;
}

export default function ContaPage() {
  const { user, ready, logout } = useAuth();

  const [sessions, setSessions] = useState<SessionInfo[]>([]);
  const [codesLeft, setCodesLeft] = useState<number | null>(null);
  const [msg, setMsg] = useState<{ kind: "ok" | "err"; text: string } | null>(null);

  // alterar senha
  const [curPass, setCurPass] = useState("");
  const [newPass, setNewPass] = useState("");
  const [busyPass, setBusyPass] = useState(false);

  // regenerar códigos
  const [regenPass, setRegenPass] = useState("");
  const [newCodes, setNewCodes] = useState<string[] | null>(null);
  const [busyCodes, setBusyCodes] = useState(false);

  // excluir conta
  const [delPass, setDelPass] = useState("");
  const [busyDel, setBusyDel] = useState(false);

  const strength = passwordStrength(newPass, user?.email);

  async function reload() {
    const [s, c] = await Promise.all([listSessions(), getRecoveryCodesLeft()]);
    setSessions(s);
    setCodesLeft(c);
  }

  useEffect(() => {
    if (ready && user) reload().catch(() => {});
  }, [ready, user?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!ready) return <div className="text-[var(--color-mut)]">Carregando…</div>;

  if (!user) {
    return (
      <div className="max-w-md mx-auto panel p-8 text-center mt-10 mm-enter">
        <div className="text-4xl mb-3">●</div>
        <h1 className="text-lg font-bold">Você não está logado</h1>
        <p className="text-sm text-[var(--color-mut)] mt-2 mb-4">
          Crie uma conta para sincronizar seu progresso e notas entre dispositivos — os dados deste aparelho
          continuam seus, com ou sem conta.
        </p>
        <button
          className="btn btn-primary"
          onClick={() => window.dispatchEvent(new CustomEvent("mm:open-auth", { detail: { tab: "login" } }))}
        >
          Entrar / Criar conta
        </button>
      </div>
    );
  }

  function fail(err: unknown) {
    setMsg({ kind: "err", text: err instanceof AuthError ? err.message : "Não deu certo. Tente novamente." });
  }

  async function onChangePassword(e: React.FormEvent) {
    e.preventDefault();
    if (busyPass) return;
    setMsg(null);
    if (strength.score === 0) {
      setMsg({ kind: "err", text: strength.hint ?? "Escolha uma senha mais forte." });
      return;
    }
    setBusyPass(true);
    try {
      await changePassword(curPass, newPass);
      setCurPass("");
      setNewPass("");
      setMsg({ kind: "ok", text: "Senha alterada. As outras sessões foram desconectadas." });
      await reload();
    } catch (err) {
      fail(err);
    } finally {
      setBusyPass(false);
    }
  }

  async function onRegenCodes(e: React.FormEvent) {
    e.preventDefault();
    if (busyCodes) return;
    setMsg(null);
    setBusyCodes(true);
    try {
      const { recoveryCodes } = await regenerateRecoveryCodes(regenPass);
      setNewCodes(recoveryCodes);
      setRegenPass("");
      setCodesLeft(recoveryCodes.length);
    } catch (err) {
      fail(err);
    } finally {
      setBusyCodes(false);
    }
  }

  async function onRevoke(idPrefix: string) {
    setMsg(null);
    try {
      await revokeSession(idPrefix);
      await reload();
    } catch (err) {
      fail(err);
    }
  }

  async function onRevokeOthers() {
    setMsg(null);
    try {
      await revokeOtherSessions();
      await reload();
      setMsg({ kind: "ok", text: "Todas as outras sessões foram desconectadas." });
    } catch (err) {
      fail(err);
    }
  }

  async function onDelete(e: React.FormEvent) {
    e.preventDefault();
    if (busyDel) return;
    if (!window.confirm("Excluir a conta apaga TODOS os seus dados do servidor. Os dados locais deste aparelho continuam. Confirmar?")) {
      return;
    }
    setBusyDel(true);
    setMsg(null);
    try {
      await deleteAccount(delPass);
      await logout().catch(() => {});
      window.location.href = "/";
    } catch (err) {
      fail(err);
      setBusyDel(false);
    }
  }

  const inputCls =
    "rounded-xl border border-[var(--color-line)] bg-[var(--color-well)] px-3 py-2 text-sm outline-none focus:border-[var(--color-brand)] w-full";

  return (
    <div className="max-w-2xl mx-auto space-y-5 pb-10 mm-enter">
      <header>
        <h1 className="text-2xl md:text-3xl font-extrabold tracking-tight">● Conta & segurança</h1>
        <p className="text-[var(--color-mut)] text-sm mt-1">
          {user.email} · seus dados de estudo vivem primeiro neste aparelho; a conta existe para sincronizar e
          proteger.
        </p>
      </header>

      {msg && (
        <div
          role="status"
          className="panel p-3 text-sm"
          style={{ color: msg.kind === "ok" ? "var(--color-brand2)" : "#ff6b6b" }}
        >
          {msg.text}
        </div>
      )}

      {/* Alterar senha */}
      <section className="panel p-5">
        <h2 className="font-bold mb-1 text-sm">Alterar senha</h2>
        <p className="text-xs text-[var(--color-mut)] mb-3">Ao trocar, todas as outras sessões são desconectadas.</p>
        <form onSubmit={onChangePassword} className="grid sm:grid-cols-2 gap-3">
          <input
            type="password"
            value={curPass}
            onChange={(e) => setCurPass(e.target.value)}
            placeholder="Senha atual"
            autoComplete="current-password"
            className={inputCls}
          />
          <input
            type="password"
            value={newPass}
            onChange={(e) => setNewPass(e.target.value)}
            placeholder="Nova senha (mín. 8)"
            autoComplete="new-password"
            className={inputCls}
          />
          {newPass.length > 0 && (
            <div className="sm:col-span-2 -mt-1" aria-live="polite">
              <span className="text-[11px]" style={{ color: strength.color }}>
                força: {strength.label}
                {strength.hint ? ` — ${strength.hint}` : ""}
              </span>
            </div>
          )}
          <button
            type="submit"
            disabled={busyPass || !curPass || !newPass}
            className="btn btn-primary sm:col-span-2 disabled:opacity-60"
          >
            {busyPass ? "Alterando…" : "Alterar senha"}
          </button>
        </form>
      </section>

      {/* Códigos de recuperação */}
      <section className="panel p-5">
        <h2 className="font-bold mb-1 text-sm">Códigos de recuperação</h2>
        <p className="text-xs text-[var(--color-mut)] mb-3">
          {codesLeft === null ? "…" : `${codesLeft} código(s) restante(s).`} São o único jeito de recuperar a conta
          se você esquecer a senha — cada um funciona uma vez. Gerar novos invalida os antigos.
        </p>
        {newCodes ? (
          <>
            <RecoveryCodesPanel codes={newCodes} email={user.email} />
            <button className="btn w-full mt-3 text-sm" onClick={() => setNewCodes(null)}>
              Salvei os novos códigos
            </button>
          </>
        ) : (
          <form onSubmit={onRegenCodes} className="flex gap-2">
            <input
              type="password"
              value={regenPass}
              onChange={(e) => setRegenPass(e.target.value)}
              placeholder="Confirme sua senha"
              autoComplete="current-password"
              className={inputCls}
            />
            <button type="submit" disabled={busyCodes || !regenPass} className="btn whitespace-nowrap disabled:opacity-60">
              {busyCodes ? "Gerando…" : "Gerar novos"}
            </button>
          </form>
        )}
      </section>

      {/* Sessões ativas */}
      <section className="panel p-5">
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-bold text-sm">Sessões ativas</h2>
          {sessions.length > 1 && (
            <button className="btn !py-1 text-xs" onClick={onRevokeOthers}>
              Desconectar as outras
            </button>
          )}
        </div>
        <div className="space-y-2 mm-stagger">
          {sessions.map((s) => (
            <div key={s.idPrefix} className="flex items-center gap-3 text-sm">
              <span aria-hidden="true" className={s.current ? "text-[var(--color-brand2)]" : "text-[var(--color-mut)]"}>
                ●
              </span>
              <div className="flex-1 min-w-0">
                <div className="truncate">
                  {deviceLabel(s.userAgent)}
                  {s.current && <span className="chip !py-0 !px-1.5 ml-2 text-[10px]">esta sessão</span>}
                </div>
                <div className="text-[11px] text-[var(--color-mut)]">
                  último uso {ago(s.lastUsedAt)} · criada em{" "}
                  {new Date(s.createdAt).toLocaleDateString("pt-BR", { day: "2-digit", month: "short" })}
                </div>
              </div>
              {!s.current && (
                <button
                  className="text-xs text-[var(--color-mut)] hover:text-[#ff6b6b]"
                  onClick={() => onRevoke(s.idPrefix)}
                >
                  desconectar
                </button>
              )}
            </div>
          ))}
          {sessions.length === 0 && <p className="text-xs text-[var(--color-mut)]">Carregando sessões…</p>}
        </div>
      </section>

      {/* Backup */}
      <section className="panel p-5">
        <h2 className="font-bold mb-1 text-sm">Seus dados</h2>
        <p className="text-xs text-[var(--color-mut)]">
          Backup completo (progresso, revisões, notas) em <Link href="/config" className="text-[var(--color-brand)]">Ajustes</Link>;
          vault das notas em <Link href="/notas" className="text-[var(--color-brand)]">Notas → Vault (.zip)</Link>.
        </p>
      </section>

      {/* Zona de perigo */}
      <section className="panel p-5" style={{ borderColor: "#ff6b6b44" }}>
        <h2 className="font-bold mb-1 text-sm text-[#ff6b6b]">Excluir conta</h2>
        <p className="text-xs text-[var(--color-mut)] mb-3">
          Apaga todos os seus dados do servidor (progresso sincronizado, notas, sessões). Os dados locais deste
          aparelho não são tocados. Não dá pra desfazer.
        </p>
        <form onSubmit={onDelete} className="flex gap-2">
          <input
            type="password"
            value={delPass}
            onChange={(e) => setDelPass(e.target.value)}
            placeholder="Confirme sua senha"
            autoComplete="current-password"
            className={inputCls}
          />
          <button
            type="submit"
            disabled={busyDel || !delPass}
            className="btn whitespace-nowrap !border-[#ff6b6b55] !text-[#ff6b6b] disabled:opacity-60"
          >
            {busyDel ? "Excluindo…" : "Excluir conta"}
          </button>
        </form>
      </section>
    </div>
  );
}
