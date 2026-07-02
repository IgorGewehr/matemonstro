import "server-only";

// GET: quantos codigos de recuperacao restam. POST: regenera o lote inteiro
// (exige a senha; os antigos deixam de valer; os novos so aparecem UMA vez).

import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";

import { getDb } from "@/lib/server/db/client";
import { users } from "@/lib/server/db/schema";
import { generateRecoveryCodes, verifyPassword } from "@/lib/server/auth";
import { getSessionUser, sameOriginOk } from "@/lib/server/session";
import { rateLimit, clientIp } from "@/lib/server/rate-limit";

export const runtime = "nodejs";

function codesLeft(userId: string): number {
  const row = getDb()
    .select({ recoveryCodes: users.recoveryCodes })
    .from(users)
    .where(eq(users.id, userId))
    .get();
  if (!row?.recoveryCodes) return 0;
  try {
    const arr = JSON.parse(row.recoveryCodes);
    return Array.isArray(arr) ? arr.length : 0;
  } catch {
    return 0;
  }
}

export async function GET() {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  return NextResponse.json({ codesLeft: codesLeft(user.id) });
}

export async function POST(request: Request) {
  if (!sameOriginOk(request)) {
    return NextResponse.json({ error: "origem invalida" }, { status: 403 });
  }
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!rateLimit(`regen:${clientIp(request)}:${user.id}`, 5, 15 * 60_000)) {
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

  const { plain, hashes } = await generateRecoveryCodes();
  getDb().update(users).set({ recoveryCodes: JSON.stringify(hashes) }).where(eq(users.id, user.id)).run();

  return NextResponse.json({ recoveryCodes: plain });
}
