import { NextResponse } from "next/server";
import { generateStaffDraftWithAi } from "@/lib/ai";
import { buildFallbackStaffDraft } from "@/lib/staffEngine";
import { newId, nowIso, readDb, writeDb } from "@/lib/storage";

interface RequestBody {
  caseId: string;
  staffActorId: string;
  apiKey?: string;
  provider?: string;
  model?: string;
}

export async function POST(req: Request): Promise<Response> {
  const body = (await req.json()) as RequestBody;
  const caseId = body.caseId?.trim();
  const staffActorId = body.staffActorId?.trim();

  if (!caseId || !staffActorId) {
    return NextResponse.json({ error: "caseId and staffActorId are required" }, { status: 400 });
  }

  const db = await readDb();
  const caseRecord = db.cases.find((item) => item.id === caseId && item.syncConsent);

  if (!caseRecord) {
    return NextResponse.json({ error: "case not found or not consented" }, { status: 404 });
  }

  if (caseRecord.status === "new") {
    caseRecord.status = "in_review";
    caseRecord.updatedAt = nowIso();
  }

  const fallbackDraft = buildFallbackStaffDraft(caseRecord);
  const aiDraft =
    (await generateStaffDraftWithAi(body.apiKey, caseRecord.citizenSummary, caseRecord.citations, {
      provider: body.provider,
      model: body.model
    })) ||
    fallbackDraft;

  db.auditEvents.push({
    id: newId("audit"),
    eventType: "staff_draft",
    actorId: staffActorId,
    caseId,
    sessionId: null,
    timestamp: nowIso(),
    metadata: {
      usedExternalAi: Boolean(body.apiKey),
      provider: body.provider ?? "openai",
      model: body.model ?? null
    }
  });

  await writeDb(db);

  return NextResponse.json({
    caseId,
    aiDraft
  });
}
