import { describe, it, expect, vi, beforeEach } from "vitest";
import { OrderStatus } from "@prisma/client";

const chatFindUnique = vi.fn();
const chatUpdate = vi.fn();
const orderUpdate = vi.fn();
const orderUpdateMany = vi.fn();
const convFindFirst = vi.fn();
const convUpdate = vi.fn();
const productUpdate = vi.fn();

vi.mock("@/lib/prisma", () => ({
  prisma: {
    supplierChat: {
      findUnique: (...a: unknown[]) => chatFindUnique(...a),
      update: (...a: unknown[]) => chatUpdate(...a),
    },
    order: {
      update: (...a: unknown[]) => orderUpdate(...a),
      updateMany: (...a: unknown[]) => orderUpdateMany(...a),
    },
    clientConversation: {
      findFirst: (...a: unknown[]) => convFindFirst(...a),
      update: (...a: unknown[]) => convUpdate(...a),
    },
    product: { update: (...a: unknown[]) => productUpdate(...a) },
  },
}));

const { supplierAgent } = await import("./supplier");

function chatWith(status: OrderStatus, is_resolved = false) {
  return {
    order_id: "o1",
    is_resolved,
    messages_json: [],
    order: {
      status,
      notes: "Cliente solicita: Cable USB-C",
      items: [],
    },
  };
}

describe("supplierAgent — idempotencia y guarda de estado", () => {
  beforeEach(() => {
    for (const m of [chatFindUnique, chatUpdate, orderUpdate, orderUpdateMany, convFindFirst, convUpdate, productUpdate]) {
      m.mockReset();
    }
    chatUpdate.mockResolvedValue({});
    orderUpdate.mockResolvedValue({});
    convFindFirst.mockResolvedValue(null);
  });

  it("regresión: ignora una respuesta si el hilo ya estaba resuelto", async () => {
    chatFindUnique.mockResolvedValue(chatWith(OrderStatus.COTIZADO, true));

    const r = await supplierAgent("o1", "Ok, entrega en 120 horas", "t1");

    expect(r.order_now_cotizado).toBe(false);
    expect(orderUpdateMany).not.toHaveBeenCalled();
    expect(orderUpdate).not.toHaveBeenCalled();
  });

  it("regresión: no re-cotiza un pedido que ya avanzó y cierra el hilo", async () => {
    chatFindUnique.mockResolvedValue(chatWith(OrderStatus.PAGO_PENDIENTE));

    const r = await supplierAgent("o1", "Precio S/ 80", "t1");

    expect(r.order_now_cotizado).toBe(false);
    expect(orderUpdateMany).not.toHaveBeenCalled();
    expect(chatUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ is_resolved: true }) })
    );
  });

  it("cotiza un pedido ESPERANDO_PROVEEDOR con precio bajo (S/ 80)", async () => {
    chatFindUnique.mockResolvedValue(chatWith(OrderStatus.ESPERANDO_PROVEEDOR));
    orderUpdateMany.mockResolvedValue({ count: 1 });

    const r = await supplierAgent("o1", "Precio S/ 80", "t1");

    expect(r.order_now_cotizado).toBe(true);
    expect(orderUpdateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ id: "o1" }),
        data: expect.objectContaining({ status: OrderStatus.COTIZADO }),
      })
    );
  });

  it("si otro proceso ganó la carrera (count 0) no escribe nada más ni avisa al cliente", async () => {
    chatFindUnique.mockResolvedValue(chatWith(OrderStatus.ESPERANDO_PROVEEDOR));
    orderUpdateMany.mockResolvedValue({ count: 0 });

    const r = await supplierAgent("o1", "Precio S/ 80", "t1");

    expect(r.order_now_cotizado).toBe(false);
    expect(orderUpdate).not.toHaveBeenCalled();
    expect(convUpdate).not.toHaveBeenCalled();
  });
});
