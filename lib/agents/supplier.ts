import {
  update_cost_price_in_db,
  calculate_final_margin,
  notify_client_price,
} from "@/lib/tools/supplier";
import { prisma } from "@/lib/prisma";
import { stripQuotedReply } from "@/lib/gmail";
import { Prisma } from "@prisma/client";

export interface SupplierAgentResult {
  client_message?: string;
  order_now_cotizado: boolean;
  followup_sent: boolean;
}

function extractPrice(text: string): number | null {
  // Normalize currency symbols and labels
  let clean = text
    .replace(/S\/\s*/gi, "")
    .replace(/soles?/gi, "")
    .replace(/precio[:\s]*/gi, "");

  // Convert European decimal notation (471,85) → dot notation BEFORE removing commas
  // Pattern: digits, comma, exactly 1-2 digits, then non-digit or end
  clean = clean.replace(/(\d+),(\d{1,2})(?=\D|$)/g, "$1.$2");

  // Now remove remaining commas (thousands separators like 1,500)
  clean = clean.replace(/,/g, "");

  // Find all numbers in the text
  const matches = clean.match(/\b\d+(?:\.\d{1,2})?\b/g) ?? [];

  // Take the first number >= 100 as the price (avoids stock qty / days)
  for (const m of matches) {
    const n = parseFloat(m);
    if (n >= 100) return n;
  }
  return null;
}

export async function supplierAgent(
  order_id: string,
  supplier_email_body: string,
  _gmail_thread_id: string
): Promise<SupplierAgentResult> {
  const chat = await prisma.supplierChat.findUnique({
    where: { order_id },
    include: { order: { include: { items: { include: { product: true } } } } },
  });

  if (!chat) return { order_now_cotizado: false, followup_sent: false };

  // Limpia la cita del correo original; deja solo lo que escribió el proveedor.
  supplier_email_body = stripQuotedReply(supplier_email_body) || supplier_email_body;

  // Prefer the explicitly requested product (stored in notes) over the catalog item.
  // This handles out-of-catalog products (e.g. "Cliente solicita: iPhone 15").
  const requestedProductMatch = chat.order.notes?.match(/Cliente solicita:\s*([^|]+)/);
  const requestedProductName = requestedProductMatch?.[1]?.trim() ?? null;

  const product = chat.order.items[0]?.product ?? null;
  const effectiveProductName = requestedProductName ?? product?.name ?? null;
  const effectiveCategory = String(product?.category ?? "SMARTPHONE");

  const history = (chat.messages_json as Array<Record<string, string>>) ?? [];

  const costPrice = extractPrice(supplier_email_body);
  console.log(`[supplierAgent] order=${order_id} raw="${supplier_email_body}" → cost=${costPrice} product="${effectiveProductName}"`);

  if (!costPrice || !effectiveProductName) {
    await prisma.supplierChat.update({
      where: { order_id },
      data: {
        messages_json: [
          ...history,
          { role: "supplier", content: supplier_email_body, timestamp: new Date().toISOString() },
        ] as unknown as Prisma.InputJsonValue,
        updated_at: new Date(),
      },
    });
    console.warn(`[supplierAgent] No price found or no product. Skipping.`);
    return { order_now_cotizado: false, followup_sent: false };
  }

  // Split email into non-empty lines
  const emailLines = supplier_email_body.split(/\n/).map(l => l.trim()).filter(Boolean);

  // Extract availability/delivery note (lines that aren't the price)
  const noteLines = emailLines.filter(
    l => !l.match(/^\d+(?:\.\d{1,2})?$/) && !l.match(/^S\//i)
  );
  const availabilityNote = noteLines.join(" | ").trim();

  // Try to detect the supplier's offered product name:
  // first non-price line that looks like a product (not a date/logistics phrase)
  const LOGISTICS_RE = /^(disponible|recoj|agencia|courier|d[ií]as?|entrega|llega|stock|shalom|marvisur|viernes|lunes|martes|miércoles|jueves|sábado|domingo)/i;
  const supplierProductLine = noteLines.find(
    l => l.length > 5 && !LOGISTICS_RE.test(l)
  ) ?? null;

  // Determine if the supplier is offering an alternative model
  const normalize = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, " ").replace(/\s+/g, " ").trim();
  const isAlternative =
    supplierProductLine !== null &&
    normalize(supplierProductLine) !== normalize(effectiveProductName) &&
    !normalize(supplierProductLine).includes(normalize(effectiveProductName).split(" ").slice(0, 2).join(" "));

  // 1. Save cost price (only when catalog product exists)
  if (product) {
    await update_cost_price_in_db(product.id, costPrice);
  }

  // 2. Calculate selling price with margin
  const { final_price } = await calculate_final_margin(costPrice, effectiveCategory);

  // 3. Update order to COTIZADO and save supplier note
  const fullNote = [
    supplierProductLine && isAlternative ? `Alternativa: ${supplierProductLine}` : null,
    availabilityNote,
  ].filter(Boolean).join(" | ");

  if (fullNote) {
    await prisma.order.update({
      where: { id: order_id },
      data: { notes: `Proveedor: ${fullNote}`, updated_at: new Date() },
    });
  }
  const notifyResult = await notify_client_price(order_id, final_price, effectiveProductName);

  // Build client message — distinguish between exact match and alternative model
  let client_message: string;
  if (isAlternative && supplierProductLine) {
    const deliveryLines = noteLines.filter(l => LOGISTICS_RE.test(l));
    const deliveryInfo = deliveryLines.length > 0 ? ` El proveedor indica: "${deliveryLines.join(" | ")}"` : "";
    client_message = `Hemos consultado con nuestro proveedor. El modelo exacto que solicitaste (${effectiveProductName}) no está disponible actualmente, pero nos ofrecen como alternativa el **${supplierProductLine}** al precio de S/ ${final_price}.${deliveryInfo} ¿Te interesa esta opción? 😊`;
  } else {
    client_message = notifyResult.message_to_client as string;
  }

  // 4. Save message to supplier chat
  await prisma.supplierChat.update({
    where: { order_id },
    data: {
      messages_json: [
        ...history,
        { role: "supplier", content: supplier_email_body, timestamp: new Date().toISOString() },
        { role: "system", content: `Precio costo: S/${costPrice} → Precio venta: S/${final_price}`, timestamp: new Date().toISOString() },
      ] as unknown as Prisma.InputJsonValue,
      is_resolved: true,
      updated_at: new Date(),
    },
  });

  // 5. Push price notification to client conversation
  const conv = await prisma.clientConversation.findFirst({ where: { order_id } });
  if (conv) {
    const convMessages = (conv.messages_json as Array<Record<string, unknown>>) ?? [];
    await prisma.clientConversation.update({
      where: { id: conv.id },
      data: {
        messages_json: [
          ...convMessages,
          { role: "assistant", content: client_message, timestamp: new Date().toISOString() },
        ] as unknown as Prisma.InputJsonValue,
        updated_at: new Date(),
      },
    });
  }

  console.log(`[supplierAgent] order=${order_id} → COTIZADO S/${final_price}`);
  return { client_message, order_now_cotizado: true, followup_sent: false };
}
