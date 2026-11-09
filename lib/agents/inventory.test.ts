import { describe, it, expect, vi, beforeEach } from "vitest";
import { OrderStatus } from "@prisma/client";

const orderFindUnique = vi.fn();
const chatFindUnique = vi.fn();
const readDbStock = vi.fn();
const sendSupplierGmail = vi.fn();

vi.mock("@/lib/prisma", () => ({
  prisma: {
    order: { findUnique: (...a: unknown[]) => orderFindUnique(...a) },
    supplierChat: { findUnique: (...a: unknown[]) => chatFindUnique(...a) },
  },
}));
vi.mock("@/lib/tools/inventory", () => ({
  read_db_stock: (...a: unknown[]) => readDbStock(...a),
}));
vi.mock("@/lib/tools/gmail-tools", () => ({
  send_supplier_gmail: (...a: unknown[]) => sendSupplierGmail(...a),
}));

const { inventoryAgent } = await import("./inventory");

const stock = (over: Record<string, unknown>) => ({
  product_id: "p1",
  name: "Xiaomi Redmi Note 13",
  category: "SMARTPHONE",
  stock_quantity: 4,
  min_threshold: 2,
  needs_restock: false,
  is_just_in_time: false,
  ...over,
});

describe("inventoryAgent", () => {
  beforeEach(() => {
    for (const m of [orderFindUnique, chatFindUnique, readDbStock, sendSupplierGmail]) m.mockReset();
    chatFindUnique.mockResolvedValue(null);
    sendSupplierGmail.mockResolvedValue({ success: true, gmail_thread_id: "t1" });
  });

  it.each([
    OrderStatus.COTIZADO,
    OrderStatus.PAGO_PENDIENTE,
    OrderStatus.COMPLETADO,
    OrderStatus.CANCELADO,
  ])("regresión: no consulta al proveedor si el pedido está en %s", async (status) => {
    orderFindUnique.mockResolvedValue({ status, notes: null });
    readDbStock.mockResolvedValue(stock({ stock_quantity: 0, needs_restock: true, is_just_in_time: true }));

    const r = await inventoryAgent("o1", "p1");

    expect(r.action).toBe("OK");
    expect(sendSupplierGmail).not.toHaveBeenCalled();
  });

  it("regresión: con stock bajo pero > 0 no pide cotización (ventas ya dio el precio de catálogo)", async () => {
    orderFindUnique.mockResolvedValue({ status: OrderStatus.CONSULTANDO, notes: null });
    readDbStock.mockResolvedValue(stock({ stock_quantity: 2, needs_restock: true }));

    const r = await inventoryAgent("o1", "p1");

    expect(r.action).toBe("OK");
    expect(sendSupplierGmail).not.toHaveBeenCalled();
  });

  it("con stock 0 pide cotización al proveedor", async () => {
    orderFindUnique.mockResolvedValue({ status: OrderStatus.ESPERANDO_PROVEEDOR, notes: null });
    readDbStock.mockResolvedValue(stock({ stock_quantity: 0, needs_restock: true, is_just_in_time: true }));

    const r = await inventoryAgent("o1", "p1");

    expect(r).toEqual({ action: "RESTOCK_TRIGGERED", gmail_thread_id: "t1" });
    expect(sendSupplierGmail).toHaveBeenCalledWith("o1", expect.any(String), "Xiaomi Redmi Note 13", 1, "SMARTPHONE");
  });

  it("producto fuera de catálogo: pide cotización por el nombre de las notas", async () => {
    orderFindUnique.mockResolvedValue({
      status: OrderStatus.ESPERANDO_PROVEEDOR,
      notes: "Cliente solicita: iPhone 15",
    });

    const r = await inventoryAgent("o1", null);

    expect(r.action).toBe("RESTOCK_TRIGGERED");
    expect(sendSupplierGmail).toHaveBeenCalledWith("o1", expect.any(String), "iPhone 15", 1, "SMARTPHONE");
  });

  it("si otro mensaje simultáneo ya reservó el hilo, no envía un segundo correo", async () => {
    orderFindUnique.mockResolvedValue({ status: OrderStatus.ESPERANDO_PROVEEDOR, notes: null });
    readDbStock.mockResolvedValue(stock({ stock_quantity: 0, is_just_in_time: true }));
    sendSupplierGmail.mockResolvedValue({ success: false, already_sent: true });

    const r = await inventoryAgent("o1", "p1");

    expect(r.action).toBe("EMAIL_ALREADY_SENT");
  });

  it("devuelve ALREADY_QUOTED si el hilo ya está resuelto", async () => {
    orderFindUnique.mockResolvedValue({ status: OrderStatus.ESPERANDO_PROVEEDOR, notes: null });
    readDbStock.mockResolvedValue(stock({ stock_quantity: 0, is_just_in_time: true }));
    chatFindUnique.mockResolvedValue({ is_resolved: true });

    expect((await inventoryAgent("o1", "p1")).action).toBe("ALREADY_QUOTED");
    expect(sendSupplierGmail).not.toHaveBeenCalled();
  });
});
