import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/middleware-auth";
import { ProductCategory } from "@prisma/client";

async function patchHandler(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> }
) {
  const { id } = await ctx.params;
  const body = await req.json();

  const product = await prisma.product.update({
    where: { id },
    data: {
      ...(body.name !== undefined ? { name: body.name } : {}),
      ...(body.description !== undefined ? { description: body.description } : {}),
      ...(body.category !== undefined ? { category: body.category as ProductCategory } : {}),
      ...(body.selling_price !== undefined
        ? { selling_price: body.selling_price ? parseFloat(body.selling_price) : null }
        : {}),
      ...(body.cost_price !== undefined
        ? { cost_price: body.cost_price ? parseFloat(body.cost_price) : null }
        : {}),
      ...(body.stock_quantity !== undefined
        ? { stock_quantity: parseInt(body.stock_quantity) }
        : {}),
      ...(body.min_threshold !== undefined
        ? { min_threshold: parseInt(body.min_threshold) }
        : {}),
      ...(body.is_active !== undefined ? { is_active: body.is_active } : {}),
    },
  });

  return NextResponse.json(product);
}

async function deleteHandler(
  _req: NextRequest,
  ctx: { params: Promise<{ id: string }> }
) {
  const { id } = await ctx.params;
  await prisma.product.update({
    where: { id },
    data: { is_active: false },
  });
  return NextResponse.json({ success: true });
}

export const PATCH = requireAdmin(patchHandler as Parameters<typeof requireAdmin>[0]);
export const DELETE = requireAdmin(deleteHandler as Parameters<typeof requireAdmin>[0]);
