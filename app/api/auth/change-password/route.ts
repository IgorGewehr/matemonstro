import "server-only";

// Troca de senha (logado): exige a senha atual e revoga as OUTRAS sessoes.

import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";

import { getDb } from "@/lib/server/db/client";
import { users } from "@/lib/server/db/schema";
import {
  hashPassword,
  isValidPassword,
  passwordStrengthError,
  verifyPassword,
} from "@/lib/server/auth";
import {
  getSessionUser,
  currentSessionToken,
  destroyOtherSessions,
  sameOriginOk,
} from "@/lib/server/session";
import { rateLimit, clientIp } from "@/lib/server/rate-limit";

export const runtime = "nodejs";

export async function POST(request: Request) {
  if (!sameOriginOk(request)) {
    return NextResponse.json({ error: "origem invalida" }, { status: 403 });
  }
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  if (!rateLimit(`chpass:${clientIp(request)}:${user.id}`, 10, 15 * 60_000)) {
    return NextResponse.json({ error: "Muitas tentativas. Aguarde." }, { status: 429 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "JSON invalido." }, { status: 400 });
  }
  const { current, next } = (body ?? {}) as { current?: unknown; next?: unknown };

  if (typeof current !== "string" || !isValidPassword(next)) {
    return NextResponse.json({ error: "A nova senha precisa ter pelo menos 8 caracteres." }, { status: 400 });
  }
  const weak = passwordStrengthError(next, user.email);
  if (weak) {
    return NextResponse.json({ error: weak }, { status: 400 });
  }

  const row = getDb()
    .select({ passwordHash: users.passwordHash })
    .from(users)
    .where(eq(users.id, user.id))
    .get();
  if (!row || !(await verifyPassword(current, row.passwordHash))) {
    return NextResponse.json({ error: "Senha atual incorreta." }, { status: 401 });
  }

  getDb()
    .update(users)
    .set({ passwordHash: await hashPassword(next), passwordUpdatedAt: Date.now() })
    .where(eq(users.id, user.id))
    .run();

  const token = await currentSessionToken();
  if (token) destroyOtherSessions(user.id, token);

  return NextResponse.json({ ok: true });
}
