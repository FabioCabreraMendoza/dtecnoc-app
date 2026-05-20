import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/middleware-auth";
import { OrderStatus } from "@prisma/client";

const ALLOWED_TRANSITIONS: Partial<Record<OrderStatus, OrderStatus[]>> = {
  CONSULTANDO: [OrderStatus.CANCELADO],
  ESPERANDO_PROVEEDOR: [OrderStatus.COTIZADO, OrderStatus.CANCELADO],
  COTIZADO: [OrderStatus.PAGO_PENDIENTE, OrderStatus.CANCELADO],
  PAGO_PENDIENTE: [OrderStatus.PAGO_CONFIRMADO, OrderStatus.CANCELADO],
  PAGO_CONFIRMADO: [OrderStatus.EN_RUTA, OrderStatus.CANCELADO],
  EN_RUTA: [OrderStatus.COMPLETADO, OrderStatus.CANCELADO],
};

async function patchHandler(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> }
) {
  const { id } = await ctx.params;
  const body = await req.json();
  const { status, notes, total_price } = body as { status?: string; notes?: string; total_price?: string };

  const order = await prisma.order.findUnique({ where: { id } });
  if (!order) {
    return NextResponse.json({ error: "Pedido no encontrado" }, { status: 404 });
  }

  if (status) {
    const allowed = ALLOWED_TRANSITIONS[order.status] ?? [];
    if (!allowed.includes(status as OrderStatus)) {
      return NextResponse.json(
        { error: `Transición no permitida: ${order.status} → ${status}` },
        { status: 400 }
      );
    }
  }

  const updated = await prisma.order.update({
    where: { id },
    data: {
      ...(status ? { status: status as OrderStatus } : {}),
      ...(notes !== undefined ? { notes } : {}),
      ...(total_price !== undefined ? { total_price: parseFloat(total_price) } : {}),
      updated_at: new Date(),
    },
  });

  return NextResponse.json({ success: true, order_id: updated.id, status: updated.status });
}

export const PATCH = requireAdmin(patchHandler as Parameters<typeof requireAdmin>[0]);
