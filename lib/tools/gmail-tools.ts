import { prisma } from "@/lib/prisma";
import { sendGmail } from "@/lib/gmail";
import { OrderStatus } from "@prisma/client";
import { QUOTABLE_STATUSES } from "@/lib/tools/supplier";

const escapeHtml = (s: string) =>
  s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

export function buildSupplierEmailHtml(params: {
  product_name: string;
  quantity: number;
  order_id: string;
  category: string;
}): string {
  const product_name = escapeHtml(params.product_name);
  const category = escapeHtml(params.category);
  const order_id = escapeHtml(params.order_id);
  return `
<!DOCTYPE html>
<html lang="es">
<body style="font-family: Arial, sans-serif; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
  <div style="background: #1e3a5f; color: white; padding: 20px; border-radius: 8px 8px 0 0;">
    <h2 style="margin:0;">📡 DTECNOC — Solicitud de Cotización</h2>
  </div>
  <div style="background: #f9f9f9; border: 1px solid #ddd; padding: 24px; border-radius: 0 0 8px 8px;">
    <p>Estimado proveedor,</p>
    <p>Requerimos cotización para el siguiente producto:</p>
    <table style="width:100%; border-collapse: collapse; margin: 16px 0;">
      <tr style="background:#e8f0fe;">
        <td style="padding: 10px; border: 1px solid #ccc;"><strong>Producto</strong></td>
        <td style="padding: 10px; border: 1px solid #ccc;">${product_name}</td>
      </tr>
      <tr>
        <td style="padding: 10px; border: 1px solid #ccc;"><strong>Categoría</strong></td>
        <td style="padding: 10px; border: 1px solid #ccc;">${category}</td>
      </tr>
      <tr style="background:#e8f0fe;">
        <td style="padding: 10px; border: 1px solid #ccc;"><strong>Cantidad</strong></td>
        <td style="padding: 10px; border: 1px solid #ccc;">${params.quantity} unidad(es)</td>
      </tr>
      <tr>
        <td style="padding: 10px; border: 1px solid #ccc;"><strong>Referencia</strong></td>
        <td style="padding: 10px; border: 1px solid #ccc; font-size: 12px; color: #666;">${order_id}</td>
      </tr>
    </table>
    <div style="background: #e8f4fd; border: 2px solid #1e3a5f; border-radius: 8px; padding: 16px; margin: 20px 0;">
      <p style="margin: 0 0 8px; font-weight: bold; color: #1e3a5f;">Por favor responda a este correo indicando:</p>
      <ul style="margin: 0; padding-left: 20px; color: #1e3a5f;">
        <li>Precio unitario (en Soles)</li>
        <li>Disponibilidad y tiempo de entrega</li>
      </ul>
    </div>
    <p style="color: #666; font-size: 13px;">Referencia de pedido: ${order_id}</p>
    <hr style="border: none; border-top: 1px solid #eee; margin: 20px 0;"/>
    <p style="font-size: 12px; color: #999;">DTECNOC — Tecnología e Instalaciones</p>
  </div>
</body>
</html>`;
}

export async function send_supplier_gmail(
  order_id: string,
  supplier_email: string,
  product_name: string,
  quantity: number,
  category: string
): Promise<{
  success: boolean;
  gmail_thread_id?: string;
  error?: string;
  already_sent?: boolean;
}> {
  // Se reserva el hilo ANTES de enviar: SupplierChat.order_id es único, así que de
  // dos mensajes simultáneos solo uno reserva y envía (antes ambos veían "sin chat"
  // y mandaban dos correos al proveedor). Sin gmail_thread_id el cron lo ignora.
  let chatId: string;
  try {
    const chat = await prisma.supplierChat.create({
      data: { order_id, supplier_email, messages_json: [] },
    });
    chatId = chat.id;
  } catch (err) {
    if ((err as { code?: string })?.code === "P2002") {
      return { success: false, already_sent: true };
    }
    return { success: false, error: err instanceof Error ? err.message : String(err) };
  }

  try {
    const subject = `Cotización requerida: ${product_name} [Ref: ${order_id.slice(0, 8)}]`;
    const html = buildSupplierEmailHtml({ product_name, quantity, order_id, category });
    const { threadId } = await sendGmail({ to: supplier_email, subject, html });

    // Track the negotiation thread for admin monitoring
    await prisma.supplierChat.update({
      where: { id: chatId },
      data: { gmail_thread_id: threadId, updated_at: new Date() },
    });

    // Con el estado en el WHERE: nunca retrocede un pedido ya cotizado, en pago o cancelado.
    await prisma.order.updateMany({
      where: { id: order_id, status: { in: QUOTABLE_STATUSES } },
      data: { status: OrderStatus.ESPERANDO_PROVEEDOR, updated_at: new Date() },
    });

    return { success: true, gmail_thread_id: threadId };
  } catch (err) {
    // Si el correo no salió, se libera la reserva para poder reintentar.
    await prisma.supplierChat.deleteMany({ where: { id: chatId, gmail_thread_id: null } }).catch(() => {});
    const msg = err instanceof Error ? err.message : String(err);
    return { success: false, error: msg };
  }
}

export async function find_supplier_chat_by_thread(
  gmail_thread_id: string
): Promise<{
  order_id: string;
  supplier_email: string | null;
  product_id: string | null;
  product_name: string;
  category: string;
} | null> {
  const chat = await prisma.supplierChat.findFirst({
    where: { gmail_thread_id },
    include: {
      order: {
        include: { items: { include: { product: true } } },
      },
    },
  });
  if (!chat) return null;

  const item = chat.order.items[0];
  return {
    order_id: chat.order_id,
    supplier_email: chat.supplier_email,
    product_id: item?.product_id ?? null,
    product_name: item?.product.name ?? "Producto desconocido",
    category: item?.product.category ?? "ACCESORIO",
  };
}
