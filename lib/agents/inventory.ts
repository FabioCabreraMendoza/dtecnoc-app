import { prisma } from "@/lib/prisma";
import { read_db_stock } from "@/lib/tools/inventory";
import { send_supplier_gmail } from "@/lib/tools/gmail-tools";
import { OrderStatus } from "@prisma/client";

// Reads "Cliente solicita: <product>" from order notes and sends a supplier email for it.
async function sendEmailForCustomProduct(
  order_id: string,
  supplierEmail: string,
  defaultCategory: string
): Promise<{ action: string; gmail_thread_id?: string }> {
  const order = await prisma.order.findUnique({
    where: { id: order_id },
    select: { notes: true },
  });

  const match = order?.notes?.match(/Cliente solicita:\s*([^|]+)/);
  const customProduct = match?.[1]?.trim();
  if (!customProduct) return { action: "OK" };

  const existingChat = await prisma.supplierChat.findUnique({ where: { order_id } });
  if (existingChat?.is_resolved) return { action: "ALREADY_QUOTED" };
  if (existingChat) return { action: "EMAIL_ALREADY_SENT", gmail_thread_id: existingChat.gmail_thread_id ?? undefined };

  const result = await send_supplier_gmail(order_id, supplierEmail, customProduct, 1, defaultCategory);
  if (!result.success) {
    console.error("inventoryAgent: fallo al enviar email al proveedor:", result.error);
    return { action: "RESTOCK_FAILED" };
  }
  return { action: "RESTOCK_TRIGGERED", gmail_thread_id: result.gmail_thread_id };
}

export async function inventoryAgent(
  order_id: string,
  product_id: string | null
): Promise<{ action: string; gmail_thread_id?: string }> {
  const supplierEmail = process.env.DEFAULT_SUPPLIER_EMAIL ?? "proveedor@dtecnoc.com";

  // No catalog product — order notes must contain "Cliente solicita: X"
  if (!product_id) {
    return sendEmailForCustomProduct(order_id, supplierEmail, "SMARTPHONE");
  }

  const stockInfo = await read_db_stock(product_id);
  if ("error" in stockInfo) return { action: "ERROR" };

  // Product is in stock, but check whether a *different* product was requested
  // (e.g. client asked for Xiaomi 14 while Samsung was already in the cart)
  if (!stockInfo.needs_restock && !stockInfo.is_just_in_time) {
    const order = await prisma.order.findUnique({
      where: { id: order_id },
      select: { status: true, notes: true },
    });
    if (
      order?.status === OrderStatus.ESPERANDO_PROVEEDOR &&
      order.notes?.includes("Cliente solicita:")
    ) {
      return sendEmailForCustomProduct(order_id, supplierEmail, String(stockInfo.category));
    }
    return { action: "OK" };
  }

  // Product itself needs restock or is JIT
  const existingChat = await prisma.supplierChat.findUnique({ where: { order_id } });
  if (existingChat?.is_resolved) return { action: "ALREADY_QUOTED" };
  if (existingChat) return { action: "EMAIL_ALREADY_SENT", gmail_thread_id: existingChat.gmail_thread_id ?? undefined };

  const result = await send_supplier_gmail(order_id, supplierEmail, stockInfo.name, 1, stockInfo.category);
  if (!result.success) {
    console.error("inventoryAgent: fallo al enviar email al proveedor:", result.error);
    return { action: "RESTOCK_FAILED" };
  }
  return { action: "RESTOCK_TRIGGERED", gmail_thread_id: result.gmail_thread_id };
}
