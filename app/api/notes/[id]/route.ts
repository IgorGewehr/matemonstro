import { NextRequest, NextResponse } from "next/server";
import { getSessionUser, sameOriginOk } from "@/lib/server/session";
import { getNoteById, softDeleteNote, updateNote } from "@/lib/server/notes-repo";
import { noteFieldsError } from "@/lib/server/notes-limits";

export const runtime = "nodejs";

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function PUT(req: NextRequest, { params }: RouteParams) {
  if (!sameOriginOk(req)) {
    return NextResponse.json({ error: "origem invalida" }, { status: 403 });
  }
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const { id } = await params;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    body = {};
  }
  const { title, body: noteBody, tags, subtopicId, updatedAt } = (body ?? {}) as {
    title?: string;
    body?: string;
    tags?: string[];
    subtopicId?: string;
    updatedAt?: number;
  };

  if (typeof updatedAt !== "number") {
    return NextResponse.json({ error: "updatedAt obrigatorio" }, { status: 400 });
  }

  const limitError = noteFieldsError({ title, body: noteBody, tags });
  if (limitError) {
    return NextResponse.json({ error: limitError }, { status: 413 });
  }

  const existing = getNoteById(user.id, id);
  if (!existing) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  const note = updateNote(user.id, id, {
    title,
    body: noteBody,
    tags: Array.isArray(tags) ? tags : undefined,
    subtopicId,
    updatedAt,
  });

  return NextResponse.json(note);
}

export async function DELETE(req: NextRequest, { params }: RouteParams) {
  if (!sameOriginOk(req)) {
    return NextResponse.json({ error: "origem invalida" }, { status: 403 });
  }
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const { id } = await params;

  const existing = getNoteById(user.id, id);
  if (!existing) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  softDeleteNote(user.id, id, Date.now());
  return NextResponse.json({ ok: true });
}
