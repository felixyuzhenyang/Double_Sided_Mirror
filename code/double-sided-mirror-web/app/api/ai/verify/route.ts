import { NextResponse } from "next/server";
import { verifyApiKeyWithAi } from "@/lib/ai";

export const dynamic = "force-dynamic";

interface RequestBody {
  apiKey?: string;
  provider?: string;
  model?: string;
}

export async function POST(req: Request): Promise<Response> {
  const body = (await req.json()) as RequestBody;
  const result = await verifyApiKeyWithAi(body.apiKey, {
    provider: body.provider,
    model: body.model
  });

  if (!result.ok) {
    return NextResponse.json(
      {
        ok: false,
        message: result.message
      },
      { status: 400 }
    );
  }

  return NextResponse.json({
    ok: true,
    message: result.message
  });
}
