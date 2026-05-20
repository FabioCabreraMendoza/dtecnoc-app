import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/middleware-auth";
import { prisma } from "@/lib/prisma";
import { gmail_v1 } from "googleapis";
import { gmail, extractBodyFromPayload } from "@/lib/gmail";
import { supplierAgent } from "@/lib/agents/supplier";

function getFrom(msg: gmail_v1.Schema$Message): string {
  const headers = msg.payload?.headers ?? [];
  return (
    headers.find((h: gmail_v1.Schema$MessagePartHeader) => h.name?.toLowerCase() === "from")
      ?.value ?? ""
  );
}

async function handler(req: NextRequest) {
  const { order_id } = await req.json() as { order_id: string };
  if (!order_id) return NextResponse.json({ error: "order_id requerido" }, { status: 400 });

  const chat = await prisma.supplierChat.findUnique({ where: { order_id } });
  if (!chat?.gmail_thread_id) {
    return NextResponse.json({ error: "No hay hilo de Gmail para este pedido" }, { status: 404 });
  }

  if (chat.is_resolved) {
    return NextResponse.json({ status: "already_resolved", message: "La cotización ya fue procesada" });
  }

  const gmailUser = (process.env.GMAIL_USER ?? "").toLowerCase();

  // ── Step 1: look inside the stored thread ─────────────────────────────────
  const thread = await gmail.users.threads.get({
    userId: "me",
    id: chat.gmail_thread_id,
    format: "full",
  });

  const threadMessages = thread.data.messages ?? [];
  console.log(`[check-reply] order=${order_id} thread=${chat.gmail_thread_id} messages=${threadMessages.length}`);
  threadMessages.forEach((m, i) => {
    console.log(`  [${i}] id=${m.id} from="${getFrom(m)}"`);
  });

  let latestReply: string | null = null;
  for (const msg of threadMessages) {
    const from = getFrom(msg).toLowerCase();
    if (!from.includes(gmailUser)) {
      const body = extractBodyFromPayload((msg.payload ?? {}) as Parameters<typeof extractBodyFromPayload>[0]);
      console.log(`  → supplier candidate from="${from}" bodyLen=${body.trim().length}`);
      if (body.trim()) latestReply = body.trim();
    }
  }

  // ── Step 2: fallback — search inbox for a recent reply from supplier ──────
  if (!latestReply && chat.supplier_email) {
    console.log(`[check-reply] thread has no reply, searching inbox from=${chat.supplier_email}`);
    const refShort = order_id.slice(0, 8);
    const searchRes = await gmail.users.messages.list({
      userId: "me",
      q: `from:${chat.supplier_email} ${refShort}`,
      maxResults: 5,
    });
    const inboxMessages = searchRes.data.messages ?? [];
    console.log(`[check-reply] inbox search found ${inboxMessages.length} messages`);

    for (const ref of inboxMessages) {
      const full = await gmail.users.messages.get({ userId: "me", id: ref.id!, format: "full" });
      const from = getFrom(full.data).toLowerCase();
      if (!from.includes(gmailUser)) {
        const body = extractBodyFromPayload((full.data.payload ?? {}) as Parameters<typeof extractBodyFromPayload>[0]);
        console.log(`  → inbox candidate from="${from}" bodyLen=${body.trim().length}`);
        if (body.trim()) { latestReply = body.trim(); break; }
      }
    }
  }

  if (!latestReply) {
    console.log(`[check-reply] no supplier reply found for order=${order_id}`);
    return NextResponse.json({ status: "no_reply", message: "El proveedor aún no ha respondido" });
  }

  console.log(`[check-reply] processing reply (${latestReply.length} chars): "${latestReply.slice(0, 80)}..."`);
  const result = await supplierAgent(order_id, latestReply, chat.gmail_thread_id);

  return NextResponse.json({
    status: result.order_now_cotizado ? "cotizado" : "processed",
    client_message: result.client_message,
    order_now_cotizado: result.order_now_cotizado,
  });
}

export const POST = requireAdmin(handler);
