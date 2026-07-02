import "server-only";

import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";

import { getDb } from "@/lib/server/db/client";
import { users } from "@/lib/server/db/schema";
import { isValidEmail, isValidPassword, verifyPassword } from "@/lib/server/auth";
import { createSession, sameOriginOk } from "@/lib/server/session";
import { rateLimit, clientIp } from "@/lib/server/rate-limit";

export const runtime = "nodejs";

export async function POST(request: Request) {
  if (!sameOriginOk(request)) {
    return NextResponse.json({ error: "origem invalida" }, { status: 403 });
  }
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "JSON invalido." }, { status: 400 });
  }

  const { email, password } = (body ?? {}) as { email?: unknown; password?: unknown };

  if (!isValidEmail(email) || !isValidPassword(password)) {
    return NextResponse.json({ error: "Email ou senha invalidos." }, { status: 401 });
  }

  const normalizedEmail = email.trim().toLowerCase();

  // Anti força-bruta: 10 tentativas / 15 min por IP+email.
  if (!rateLimit(`login:${clientIp(request)}:${normalizedEmail}`, 10, 15 * 60_000)) {
    return NextResponse.json(
      { error: "Muitas tentativas. Aguarde alguns minutos." },
      { status: 429 }
    );
  }

  const user = getDb()
    .select({ id: users.id, email: users.email, passwordHash: users.passwordHash })
    .from(users)
    .where(eq(users.email, normalizedEmail))
    .get();

  if (!user) {
    return NextResponse.json({ error: "Email ou senha invalidos." }, { status: 401 });
  }

  const ok = await verifyPassword(password, user.passwordHash);
  if (!ok) {
    return NextResponse.json({ error: "Email ou senha invalidos." }, { status: 401 });
  }

  await createSession(user.id, request.headers.get("user-agent"));

  return NextResponse.json({ user: { id: user.id, email: user.email } });
}
