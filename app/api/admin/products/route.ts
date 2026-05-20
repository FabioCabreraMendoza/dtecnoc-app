import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/middleware-auth";
import { ProductCategory } from "@prisma/client";

async function getHandler(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const category = searchParams.get("category") as ProductCategory | null;
  const active_only = searchParams.get("active") !== "false";

  const products = await prisma.product.findMany({
    where: {
      ...(category ? { category } : {}),
      ...(active_only ? { is_active: true } : {}),
    },
    orderBy: { name: "asc" },
  });

  return NextResponse.json(products);
}

async function postHandler(req: NextRequest) {
  const body = await req.json();
  const { name, description, category, selling_price, cost_price, stock_quantity, min_threshold } = body;

  if (!name || !category) {
    return NextResponse.json(
      { error: "name y category son requeridos" },
      { status: 400 }
    );
  }

  const product = await prisma.product.create({
    data: {
      name,
      description,
      category: category as ProductCategory,
      selling_price: selling_price ? parseFloat(selling_price) : null,
      cost_price: cost_price ? parseFloat(cost_price) : null,
      stock_quantity: stock_quantity ?? 0,
      min_threshold: min_threshold ?? 2,
    },
  });

  return NextResponse.json(product, { status: 201 });
}

export const GET = requireAdmin(getHandler);
export const POST = requireAdmin(postHandler);
