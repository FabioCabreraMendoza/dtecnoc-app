import {
  update_cost_price_in_db,
  calculate_final_margin,
  notify_client_price,
  QUOTABLE_STATUSES,
} from "@/lib/tools/supplier";
import { prisma } from "@/lib/prisma";
import { stripQuotedReply } from "@/lib/gmail";
import { Prisma } from "@prisma/client";

export interface SupplierAgentResult {
  client_message?: string;
  order_now_cotizado: boolean;
  followup_sent: boolean;
}

// Coincide con el inicio de una línea de logística/entrega (día, courier, etc.).
const LOGISTICS_RE =
  /^(disponible|recoj|agencia|courier|d[ií]as?|entrega|llega|stock|shalom|marvisur|viernes|lunes|martes|miércoles|jueves|sábado|domingo)/i;
// Una línea que menciona precio no puede ser "el nombre del producto alternativo"
// — evita que una respuesta de una sola oración corrida (precio + disponibilidad +
// entrega mezclados) se cite entera como si fuera un modelo distinto (ver bug real
// detectado en pruebas: "nos ofrecen como alternativa el Tenemos 3 unidades...").
const PRICE_MENTION_RE = /precio|S\//i;

const normalizeForCompare = (s: string) =>
  s.toLowerCase().replace(/[^a-z0-9]/g, " ").replace(/\s+/g, " ").trim();

/**
 * Detecta si el proveedor ofreció un modelo distinto al solicitado. Devuelve la
 * línea del "producto alternativo" solo si es plausible (no es una línea de
 * logística ni una línea que mezcla precio con otra info), y solo si de verdad
 * difiere del producto pedido. Extraída como función pura para poder probarla
 * sin invocar el agente completo (BD + Gmail).
 */
export function detectAlternativeProductLine(
  noteLines: string[],
  effectiveProductName: string
): string | null {
  const candidate =
    noteLines.find(
      (l) => l.length > 5 && !LOGISTICS_RE.test(l) && !PRICE_MENTION_RE.test(l)
    ) ?? null;
  if (!candidate) return null;

  const normalizedCandidate = normalizeForCompare(candidate);
  const normalizedProduct = normalizeForCompare(effectiveProductName);
  const isAlternative =
    normalizedCandidate !== normalizedProduct &&
    !normalizedCandidate.includes(normalizedProduct.split(" ").slice(0, 2).join(" "));

  return isAlternative ? candidate : null;
}

// Un número seguido de una unidad (stock, plazo, %) o pegado a una fecha no es un precio.
const NON_PRICE_AFTER_RE =
  /^\s*(?:(?:unidades?|unds?|piezas?|pzas?|d[ií]as?|horas?|hrs?|semanas?|meses|a[ñn]os?|gb|tb|mah)\b|%|[/-]\d)/i;
const NON_PRICE_BEFORE_RE =
  /(?:\d[/-]|\b(?:stock|cantidad|cant\.?|qty|tel[eé]fono|cel\.?|ref\.?|pedido)\s*:?\s*)$/i;
// Un número marcado como importe: "S/ 85", "precio: 85", "85 soles".
const PRICE_LABEL_BEFORE_RE =
  /(?:S\/\.?|\bPEN|\bUSD|\$|\bprecio|\bcosto|\btotal)[^\d\n]{0,8}$/i;
const PRICE_LABEL_AFTER_RE = /^\s*(?:soles?|PEN|USD|d[oó]lares?)\b/i;

/** "1,500" / "1.250" (miles), "471,85" / "12.5" (decimales), "1.250,50" (ambos). */
function parseAmount(raw: string): number {
  if (/^\d{1,3}(?:[.,]\d{3})+$/.test(raw)) return parseFloat(raw.replace(/[.,]/g, ""));
  const dec = raw.match(/^(.*)[.,](\d{1,2})$/);
  return dec ? parseFloat(`${dec[1].replace(/[.,]/g, "")}.${dec[2]}`) : parseFloat(raw);
}

/**
 * Extrae el costo unitario del correo del proveedor. Prioriza un importe marcado
 * ("S/ 85", "85 soles", "precio 85"), así acepta precios bajos (cables, cargadores)
 * y no confunde stock/plazos con el precio. Sin marca, toma el primer número >= 100
 * (o el único número que quede).
 */
export function extractPrice(text: string): number | null {
  const candidates: Array<{ value: number; labeled: boolean }> = [];
  for (const m of text.matchAll(/\d+(?:[.,]\d+)*/g)) {
    const raw = m[0];
    const at = m.index ?? 0;
    const before = text.slice(Math.max(0, at - 14), at);
    const after = text.slice(at + raw.length, at + raw.length + 12);
    if (raw.replace(/\D/g, "").length > 8) continue; // teléfonos, RUC, etc.
    if (NON_PRICE_AFTER_RE.test(after) || NON_PRICE_BEFORE_RE.test(before)) continue;
    const value = parseAmount(raw);
    if (!(value > 0)) continue;
    candidates.push({
      value,
      labeled: PRICE_LABEL_BEFORE_RE.test(before) || PRICE_LABEL_AFTER_RE.test(after),
    });
  }
  const labeled = candidates.find((c) => c.labeled);
  if (labeled) return labeled.value;
  const big = candidates.find((c) => c.value >= 100);
  if (big) return big.value;
  return candidates.length === 1 ? candidates[0].value : null;
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

  if (!chat || chat.is_resolved) return { order_now_cotizado: false, followup_sent: false };

  // Solo se cotiza un pedido que aún espera precio. Si ya avanzó (pago, envío,
  // cancelado...) o el admin lo cotizó a mano, cualquier correo posterior del
  // proveedor se ignora y el hilo se cierra para que el cron no lo reprocese.
  if (!QUOTABLE_STATUSES.includes(chat.order.status)) {
    await prisma.supplierChat.update({
      where: { order_id },
      data: { is_resolved: true, updated_at: new Date() },
    });
    return { order_now_cotizado: false, followup_sent: false };
  }

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

  // Detecta si el proveedor ofrece un modelo distinto al solicitado (ver
  // detectAlternativeProductLine arriba — descarta líneas de logística y
  // líneas que mencionan precio, para no citar la respuesta entera como si
  // fuera un nombre de producto).
  const alternativeProductLine = detectAlternativeProductLine(
    noteLines,
    effectiveProductName
  );

  // 1. Calculate selling price with margin
  const { final_price } = await calculate_final_margin(costPrice, effectiveCategory);

  // 2. Pasar el pedido a COTIZADO. Va primero y es atómico: si otro proceso
  //    (webhook/cron) ya lo cotizó o el pedido avanzó, no se toca nada más.
  const notifyResult = await notify_client_price(order_id, final_price, effectiveProductName);
  if (!notifyResult.success) {
    return { order_now_cotizado: false, followup_sent: false };
  }

  // 3. Save cost price (only when catalog product exists) and supplier note
  if (product) {
    await update_cost_price_in_db(product.id, costPrice);
  }

  const fullNote = [
    alternativeProductLine ? `Alternativa: ${alternativeProductLine}` : null,
    availabilityNote,
  ].filter(Boolean).join(" | ");

  if (fullNote) {
    await prisma.order.update({
      where: { id: order_id },
      data: { notes: `Proveedor: ${fullNote}`, updated_at: new Date() },
    });
  }

  // Build client message — distinguish between exact match and alternative model
  let client_message: string;
  if (alternativeProductLine) {
    const deliveryLines = noteLines.filter(l => LOGISTICS_RE.test(l));
    const deliveryInfo = deliveryLines.length > 0 ? ` El proveedor indica: "${deliveryLines.join(" | ")}"` : "";
    client_message = `Hemos consultado con nuestro proveedor. El modelo exacto que solicitaste (${effectiveProductName}) no está disponible actualmente, pero nos ofrecen como alternativa el **${alternativeProductLine}** al precio de S/ ${final_price}.${deliveryInfo} ¿Te interesa esta opción? 😊`;
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
