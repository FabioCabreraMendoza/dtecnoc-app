import { prisma } from "@/lib/prisma";
import { read_db_stock } from "@/lib/tools/inventory";
import { send_supplier_gmail } from "@/lib/tools/gmail-tools";
import { QUOTABLE_STATUSES } from "@/lib/tools/supplier";
import { OrderStatus } from "@prisma/client";

type InventoryResult = { action: string; gmail_thread_id?: string };

// Envía la solicitud de cotización al proveedor y traduce el resultado a una acción.
async function requestSupplierQuote(
  order_id: string,
  supplierEmail: string,
  productName: string,
  category: string
): Promise<InventoryResult> {
  const existingChat = await prisma.supplierChat.findUnique({ where: { order_id } });
  if (existingChat?.is_resolved) return { action: "ALREADY_QUOTED" };
  if (existingChat) return { action: "EMAIL_ALREADY_SENT", gmail_thread_id: existingChat.gmail_thread_id ?? undefined };

  const result = await send_supplier_gmail(order_id, supplierEmail, productName, 1, category);
  if (result.already_sent) return { action: "EMAIL_ALREADY_SENT" };
  if (!result.success) {
    console.error("inventoryAgent: fallo al enviar email al proveedor:", result.error);
    return { action: "RESTOCK_FAILED" };
  }
  return { action: "RESTOCK_TRIGGERED", gmail_thread_id: result.gmail_thread_id };
}

// Lee "Cliente solicita: <product>" de las notas del pedido y pide cotización por él.
async function sendEmailForCustomProduct(
  order_id: string,
  notes: string | null,
  supplierEmail: string,
  defaultCategory: string
): Promise<InventoryResult> {
  const customProduct = notes?.match(/Cliente solicita:\s*([^|]+)/)?.[1]?.trim();
  if (!customProduct) return { action: "OK" };
  return requestSupplierQuote(order_id, supplierEmail, customProduct, defaultCategory);
}

export async function inventoryAgent(
  order_id: string,
  product_id: string | null
): Promise<InventoryResult> {
  const supplierEmail = process.env.DEFAULT_SUPPLIER_EMAIL ?? "proveedor@dtecnoc.com";

  // Solo un pedido que aún no está cotizado puede disparar una consulta al
  // proveedor. Sin esta guarda, cada mensaje de un pedido ya cotizado, en
  // pago o cancelado re-evaluaba el stock y podía devolverlo a ESPERANDO_PROVEEDOR.
  const order = await prisma.order.findUnique({
    where: { id: order_id },
    select: { status: true, notes: true },
  });
  if (!order || !QUOTABLE_STATUSES.includes(order.status)) return { action: "OK" };

  // No catalog product — order notes must contain "Cliente solicita: X"
  if (!product_id) {
    return sendEmailForCustomProduct(order_id, order.notes, supplierEmail, "SMARTPHONE");
  }

  const stockInfo = await read_db_stock(product_id);
  if ("error" in stockInfo) return { action: "ERROR" };

  // Con stock (aunque sea bajo) el agente de ventas ya cotizó el precio de catálogo:
  // la reposición no debe bloquear la venta ni reemplazar su respuesta. Solo el
  // stock 0 (just-in-time) necesita al proveedor.
  if (!stockInfo.is_just_in_time) {
    // Check whether a *different* product was requested
    // (e.g. client asked for Xiaomi 14 while Samsung was already in the cart)
    if (
      order.status === OrderStatus.ESPERANDO_PROVEEDOR &&
      order.notes?.includes("Cliente solicita:")
    ) {
      return sendEmailForCustomProduct(order_id, order.notes, supplierEmail, String(stockInfo.category));
    }
    return { action: "OK" };
  }

  // Product is out of stock (just-in-time)
  return requestSupplierQuote(order_id, supplierEmail, stockInfo.name, stockInfo.category);
}
