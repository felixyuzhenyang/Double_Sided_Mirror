import { NextResponse } from "next/server";
import { readDb } from "@/lib/storage";

export const dynamic = "force-dynamic";

export async function GET(req: Request): Promise<Response> {
  const { searchParams } = new URL(req.url);
  const sessionId = searchParams.get("sessionId")?.trim();

  if (!sessionId) {
    return NextResponse.json({ error: "sessionId query param is required" }, { status: 400 });
  }

  const db = await readDb();
  const cases = db.cases
    .filter((item) => item.citizenSessionId === sessionId && item.syncConsent)
    .map((record) => {
      const responses = db.responses.filter((item) => item.caseId === record.id);
      return {
        ...record,
        responses
      };
    });

  return NextResponse.json({ cases });
}
