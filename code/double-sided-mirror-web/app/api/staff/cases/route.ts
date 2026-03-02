import { NextResponse } from "next/server";
import { readDb } from "@/lib/storage";

export const dynamic = "force-dynamic";

export async function GET(): Promise<Response> {
  const db = await readDb();
  const cases = db.cases
    .filter((item) => item.syncConsent)
    .sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1))
    .map((record) => {
      const response = db.responses.find((item) => item.caseId === record.id) ?? null;
      return {
        ...record,
        response
      };
    });

  return NextResponse.json({ cases });
}
