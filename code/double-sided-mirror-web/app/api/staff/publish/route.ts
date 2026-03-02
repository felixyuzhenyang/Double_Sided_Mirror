import { NextResponse } from "next/server";
import { newId, nowIso, readDb, writeDb } from "@/lib/storage";

interface RequestBody {
  caseId: string;
  staffActorId: string;
  aiDraft: string;
  humanResponse: string;
}

export async function POST(req: Request): Promise<Response> {
  const body = (await req.json()) as RequestBody;
  const caseId = body.caseId?.trim();
  const staffActorId = body.staffActorId?.trim();
  const aiDraft = body.aiDraft?.trim() ?? "";
  const humanResponse = body.humanResponse?.trim() ?? "";

  if (!caseId || !staffActorId || !humanResponse) {
    return NextResponse.json(
      { error: "caseId, staffActorId, and humanResponse are required" },
      { status: 400 }
    );
  }

  if (humanResponse.length < 80) {
    return NextResponse.json(
      { error: "humanResponse is too short; please provide a complete manual response" },
      { status: 400 }
    );
  }

  if (aiDraft && humanResponse === aiDraft) {
    return NextResponse.json(
      { error: "final response cannot be identical to AI draft" },
      { status: 400 }
    );
  }

  const db = await readDb();
  const caseRecord = db.cases.find((item) => item.id === caseId && item.syncConsent);

  if (!caseRecord) {
    return NextResponse.json({ error: "case not found or not consented" }, { status: 404 });
  }

  const now = nowIso();

  const existing = db.responses.find((item) => item.caseId === caseId);
  if (existing) {
    existing.staffActorId = staffActorId;
    existing.aiDraft = aiDraft;
    existing.humanResponse = humanResponse;
    existing.publishedAt = now;
  } else {
    db.responses.push({
      id: newId("resp"),
      caseId,
      staffActorId,
      aiDraft,
      humanResponse,
      publishedAt: now
    });
  }

  caseRecord.status = "responded";
  caseRecord.updatedAt = now;

  db.auditEvents.push({
    id: newId("audit"),
    eventType: "staff_publish",
    actorId: staffActorId,
    caseId,
    sessionId: null,
    timestamp: now,
    metadata: {
      responseLength: humanResponse.length
    }
  });

  await writeDb(db);

  return NextResponse.json({
    published: true,
    caseId,
    publishedAt: now
  });
}
