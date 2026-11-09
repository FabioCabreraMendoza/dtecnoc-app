import { timingSafeEqual } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { gmail, getEmailBody, isSupplierReply } from "@/lib/gmail";
import { find_supplier_chat_by_thread } from "@/lib/tools/gmail-tools";
import { supplierAgent } from "@/lib/agents/supplier";
import { prisma } from "@/lib/prisma";

// Google Cloud Pub/Sub sends a POST with this structure:
// { message: { data: "<base64 JSON>", messageId: "...", publishTime: "..." }, subscription: "..." }

function secretMatches(provided: string | null, expected: string): boolean {
  const a = Buffer.from(provided ?? "");
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function POST(req: NextRequest) {
  // Endpoint público por naturaleza (Pub/Sub no puede autenticarse con el JWT
  // de admin), pero SIN esto cualquiera que descubra la URL puede dispararlo
  // y gastar cuota real de Gmail API. Mismo patrón que CRON_SECRET: un
  // secreto compartido en la URL que se registra en la suscripción push de
  // Google Cloud (Settings → Push endpoint URL → agregar ?secret=...).
  // En producción falla cerrado: sin GMAIL_WEBHOOK_SECRET configurado se rechaza todo.
  const { searchParams } = new URL(req.url);
  const expectedSecret = process.env.GMAIL_WEBHOOK_SECRET;
  const authorized = expectedSecret
    ? secretMatches(searchParams.get("secret"), expectedSecret)
    : process.env.NODE_ENV !== "production";
  if (!authorized) {
    // 200 (no 401): evita que Pub/Sub reintente indefinidamente un mensaje
    // que nunca va a aceptarse, igual que el resto de errores de esta ruta.
    return NextResponse.json({ status: "unauthorized" });
  }

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
    const { historyId } = decoded as {
      historyId: string;
    };

    if (!historyId) return NextResponse.json({ status: "no_history_id" });

    // Fetch Gmail history since last known historyId
    const storedHistoryId = await getStoredHistoryId();
    let newMessages: Array<{ id: string; threadId: string }>;
    try {
      newMessages = await listNewMessages(
        storedHistoryId ?? String(Math.max(0, Number(historyId) - 10))
      );
    } catch (err) {
      if (!isHistoryExpired(err)) throw err;
      // Gmail ya no guarda el historial desde el cursor guardado (caduca tras ~1
      // semana sin avisos). Sin esto el webhook fallaría igual en cada aviso para
      // siempre: se reinicia el cursor y lo que se perdió lo recoge el cron diario.
      console.warn("[gmail webhook] historyId caducado, se reinicia el cursor");
      await saveHistoryId(historyId);
      return NextResponse.json({ status: "history_reset" });
    }

    for (const msg of newMessages) {
      // Un mensaje que falle no debe bloquear el resto ni el cursor; el cron
      // diario es la red de seguridad y supplierAgent es idempotente.
      try {
        await processMessage(msg);
      } catch (err) {
        console.error(`[gmail webhook] error procesando mensaje ${msg.id}:`, err);
      }
    }

    // El cursor avanza SOLO tras procesar: si algo falló arriba (p. ej. la API de
    // Gmail), Pub/Sub no reintenta pero el siguiente aviso retoma desde el cursor
    // viejo y no se pierden mensajes.
    await saveHistoryId(historyId);

    return NextResponse.json({ status: "processed" });
  } catch (err) {
    console.error("Gmail webhook error:", err);
    // Always return 200 so Pub/Sub doesn't retry indefinitely
    return NextResponse.json({ status: "error_logged" });
  }
}

/** Mensajes nuevos del INBOX desde un cursor, recorriendo todas las páginas. */
async function listNewMessages(startHistoryId: string) {
  const found = new Map<string, string>(); // messageId → threadId
  let pageToken: string | undefined;
  do {
    const res = await gmail.users.history.list({
      userId: "me",
      startHistoryId,
      historyTypes: ["messageAdded"],
      labelId: "INBOX",
      pageToken,
    });
    for (const h of res.data.history ?? []) {
      for (const m of h.messagesAdded ?? []) {
        if (m.message?.id && m.message.threadId) {
          found.set(m.message.id, m.message.threadId);
        }
      }
    }
    pageToken = res.data.nextPageToken ?? undefined;
  } while (pageToken);
  return [...found].map(([id, threadId]) => ({ id, threadId }));
}

function isHistoryExpired(err: unknown): boolean {
  return Number((err as { code?: number | string })?.code) === 404;
}

async function processMessage(msg: { id: string; threadId: string }) {
  // Match this email thread to a supplier chat / order
  const orderInfo = await find_supplier_chat_by_thread(msg.threadId);
  if (!orderInfo) return;

  const fullMsg = await gmail.users.messages.get({
    userId: "me",
    id: msg.id,
    format: "metadata",
    metadataHeaders: ["From"],
  });
  const headers = fullMsg.data.payload?.headers ?? [];
  const from = headers.find((h) => h.name?.toLowerCase() === "from")?.value ?? "";

  // Solo cuenta la respuesta del proveedor del pedido (excluye también nuestros
  // propios correos, evitando un bucle infinito).
  if (!isSupplierReply(from, orderInfo.supplier_email)) return;

  // Get the email body text
  const emailBody = await getEmailBody(msg.id);
  if (!emailBody.trim()) return;

  // Run SupplierAgent to process the reply
  await supplierAgent(orderInfo.order_id, emailBody, msg.threadId);
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
