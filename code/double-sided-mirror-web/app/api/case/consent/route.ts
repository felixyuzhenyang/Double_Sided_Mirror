import { NextResponse } from "next/server";
import { newId, nowIso, readDb, writeDb } from "@/lib/storage";

interface RequestBody {
  sessionId: string;
  consent: boolean;
}

export async function POST(req: Request): Promise<Response> {
  const body = (await req.json()) as RequestBody;
  const sessionId = body.sessionId?.trim();

  if (!sessionId || typeof body.consent !== "boolean") {
    return NextResponse.json({ error: "sessionId and consent are required" }, { status: 400 });
  }

  const db = await readDb();
  const session = db.sessions.find((item) => item.id === sessionId && item.mode === "citizen");

  if (!session) {
    return NextResponse.json({ error: "citizen session not found" }, { status: 404 });
  }

  if (!session.citizenMeta?.result) {
    return NextResponse.json({ error: "citizen result not ready" }, { status: 400 });
  }

  const now = nowIso();

  if (!body.consent) {
    db.auditEvents.push({
      id: newId("audit"),
      eventType: "case_sync",
      actorId: session.actorId,
      caseId: null,
      sessionId: session.id,
      timestamp: now,
      metadata: {
        consent: false
      }
    });

    await writeDb(db);
    return NextResponse.json({ synced: false });
  }

  let caseRecord = db.cases.find((item) => item.citizenSessionId === session.id);

  if (!caseRecord) {
    caseRecord = {
      id: newId("case"),
      citizenSessionId: session.id,
      citizenDisplayName: session.citizenMeta.citizenDisplayName || "",
      intentTitle: session.citizenMeta.intentTitle,
      citizenSummary: session.citizenMeta.result.summary,
      transcript: session.transcript,
      actionPlan: session.citizenMeta.result.actionPlan,
      flowchartMermaid: session.citizenMeta.result.flowchartMermaid,
      citations: session.citizenMeta.result.citations,
      syncConsent: true,
      syncConsentAt: now,
      status: "new",
      createdAt: now,
      updatedAt: now
    };

    db.cases.push(caseRecord);
  } else {
    caseRecord.citizenDisplayName = session.citizenMeta.citizenDisplayName || "";
    caseRecord.syncConsent = true;
    caseRecord.syncConsentAt = now;
    caseRecord.updatedAt = now;
  }

  db.auditEvents.push({
    id: newId("audit"),
    eventType: "case_sync",
    actorId: session.actorId,
    caseId: caseRecord.id,
    sessionId: session.id,
    timestamp: now,
    metadata: {
      consent: true,
      caseStatus: caseRecord.status
    }
  });

  await writeDb(db);

  return NextResponse.json({
    synced: true,
    caseId: caseRecord.id,
    status: caseRecord.status
  });
}
