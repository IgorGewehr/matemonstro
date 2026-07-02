import "server-only";

import { randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import { and, eq, ne } from "drizzle-orm";

import { getDb } from "./db/client";
import { sessions, users } from "./db/schema";

/** Nome do cookie de sessao. */
export const SESSION_COOKIE = "mm_session";

/** 30 dias, em ms. */
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;
/** Renova a sessao quando faltar menos que isto (expiracao deslizante). */
const SLIDING_THRESHOLD_MS = 15 * 24 * 60 * 60 * 1000;
/** Atualiza last_used_at no maximo 1x/hora (evita write em toda request). */
const LAST_USED_GRANULARITY_MS = 60 * 60 * 1000;

export interface SessionUser {
  id: string;
  email: string;
}

async function setSessionCookie(token: string, expiresAt: number) {
  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    // secure:true fixo impediria o cookie em http://localhost (dev sem HTTPS).
    secure: process.env.NODE_ENV === "production",
    path: "/",
    expires: new Date(expiresAt),
  });
}

/**
 * Cria uma sessao para o usuario, grava no banco e seta o cookie httpOnly.
 * Retorna o token gerado (tambem e o id da linha em `sessions`).
 */
export async function createSession(userId: string, userAgent?: string | null): Promise<string> {
  const token = randomBytes(32).toString("hex");
  const now = Date.now();
  const expiresAt = now + SESSION_TTL_MS;

  getDb()
    .insert(sessions)
    .values({
      id: token,
      userId,
      expiresAt,
      createdAt: now,
      lastUsedAt: now,
      userAgent: userAgent?.slice(0, 300) ?? null,
    })
    .run();

  await setSessionCookie(token, expiresAt);
  return token;
}

/**
 * Le o cookie de sessao, valida contra o banco (existencia + expiracao) e
 * retorna o usuario correspondente, ou null se nao houver sessao valida.
 * Efeitos colaterais: marca last_used_at (1x/hora) e desliza a expiracao
 * quando esta na segunda metade da vida.
 */
export async function getSessionUser(): Promise<SessionUser | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value;
  if (!token) return null;

  const row = getDb()
    .select({
      sessionId: sessions.id,
      expiresAt: sessions.expiresAt,
      lastUsedAt: sessions.lastUsedAt,
      userId: users.id,
      email: users.email,
    })
    .from(sessions)
    .innerJoin(users, eq(sessions.userId, users.id))
    .where(eq(sessions.id, token))
    .get();

  if (!row) return null;
  const now = Date.now();
  if (row.expiresAt < now) {
    // Sessao expirada: limpa e trata como deslogado.
    getDb().delete(sessions).where(eq(sessions.id, token)).run();
    return null;
  }

  const patch: Partial<{ lastUsedAt: number; expiresAt: number }> = {};
  if (!row.lastUsedAt || now - row.lastUsedAt > LAST_USED_GRANULARITY_MS) patch.lastUsedAt = now;
  if (row.expiresAt - now < SLIDING_THRESHOLD_MS) patch.expiresAt = now + SESSION_TTL_MS;
  if (Object.keys(patch).length) {
    getDb().update(sessions).set(patch).where(eq(sessions.id, token)).run();
    if (patch.expiresAt) {
      // cookies().set so funciona em route handlers/actions — best effort.
      try {
        await setSessionCookie(token, patch.expiresAt);
      } catch {
        // contexto sem permissao de escrita de cookie: o banco ja deslizou
      }
    }
  }

  return { id: row.userId, email: row.email };
}

/** Token da sessao atual (para marcar "esta sessao" na lista). */
export async function currentSessionToken(): Promise<string | null> {
  const cookieStore = await cookies();
  return cookieStore.get(SESSION_COOKIE)?.value ?? null;
}

/**
 * Destroi a sessao atual: remove a linha do banco e limpa o cookie.
 */
export async function destroySession(): Promise<void> {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value;

  if (token) {
    getDb().delete(sessions).where(eq(sessions.id, token)).run();
  }

  cookieStore.delete(SESSION_COOKIE);
}

/** Revoga TODAS as sessoes do usuario (reset de senha / seguranca). */
export function destroyAllSessions(userId: string): void {
  getDb().delete(sessions).where(eq(sessions.userId, userId)).run();
}

/** Revoga todas as sessoes do usuario EXCETO a atual (troca de senha). */
export function destroyOtherSessions(userId: string, keepToken: string): void {
  getDb()
    .delete(sessions)
    .where(and(eq(sessions.userId, userId), ne(sessions.id, keepToken)))
    .run();
}

export interface SessionInfo {
  /** Prefixo do token (nunca o token inteiro). */
  idPrefix: string;
  createdAt: number;
  lastUsedAt: number | null;
  userAgent: string | null;
  current: boolean;
}

/** Lista as sessoes ativas do usuario (token nunca sai inteiro). */
export function listSessions(userId: string, currentToken: string | null): SessionInfo[] {
  const rows = getDb()
    .select({
      id: sessions.id,
      createdAt: sessions.createdAt,
      lastUsedAt: sessions.lastUsedAt,
      userAgent: sessions.userAgent,
    })
    .from(sessions)
    .where(eq(sessions.userId, userId))
    .all();
  return rows
    .map((r) => ({
      idPrefix: r.id.slice(0, 8),
      createdAt: r.createdAt,
      lastUsedAt: r.lastUsedAt ?? null,
      userAgent: r.userAgent ?? null,
      current: r.id === currentToken,
    }))
    .sort((a, b) => (b.lastUsedAt ?? b.createdAt) - (a.lastUsedAt ?? a.createdAt));
}

/** Revoga uma sessao especifica pelo prefixo (da lista de sessoes ativas). */
export function revokeSessionByPrefix(userId: string, idPrefix: string): boolean {
  if (!idPrefix || idPrefix.length < 8) return false;
  const rows = getDb()
    .select({ id: sessions.id })
    .from(sessions)
    .where(eq(sessions.userId, userId))
    .all();
  const target = rows.find((r) => r.id.startsWith(idPrefix));
  if (!target) return false;
  getDb().delete(sessions).where(eq(sessions.id, target.id)).run();
  return true;
}

/**
 * Anti-CSRF alem do sameSite=lax: em rotas mutantes, se o header Origin (ou
 * Referer) estiver presente, o host precisa bater com o host da request.
 * Retorna true se a request e aceitavel.
 */
export function sameOriginOk(request: Request): boolean {
  const host = request.headers.get("host");
  if (!host) return true;
  const check = (value: string | null): boolean | null => {
    if (!value) return null;
    try {
      return new URL(value).host === host;
    } catch {
      return false;
    }
  };
  const originOk = check(request.headers.get("origin"));
  if (originOk !== null) return originOk;
  const refererOk = check(request.headers.get("referer"));
  if (refererOk !== null) return refererOk;
  return true; // sem Origin/Referer (clientes nao-navegador): sameSite cobre
}