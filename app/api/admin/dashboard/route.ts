import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/middleware-auth";
import { OrderStatus } from "@prisma/client";

async function handler(_req: NextRequest) {
  const [
    total_orders,
    waiting_supplier,
    cotizados,
    completed,
    recent_orders,
    low_stock_products,
  ] = await Promise.all([
    prisma.order.count(),
    prisma.order.count({ where: { status: OrderStatus.ESPERANDO_PROVEEDOR } }),
    prisma.order.count({ where: { status: OrderStatus.COTIZADO } }),
    prisma.order.count({ where: { status: OrderStatus.COMPLETADO } }),
    prisma.order.findMany({
      take: 10,
      orderBy: { updated_at: "desc" },
      include: {
        client: { select: { name: true, platform_id: true } },
        items: { include: { product: { select: { name: true } } } },
      },
    }),
    prisma.$queryRaw`
      SELECT id, name, category, stock_quantity, min_threshold
      FROM "Product"
      WHERE is_active = true AND stock_quantity <= min_threshold
      LIMIT 5
    `.catch(() => []),
  ]);

  return NextResponse.json({
    kpis: {
      total_orders,
      waiting_supplier,
      cotizados,
      completed,
      conversion_rate:
        total_orders > 0
          ? Math.round((completed / total_orders) * 100)
          : 0,
    },
    recent_orders: recent_orders.map((o) => ({
      id: o.id,
      client_name: o.client.name,
      status: o.status,
      total_price: o.total_price?.toString() ?? null,
      product: o.items[0]?.product.name ?? "N/A",
      updated_at: o.updated_at,
    })),
    low_stock_products,
  });
}

export const GET = requireAdmin(handler);
