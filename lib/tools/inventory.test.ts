import { describe, it, expect, vi, beforeEach } from "vitest";
import { OrderStatus } from "@prisma/client";

const findUnique = vi.fn();
const update = vi.fn();

vi.mock("@/lib/prisma", () => ({
  prisma: {
    order: {
      findUnique: (...args: unknown[]) => findUnique(...args),
      update: (...args: unknown[]) => update(...args),
    },
  },
}));

// Import después del mock para que use la versión mockeada de "@/lib/prisma".
const { update_order_status } = await import("./inventory");

describe("update_order_status (STATUS_RANK)", () => {
  beforeEach(() => {
    findUnique.mockReset();
    update.mockReset();
  });

  it("avanza el estado cuando el nuevo rango es mayor (CONSULTANDO → PAGO_PENDIENTE)", async () => {
    findUnique.mockResolvedValue({ status: OrderStatus.CONSULTANDO });
    update.mockResolvedValue({ id: "order-1", status: OrderStatus.PAGO_PENDIENTE });

    const result = await update_order_status("order-1", OrderStatus.PAGO_PENDIENTE);

    expect(update).toHaveBeenCalledTimes(1);
    expect(result).toEqual({
      success: true,
      order_id: "order-1",
      new_status: OrderStatus.PAGO_PENDIENTE,
    });
  });

  it("NO retrocede el estado si el pedido ya avanzó más (PAGO_CONFIRMADO → ESPERANDO_PROVEEDOR)", async () => {
    findUnique.mockResolvedValue({ status: OrderStatus.PAGO_CONFIRMADO });

    const result = await update_order_status(
      "order-1",
      OrderStatus.ESPERANDO_PROVEEDOR
    );

    expect(update).not.toHaveBeenCalled();
    expect(result).toMatchObject({ success: false, skipped: true });
  });

  it("permite quedarse en el mismo estado (no es un retroceso)", async () => {
    findUnique.mockResolvedValue({ status: OrderStatus.COTIZADO });
    update.mockResolvedValue({ id: "order-1", status: OrderStatus.COTIZADO });

    const result = await update_order_status("order-1", OrderStatus.COTIZADO);

    expect(update).toHaveBeenCalledTimes(1);
    expect(result).toMatchObject({ success: true });
  });

  it("adjunta la nota del producto solicitado cuando se pasa requested_product", async () => {
    findUnique.mockResolvedValue({ status: OrderStatus.CONSULTANDO });
    update.mockResolvedValue({ id: "order-1", status: OrderStatus.ESPERANDO_PROVEEDOR });

    await update_order_status(
      "order-1",
      OrderStatus.ESPERANDO_PROVEEDOR,
      "Kit Starlink"
    );

    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          notes: "Cliente solicita: Kit Starlink",
        }),
      })
    );
  });
});
