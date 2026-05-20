import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { salesAgent } from "@/lib/agents/sales";
import { inventoryAgent } from "@/lib/agents/inventory";
import { logisticsAgent } from "@/lib/agents/logistics";
import { OrderStatus, Prisma } from "@prisma/client";

// GET: retrieve conversation history by session_id
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const session_id = searchParams.get("session_id");

  if (!session_id) {
    return NextResponse.json({ error: "session_id requerido" }, { status: 400 });
  }

  const conv = await prisma.clientConversation.findUnique({
    where: { session_id },
    include: {
      order: {
        select: {
          id: true,
          status: true,
          total_price: true,
          updated_at: true,
          items: { include: { product: { select: { name: true, category: true } } } },
        },
      },
    },
  });

  if (!conv) {
    return NextResponse.json({ messages: [], order_status: null });
  }

  return NextResponse.json({
    messages: conv.messages_json,
    order_status: conv.order?.status ?? null,
    total_price: conv.order?.total_price?.toString() ?? null,
    order_id: conv.order?.id ?? null,
    order_updated_at: conv.order?.updated_at?.toISOString() ?? null,
    order_items: conv.order?.items.map((i) => i.product.name) ?? [],
  });
}

// POST: send a message and get SalesAgent response
export async function POST(req: NextRequest) {
  try {
    const { session_id, message, client_name } = await req.json();

    if (!session_id || !message) {
      return NextResponse.json(
        { error: "session_id y message requeridos" },
        { status: 400 }
      );
    }

    // Get or create conversation
    let conv = await prisma.clientConversation.findUnique({ where: { session_id } });

    if (!conv) {
      conv = await prisma.clientConversation.create({
        data: {
          session_id,
          client_name: client_name ?? "Cliente",
          messages_json: [
            {
              role: "assistant",
              content:
                "¡Hola! Soy el asistente de DTECNOC 😊 Ofrecemos smartphones, tablets, cámaras de seguridad, antenas Starlink, kits DirecTV, paneles solares y accesorios. ¿En qué puedo ayudarte?",
              timestamp: new Date().toISOString(),
            },
          ],
        },
      });
    }

    // Ensure there's an order linked to this conversation
    let order_id = conv.order_id;
    if (!order_id) {
      // Find or create a User for this session
      const user = await prisma.user.upsert({
        where: { platform_id: `web_${session_id}` },
        update: {},
        create: {
          platform_id: `web_${session_id}`,
          name: client_name ?? "Cliente Web",
          role: "CLIENTE",
        },
      });

      const order = await prisma.order.create({
        data: { client_id: user.id, status: OrderStatus.CONSULTANDO },
      });

      order_id = order.id;
      await prisma.clientConversation.update({
        where: { id: conv.id },
        data: { order_id, client_name: client_name ?? conv.client_name },
      });
    }

    // Append user message to conversation
    const currentMessages = (conv.messages_json as Array<Record<string, unknown>>) ?? [];
    const userMsg = {
      role: "user" as const,
      content: message,
      timestamp: new Date().toISOString(),
    };

    await prisma.clientConversation.update({
      where: { id: conv.id },
      data: {
        messages_json: [...currentMessages, userMsg] as unknown as Prisma.InputJsonValue,
        updated_at: new Date(),
      },
    });

    // Fetch current order state to decide which agent to invoke
    const order = await prisma.order.findUnique({
      where: { id: order_id },
      include: { items: true },
    });

    let finalResponse = "";

    // LogisticsAgent handles post-payment coordination
    if (
      order?.status === OrderStatus.PAGO_CONFIRMADO ||
      order?.status === OrderStatus.EN_RUTA
    ) {
      finalResponse = await logisticsAgent(message, order_id);
    } else {
      // SalesAgent + InventoryAgent for pre-payment flow
      const chatHistory = (currentMessages as Array<{ role: string; content: string }>)
        .filter((m) => m.role === "user" || m.role === "assistant")
        .map((m) => ({ role: m.role as "user" | "assistant", content: m.content }));
      const agentResponse = await salesAgent(message, order_id, chatHistory);

      // Re-fetch order after SalesAgent — it may have added items or changed status
      const updatedOrder = await prisma.order.findUnique({
        where: { id: order_id },
        include: { items: true },
      });

      let inventoryAction = "OK";
      if (updatedOrder?.items.length) {
        for (const item of updatedOrder.items) {
          console.log(`[inventory] checking product ${item.product_id} for order ${order_id}`);
          const invResult = await inventoryAgent(order_id, item.product_id);
          console.log(`[inventory] action=${invResult.action}`, invResult.gmail_thread_id ?? "");
          if (invResult.action !== "OK") {
            inventoryAction = invResult.action;
            break;
          }
        }
      } else if (updatedOrder?.status === OrderStatus.ESPERANDO_PROVEEDOR) {
        // No catalog product added — custom product stored in order notes
        console.log(`[inventory] no items but ESPERANDO_PROVEEDOR, checking order notes`);
        const invResult = await inventoryAgent(order_id, null);
        inventoryAction = invResult.action;
        console.log(`[inventory] action=${inventoryAction}`, invResult.gmail_thread_id ?? "");
      } else {
        console.log(`[inventory] no items on order ${order_id}, skipping`);
      }

      finalResponse =
        inventoryAction === "RESTOCK_TRIGGERED"
          ? "Permíteme verificar la disponibilidad con nuestro equipo de abastecimiento. Te confirmo el precio en breve 😊"
          : agentResponse;
    }

    // Append assistant response
    const assistantMsg = {
      role: "assistant",
      content: finalResponse,
      timestamp: new Date().toISOString(),
    };

    const refreshedConv = await prisma.clientConversation.findUnique({
      where: { id: conv.id },
    });
    const latestMessages =
      (refreshedConv?.messages_json as Array<Record<string, unknown>>) ?? [];

    await prisma.clientConversation.update({
      where: { id: conv.id },
      data: {
        messages_json: [...latestMessages, assistantMsg] as unknown as Prisma.InputJsonValue,
        updated_at: new Date(),
      },
    });

    const finalOrder = await prisma.order.findUnique({
      where: { id: order_id },
      select: {
        status: true,
        total_price: true,
        updated_at: true,
        items: { include: { product: { select: { name: true } } } },
      },
    });

    return NextResponse.json({
      response: finalResponse,
      order_status: finalOrder?.status,
      total_price: finalOrder?.total_price?.toString() ?? null,
      order_id,
      order_updated_at: finalOrder?.updated_at?.toISOString() ?? null,
      order_items: finalOrder?.items.map((i) => i.product.name) ?? [],
    });
  } catch (err) {
    console.error("Client chat error:", err);
    return NextResponse.json({ error: "Error procesando mensaje" }, { status: 500 });
  }
}
