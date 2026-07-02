import "server-only";

// GET: sessoes ativas do usuario (token nunca sai inteiro).
// POST: revoga uma sessao (idPrefix) ou todas as outras ({others:true}).

import { NextResponse } from "next/server";

import {
  getSessionUser,
  currentSessionToken,
  listSessions,
  revokeSessionByPrefix,
  destroyOtherSessions,
  sameOriginOk,
} from "@/lib/server/session";

export const runtime = "nodejs";

export async function GET() {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const token = await currentSessionToken();
  return NextResponse.json({ sessions: listSessions(user.id, token) });
}

export async function POST(request: Request) {
  if (!sameOriginOk(request)) {
    return NextResponse.json({ error: "origem invalida" }, { status: 403 });
  }
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "JSON invalido." }, { status: 400 });
  }
  const { idPrefix, others } = (body ?? {}) as { idPrefix?: unknown; others?: unknown };

  if (others === true) {
    const token = await currentSessionToken();
    if (token) destroyOtherSessions(user.id, token);
    return NextResponse.json({ ok: true });
  }
  if (typeof idPrefix === "string") {
    const token = await currentSessionToken();
    if (token && token.startsWith(idPrefix)) {
      return NextResponse.json({ error: "Use 'Sair' para encerrar a sessao atual." }, { status: 400 });
    }
    const ok = revokeSessionByPrefix(user.id, idPrefix);
    return ok
      ? NextResponse.json({ ok: true })
      : NextResponse.json({ error: "Sessao nao encontrada." }, { status: 404 });
  }
  return NextResponse.json({ error: "Informe idPrefix ou others:true." }, { status: 400 });
}
