// Cliente HTTP fino para as rotas /api/auth/*.
// Nunca usado no servidor; apenas helpers de fetch para o AuthProvider.

export interface AuthUser {
  id: string;
  email: string;
}

export class AuthError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

async function parseJson(res: Response): Promise<any> {
  try {
    return await res.json();
  } catch {
    return {};
  }
}

function friendlyError(status: number, raw?: string): string {
  if (status === 409) return "Ja existe uma conta com esse e-mail.";
  if (status === 401) return "E-mail ou senha invalidos.";
  if (status === 400) return raw || "Dados invalidos. Confira e tente novamente.";
  return raw || "Nao foi possivel completar a acao. Tente novamente.";
}

async function post(url: string, body: unknown): Promise<any> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "same-origin",
    body: JSON.stringify(body),
  });
  const data = await parseJson(res);
  if (!res.ok) {
    throw new AuthError(friendlyError(res.status, data?.error), res.status);
  }
  return data;
}

export async function signup(
  email: string,
  password: string
): Promise<{ user: AuthUser; recoveryCodes?: string[] }> {
  return post("/api/auth/signup", { email, password });
}

export async function login(email: string, password: string): Promise<{ user: AuthUser }> {
  return post("/api/auth/login", { email, password });
}

export async function logout(): Promise<{ ok: boolean }> {
  return post("/api/auth/logout", {});
}

export async function me(): Promise<{ user: AuthUser | null }> {
  const res = await fetch("/api/auth/me", { credentials: "same-origin" });
  if (!res.ok) return { user: null };
  const data = await parseJson(res);
  return { user: data?.user ?? null };
}

// ---- Conta & segurança ----

export async function recover(
  email: string,
  code: string,
  newPassword: string
): Promise<{ user: AuthUser; codesLeft: number }> {
  return post("/api/auth/recover", { email, code, newPassword });
}

export async function changePassword(current: string, next: string): Promise<{ ok: boolean }> {
  return post("/api/auth/change-password", { current, next });
}

export async function regenerateRecoveryCodes(password: string): Promise<{ recoveryCodes: string[] }> {
  return post("/api/auth/recovery-codes", { password });
}

export async function getRecoveryCodesLeft(): Promise<number> {
  const res = await fetch("/api/auth/recovery-codes", { credentials: "same-origin" });
  if (!res.ok) return 0;
  const data = await parseJson(res);
  return typeof data?.codesLeft === "number" ? data.codesLeft : 0;
}

export interface SessionInfo {
  idPrefix: string;
  createdAt: number;
  lastUsedAt: number | null;
  userAgent: string | null;
  current: boolean;
}

export async function listSessions(): Promise<SessionInfo[]> {
  const res = await fetch("/api/auth/sessions", { credentials: "same-origin" });
  if (!res.ok) return [];
  const data = await parseJson(res);
  return Array.isArray(data?.sessions) ? data.sessions : [];
}

export async function revokeSession(idPrefix: string): Promise<{ ok: boolean }> {
  return post("/api/auth/sessions", { idPrefix });
}

export async function revokeOtherSessions(): Promise<{ ok: boolean }> {
  return post("/api/auth/sessions", { others: true });
}

export async function deleteAccount(password: string): Promise<{ ok: boolean }> {
  return post("/api/auth/delete-account", { password });
}
