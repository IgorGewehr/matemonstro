import "server-only";

import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";

import { getDb } from "@/lib/server/db/client";
import { users } from "@/lib/server/db/schema";
import {
  hashPassword,
  isValidEmail,
  isValidPassword,
  passwordStrengthError,
  generateRecoveryCodes,
} from "@/lib/server/auth";
import { createSession, sameOriginOk } from "@/lib/server/session";
import { rateLimit, clientIp } from "@/lib/server/rate-limit";

export const runtime = "nodejs";

export async function POST(request: Request) {
  if (!sameOriginOk(request)) {
    return NextResponse.json({ error: "origem invalida" }, { status: 403 });
  }
  // Anti abuso: 5 contas novas / hora por IP.
  if (!rateLimit(`signup:${clientIp(request)}`, 5, 60 * 60_000)) {
    return NextResponse.json({ error: "Muitas tentativas. Aguarde." }, { status: 429 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "JSON invalido." }, { status: 400 });
  }

  const { email, password } = (body ?? {}) as { email?: unknown; password?: unknown };

  if (!isValidEmail(email)) {
    return NextResponse.json({ error: "Email invalido." }, { status: 400 });
  }
  if (!isValidPassword(password)) {
    return NextResponse.json({ error: "A senha precisa ter pelo menos 8 caracteres." }, { status: 400 });
  }

  const normalizedEmail = email.trim().toLowerCase();

  const weak = passwordStrengthError(password, normalizedEmail);
  if (weak) {
    return NextResponse.json({ error: weak }, { status: 400 });
  }

  const existing = getDb().select({ id: users.id }).from(users).where(eq(users.email, normalizedEmail)).get();
  if (existing) {
    return NextResponse.json({ error: "Ja existe uma conta com esse email." }, { status: 409 });
  }

  const id = randomUUID();
  const passwordHash = await hashPassword(password);
  const createdAt = Date.now();
  const { plain: recoveryCodes, hashes } = await generateRecoveryCodes();

  getDb()
    .insert(users)
    .values({
      id,
      email: normalizedEmail,
      passwordHash,
      createdAt,
      recoveryCodes: JSON.stringify(hashes),
      passwordUpdatedAt: createdAt,
    })
    .run();

  await createSession(id, request.headers.get("user-agent"));

  // Os codigos em texto puro so existem NESTA resposta — a UI obriga o usuario
  // a salva-los antes de fechar.
  return NextResponse.json({ user: { id, email: normalizedEmail }, recoveryCodes });
}
