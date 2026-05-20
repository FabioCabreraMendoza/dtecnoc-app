import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/middleware-auth";

async function getHandler(_req: NextRequest) {
  const docs = await prisma.embeddingDocument.findMany({
    where: {
      NOT: { metadata_json: { path: ["type"], equals: "gmail_history_id" } },
    },
    orderBy: { updated_at: "desc" },
    select: { id: true, content: true, metadata_json: true, created_at: true, updated_at: true },
  });
  return NextResponse.json(docs);
}

async function postHandler(req: NextRequest) {
  const { content, title, category } = await req.json();

  if (!content?.trim()) {
    return NextResponse.json({ error: "content es requerido" }, { status: 400 });
  }

  const doc = await prisma.embeddingDocument.create({
    data: {
      content: content.trim(),
      metadata_json: { title: title ?? "Sin título", category: category ?? "general" },
    },
  });

  return NextResponse.json(doc, { status: 201 });
}

async function deleteHandler(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const id = searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id requerido" }, { status: 400 });

  await prisma.embeddingDocument.delete({ where: { id } });
  return NextResponse.json({ success: true });
}

export const GET = requireAdmin(getHandler);
export const POST = requireAdmin(postHandler);
export const DELETE = requireAdmin(deleteHandler);
