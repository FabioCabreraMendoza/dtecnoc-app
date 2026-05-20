import { NextRequest, NextResponse } from "next/server";
import { registerGmailWatch } from "@/lib/gmail";
import { requireAdmin } from "@/lib/middleware-auth";

async function handler(_req: NextRequest) {
  try {
    const result = await registerGmailWatch();
    const expiresAt = new Date(Number(result.expiration)).toISOString();
    return NextResponse.json({
      success: true,
      historyId: result.historyId,
      expires_at: expiresAt,
      message: `Gmail watch activo. Expira: ${expiresAt}`,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}

export const POST = requireAdmin(handler);
