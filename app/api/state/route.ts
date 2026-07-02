import { NextRequest, NextResponse } from "next/server";
import { getSessionUser, sameOriginOk } from "@/lib/server/session";
import { applyPatch, getState, type StatePatch, type StateItem } from "@/lib/server/state";

export const runtime = "nodejs";

// ---- Limites do patch (anti abuso/bug do cliente) ----
const MAX_BODY_BYTES = 4 * 1024 * 1024; // 4 MB por request
const MAX_ITEMS_TOTAL = 8000; // itens somados em todos os domínios
const MAX_ITEM_BYTES = 64 * 1024; // 64 KB por item serializado
const MAX_CLOCK_SKEW_MS = 5 * 60_000; // updatedAt no futuro é clampado (anti LWW-freeze)

function sanitizePatch(patch: StatePatch, now: number): { ok: true; patch: StatePatch } | { ok: false; error: string } {
  let total = 0;
  const clampItem = (item: StateItem): StateItem => {
    if (typeof item.updatedAt === "number" && item.updatedAt > now + MAX_CLOCK_SKEW_MS) {
      return { ...item, updatedAt: now };
    }
    return item;
  };
  const out: StatePatch = {};
  for (const [domain, value] of Object.entries(patch)) {
    if (value == null) continue;
    if (domain === "settings") {
      if (typeof value !== "object" || Array.isArray(value)) return { ok: false, error: "settings invalido" };
      if (JSON.stringify(value).length > MAX_ITEM_BYTES) return { ok: false, error: "settings grande demais" };
      out.settings = clampItem(value as StateItem);
      continue;
    }
    if (!Array.isArray(value)) return { ok: false, error: `${domain} deve ser lista` };
    total += value.length;
    if (total > MAX_ITEMS_TOTAL) return { ok: false, error: "patch com itens demais" };
    const items: StateItem[] = [];
    for (const item of value) {
      if (item == null || typeof item !== "object" || Array.isArray(item)) {
        return { ok: false, error: `item invalido em ${domain}` };
      }
      if (JSON.stringify(item).length > MAX_ITEM_BYTES) {
        return { ok: false, error: `item grande demais em ${domain}` };
      }
      items.push(clampItem(item as StateItem));
    }
    (out as Record<string, unknown>)[domain] = items;
  }
  return { ok: true, patch: out };
}

/** GET /api/state -> todo o estado do usuario logado (401 sem sessao). */
export async function GET() {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const state = getState(user.id);
  return NextResponse.json(state);
}

/**
 * POST /api/state -> upsert parcial do estado (LWW por updatedAt).
 * userId sempre vem da sessao, nunca do corpo.
 */
export async function POST(req: NextRequest) {
  if (!sameOriginOk(req)) {
    return NextResponse.json({ error: "origem invalida" }, { status: 403 });
  }
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  // Cap de tamanho do corpo antes do parse.
  const raw = await req.text();
  if (raw.length > MAX_BODY_BYTES) {
    return NextResponse.json({ error: "payload grande demais" }, { status: 413 });
  }
  let body: unknown;
  try {
    body = JSON.parse(raw);
  } catch {
    body = {};
  }

  const patch = (body && typeof body === "object" ? body : {}) as StatePatch;
  const checked = sanitizePatch(patch, Date.now());
  if (!checked.ok) {
    return NextResponse.json({ error: checked.error }, { status: 400 });
  }
  const result = applyPatch(user.id, checked.patch);
  return NextResponse.json(result);
}
