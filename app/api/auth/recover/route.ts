import "server-only";

// Reset de senha SEM e-mail: consome um codigo de recuperacao (gerado no
// signup e guardado pelo usuario). O codigo usado e descartado; todas as
// sessoes sao revogadas e uma nova e criada (auto-login).

import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";

import { getDb } from "@/lib/server/db/client";
import { users } from "@/lib/server/db/schema";
import {
  hashPassword,
  isValidEmail,
  isValidPassword,
  passwordStrengthError,
  verifyRecoveryCode,
} from "@/lib/server/auth";
import { createSession, destroyAllSessions, sameOriginOk } from "@/lib/server/session";
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
  const { email, code, newPassword } = (body ?? {}) as {
    email?: unknown;
    code?: unknown;
    newPassword?: unknown;
  };

  if (!isValidEmail(email) || typeof code !== "string" || !isValidPassword(newPassword)) {
    return NextResponse.json({ error: "Dados invalidos." }, { status: 400 });
  }
  const normalizedEmail = email.trim().toLowerCase();

  // Codigos tem ~41 bits, mas rate-limit apertado mesmo assim: 5 / 15 min.
  if (!rateLimit(`recover:${clientIp(request)}:${normalizedEmail}`, 5, 15 * 60_000)) {
    return NextResponse.json({ error: "Muitas tentativas. Aguarde alguns minutos." }, { status: 429 });
  }

  const weak = passwordStrengthError(newPassword, normalizedEmail);
  if (weak) {
    return NextResponse.json({ error: weak }, { status: 400 });
  }

  const user = getDb()
    .select({ id: users.id, email: users.email, recoveryCodes: users.recoveryCodes })
    .from(users)
    .where(eq(users.email, normalizedEmail))
    .get();

  // Mensagem generica: nao vaza se a conta existe ou se o codigo errou.
  const fail = () =>
    NextResponse.json({ error: "E-mail ou codigo de recuperacao invalidos." }, { status: 401 });

  if (!user || !user.recoveryCodes) return fail();

  let hashes: string[];
  try {
    hashes = JSON.parse(user.recoveryCodes) as string[];
  } catch {
    return fail();
  }
  if (!Array.isArray(hashes) || hashes.length === 0) return fail();

  const idx = await verifyRecoveryCode(code, hashes);
  if (idx === -1) return fail();

  // Consome o codigo usado, troca a senha e derruba TODAS as sessoes.
  hashes.splice(idx, 1);
  const now = Date.now();
  getDb()
    .update(users)
    .set({
      passwordHash: await hashPassword(newPassword),
      recoveryCodes: JSON.stringify(hashes),
      passwordUpdatedAt: now,
    })
    .where(eq(users.id, user.id))
    .run();
  destroyAllSessions(user.id);
  await createSession(user.id, request.headers.get("user-agent"));

  return NextResponse.json({
    user: { id: user.id, email: user.email },
    codesLeft: hashes.length,
  });
}
