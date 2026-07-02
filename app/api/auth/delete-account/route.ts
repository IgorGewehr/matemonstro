import "server-only";

// Exclusao de conta: exige a senha, apaga TODOS os dados do usuario no
// servidor (state, notes, sessions, users) e limpa o cookie. Os dados locais
// (IndexedDB) continuam no aparelho do usuario — sao dele.

import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";

import { getDb } from "@/lib/server/db/client";
import { users, sessions, state, notes } from "@/lib/server/db/schema";
import { verifyPassword } from "@/lib/server/auth";
import { getSessionUser, destroySession, sameOriginOk } from "@/lib/server/session";
import { rateLimit, clientIp } from "@/lib/server/rate-limit";

export const runtime = "nodejs";

export async function POST(request: Request) {
  if (!sameOriginOk(request)) {
    return NextResponse.json({ error: "origem invalida" }, { status: 403 });
  }
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!rateLimit(`delacc:${clientIp(request)}:${user.id}`, 5, 15 * 60_000)) {
    return NextResponse.json({ error: "Muitas tentativas. Aguarde." }, { status: 429 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "JSON invalido." }, { status: 400 });
  }
  const { password } = (body ?? {}) as { password?: unknown };
  if (typeof password !== "string") {
    return NextResponse.json({ error: "Senha obrigatoria." }, { status: 400 });
  }

  const row = getDb()
    .select({ passwordHash: users.passwordHash })
    .from(users)
    .where(eq(users.id, user.id))
    .get();
  if (!row || !(await verifyPassword(password, row.passwordHash))) {
    return NextResponse.json({ error: "Senha incorreta." }, { status: 401 });
  }

  const db = getDb();
  db.delete(state).where(eq(state.userId, user.id)).run();
  db.delete(notes).where(eq(notes.userId, user.id)).run();
  db.delete(sessions).where(eq(sessions.userId, user.id)).run();
  db.delete(users).where(eq(users.id, user.id)).run();
  await destroySession();

  return NextResponse.json({ ok: true });
}
