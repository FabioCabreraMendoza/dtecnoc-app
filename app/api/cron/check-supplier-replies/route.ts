import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { gmail_v1 } from "googleapis";
import { gmail, extractBodyFromPayload } from "@/lib/gmail";
import { supplierAgent } from "@/lib/agents/supplier";

function getFrom(msg: gmail_v1.Schema$Message): string {
  const headers = msg.payload?.headers ?? [];
  return (
    headers
      .find((h: gmail_v1.Schema$MessagePartHeader) => h.name?.toLowerCase() === "from")
      ?.value ?? ""
  );
}

export async function GET(req: NextRequest) {
  // Vercel sets Authorization: Bearer <CRON_SECRET> automatically on cron invocations.
  // Also allow calls from the admin UI without the secret (for manual trigger).
  const authHeader = req.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const gmailUser = (process.env.GMAIL_USER ?? "").toLowerCase();

  const pendingChats = await prisma.supplierChat.findMany({
    where: { is_resolved: false, gmail_thread_id: { not: null } },
    select: { order_id: true, gmail_thread_id: true, supplier_email: true },
  });

  console.log(`[cron/check-supplier-replies] ${pendingChats.length} chats pendientes`);

  const results: Array<{ order_id: string; status: string }> = [];

  for (const chat of pendingChats) {
    if (!chat.gmail_thread_id) continue;

    try {
      const thread = await gmail.users.threads.get({
        userId: "me",
        id: chat.gmail_thread_id,
        format: "full",
      });

      const threadMessages = thread.data.messages ?? [];
      let latestReply: string | null = null;

      for (const msg of threadMessages) {
        const from = getFrom(msg).toLowerCase();
        if (!from.includes(gmailUser)) {
          const body = extractBodyFromPayload(
            (msg.payload ?? {}) as Parameters<typeof extractBodyFromPayload>[0]
          );
          if (body.trim()) latestReply = body.trim();
        }
      }

      if (!latestReply) {
        results.push({ order_id: chat.order_id, status: "no_reply" });
        continue;
      }

      console.log(`[cron] order=${chat.order_id} → procesando respuesta del proveedor`);
      const result = await supplierAgent(chat.order_id, latestReply, chat.gmail_thread_id);
      results.push({
        order_id: chat.order_id,
        status: result.order_now_cotizado ? "cotizado" : "processed",
      });
    } catch (err) {
      console.error(`[cron] order=${chat.order_id} error:`, err);
      results.push({ order_id: chat.order_id, status: "error" });
    }
  }

  return NextResponse.json({ checked: pendingChats.length, results });
}
