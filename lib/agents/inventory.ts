import { prisma } from "@/lib/prisma";
import { read_db_stock } from "@/lib/tools/inventory";
import { send_supplier_gmail } from "@/lib/tools/gmail-tools";

export async function inventoryAgent(
  order_id: string,
  product_id: string
): Promise<{ action: string; gmail_thread_id?: string }> {
  const stockInfo = await read_db_stock(product_id);
  if ("error" in stockInfo) return { action: "ERROR" };

  if (!stockInfo.needs_restock && !stockInfo.is_just_in_time) {
    return { action: "OK" };
  }

  // Skip if supplier already replied for this order
  const existingChat = await prisma.supplierChat.findUnique({ where: { order_id } });
  if (existingChat?.is_resolved) {
    return { action: "ALREADY_QUOTED" };
  }
  // Skip if email already sent (chat exists but supplier hasn't replied yet)
  if (existingChat) {
    return { action: "EMAIL_ALREADY_SENT", gmail_thread_id: existingChat.gmail_thread_id ?? undefined };
  }

  const supplierEmail =
    process.env.DEFAULT_SUPPLIER_EMAIL ?? "proveedor@dtecnoc.com";

  const result = await send_supplier_gmail(
    order_id,
    supplierEmail,
    stockInfo.name,
    1,
    stockInfo.category
  );

  if (!result.success) {
    console.error("inventoryAgent: fallo al enviar email al proveedor:", result.error);
    return { action: "RESTOCK_FAILED" };
  }

  return { action: "RESTOCK_TRIGGERED", gmail_thread_id: result.gmail_thread_id };
}
