import { NextRequest, NextResponse } from "next/server";
import { getSessionUser, sameOriginOk } from "@/lib/server/session";
import { createNote, listNotes } from "@/lib/server/notes-repo";
import { noteFieldsError } from "@/lib/server/notes-limits";

export const runtime = "nodejs";

export async function GET() {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const notes = listNotes(user.id);
  return NextResponse.json(notes);
}

export async function POST(req: NextRequest) {
  if (!sameOriginOk(req)) {
    return NextResponse.json({ error: "origem invalida" }, { status: 403 });
  }
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    body = {};
  }
  const { title, body: noteBody, subtopicId } = (body ?? {}) as {
    title?: string;
    body?: string;
    subtopicId?: string;
  };

  const limitError = noteFieldsError({ title, body: noteBody });
  if (limitError) {
    return NextResponse.json({ error: limitError }, { status: 413 });
  }

  const note = createNote(user.id, {
    title: typeof title === "string" ? title : undefined,
    body: typeof noteBody === "string" ? noteBody : undefined,
    subtopicId: typeof subtopicId === "string" ? subtopicId : undefined,
  });

  return NextResponse.json(note, { status: 201 });
}
