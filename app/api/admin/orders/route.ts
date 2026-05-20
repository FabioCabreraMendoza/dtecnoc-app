import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/middleware-auth";
import { OrderStatus } from "@prisma/client";

async function handler(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const status = searchParams.get("status") as OrderStatus | null;

  const orders = await prisma.order.findMany({
    where: status ? { status } : {},
    orderBy: { updated_at: "desc" },
    include: {
      client: { select: { name: true, platform_id: true, role: true } },
      items: {
        include: {
          product: {
            select: { name: true, category: true, selling_price: true },
          },
        },
      },
      chat_thread: {
        select: { id: true, is_resolved: true, updated_at: true },
      },
    },
  });

  return NextResponse.json(orders);
}

export const GET = requireAdmin(handler);
