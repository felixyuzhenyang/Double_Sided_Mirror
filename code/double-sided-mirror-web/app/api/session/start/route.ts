import { NextResponse } from "next/server";
import { readDb, writeDb, newId, nowIso } from "@/lib/storage";
import { ConversationSession, RoleMode } from "@/lib/types";

interface RequestBody {
  mode: RoleMode;
  actorId?: string;
}

export async function POST(req: Request): Promise<Response> {
  const body = (await req.json()) as RequestBody;
  const mode = body.mode;

  if (mode !== "citizen" && mode !== "staff") {
    return NextResponse.json({ error: "invalid mode" }, { status: 400 });
  }

  let actorId = "";
  if (mode === "citizen") {
    actorId = body.actorId?.trim() || `citizen_${Math.random().toString(36).slice(2, 8)}`;
  } else {
    const staffActorId = body.actorId?.trim();
    if (!staffActorId) {
      return NextResponse.json({ error: "staff actorId is required" }, { status: 400 });
    }
    actorId = staffActorId;
  }

  const db = await readDb();
  const now = nowIso();

  const session: ConversationSession = {
    id: newId("sess"),
    mode,
    actorId,
    createdAt: now,
    updatedAt: now,
    status: "active",
    transcript: []
  };

  db.sessions.push(session);
  db.auditEvents.push({
    id: newId("audit"),
    eventType: "session_start",
    actorId,
    caseId: null,
    sessionId: session.id,
    timestamp: now,
    metadata: {
      mode
    }
  });

  await writeDb(db);

  return NextResponse.json({
    sessionId: session.id,
    actorId,
    mode
  });
}
