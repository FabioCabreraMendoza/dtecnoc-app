import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/middleware-auth";

async function handler(_req: NextRequest) {
  const threads = await prisma.supplierChat.findMany({
    orderBy: { updated_at: "desc" },
    include: {
      order: {
        include: {
          client: { select: { name: true } },
          items: {
            include: { product: { select: { name: true, category: true } } },
          },
        },
      },
    },
  });

  return NextResponse.json(
    threads.map((t) => ({
      id: t.id,
      order_id: t.order_id,
      order_status: t.order.status,
      client_name: t.order.client.name,
      product: t.order.items[0]?.product?.name ?? "N/A",
      supplier_email: t.supplier_email,
      gmail_thread_id: t.gmail_thread_id,
      is_resolved: t.is_resolved,
      message_count: Array.isArray(t.messages_json) ? t.messages_json.length : 0,
      updated_at: t.updated_at,
    }))
  );
}

export const GET = requireAdmin(handler);
