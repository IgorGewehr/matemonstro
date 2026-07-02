import { NextResponse } from "next/server";

export const runtime = "nodejs";

/** Healthcheck para o docker-compose / monitoramento do tunnel. */
export async function GET() {
  return NextResponse.json({ ok: true, app: "matemonstro" });
}
