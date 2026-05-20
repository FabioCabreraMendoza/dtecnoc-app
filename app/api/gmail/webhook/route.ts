import { NextRequest, NextResponse } from "next/server";
import { gmail, getEmailBody } from "@/lib/gmail";
import { find_supplier_chat_by_thread } from "@/lib/tools/gmail-tools";
import { supplierAgent } from "@/lib/agents/supplier";
import { prisma } from "@/lib/prisma";

// Google Cloud Pub/Sub sends a POST with this structure:
// { message: { data: "<base64 JSON>", messageId: "...", publishTime: "..." }, subscription: "..." }

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();

    // Validate Pub/Sub message structure
    if (!body?.message?.data) {
      return NextResponse.json({ status: "ignored" });
    }

    // Decode Pub/Sub notification
    const decoded = JSON.parse(
      Buffer.from(body.message.data, "base64").toString("utf-8")
    );
    const { emailAddress, historyId } = decoded as {
      emailAddress: string;
      historyId: string;
    };

    if (!historyId) return NextResponse.json({ status: "no_history_id" });

    // Fetch Gmail history since last known historyId
    const storedHistoryId = await getStoredHistoryId();
    const history = await gmail.users.history.list({
      userId: "me",
      startHistoryId: storedHistoryId ?? String(Number(historyId) - 10),
      historyTypes: ["messageAdded"],
      labelId: "INBOX",
    });

    await saveHistoryId(historyId);

    const newMessages = history.data.history?.flatMap(
      (h) => h.messagesAdded?.map((m) => m.message) ?? []
    ) ?? [];

    for (const msg of newMessages) {
      if (!msg?.id || !msg?.threadId) continue;

      // Skip messages sent by DTECNOC itself (avoid infinite loop)
      const fullMsg = await gmail.users.messages.get({
        userId: "me",
        id: msg.id,
        format: "metadata",
        metadataHeaders: ["From", "To", "Subject"],
      });

      const headers = fullMsg.data.payload?.headers ?? [];
      const from = headers.find((h) => h.name === "From")?.value ?? "";
      if (from.includes(process.env.GMAIL_USER ?? "")) continue;

      // Match this email thread to a supplier chat / order
      const orderInfo = await find_supplier_chat_by_thread(msg.threadId);
      if (!orderInfo) continue;

      // Get the email body text
      const emailBody = await getEmailBody(msg.id);
      if (!emailBody.trim()) continue;

      // Run SupplierAgent to process the reply
      await supplierAgent(orderInfo.order_id, emailBody, msg.threadId);
    }

    return NextResponse.json({ status: "processed" });
  } catch (err) {
    console.error("Gmail webhook error:", err);
    // Always return 200 so Pub/Sub doesn't retry indefinitely
    return NextResponse.json({ status: "error_logged" });
  }
}

async function getStoredHistoryId(): Promise<string | null> {
  const record = await prisma.embeddingDocument.findFirst({
    where: { metadata_json: { path: ["type"], equals: "gmail_history_id" } },
  });
  if (!record) return null;
  return (record.metadata_json as Record<string, string>).history_id ?? null;
}

async function saveHistoryId(historyId: string) {
  const existing = await prisma.embeddingDocument.findFirst({
    where: { metadata_json: { path: ["type"], equals: "gmail_history_id" } },
  });
  if (existing) {
    await prisma.embeddingDocument.update({
      where: { id: existing.id },
      data: {
        content: historyId,
        metadata_json: { type: "gmail_history_id", history_id: historyId },
        updated_at: new Date(),
      },
    });
  } else {
    await prisma.embeddingDocument.create({
      data: {
        content: historyId,
        metadata_json: { type: "gmail_history_id", history_id: historyId },
      },
    });
  }
}
