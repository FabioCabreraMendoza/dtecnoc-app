import { describe, it, expect, vi, beforeEach } from "vitest";
import { OrderStatus } from "@prisma/client";

const chatCreate = vi.fn();
const chatUpdate = vi.fn();
const chatDeleteMany = vi.fn();
const orderUpdateMany = vi.fn();
const sendGmail = vi.fn();

vi.mock("@/lib/prisma", () => ({
  prisma: {
    supplierChat: {
      create: (...a: unknown[]) => chatCreate(...a),
      update: (...a: unknown[]) => chatUpdate(...a),
      deleteMany: (...a: unknown[]) => chatDeleteMany(...a),
    },
    order: { updateMany: (...a: unknown[]) => orderUpdateMany(...a) },
  },
}));
vi.mock("@/lib/gmail", () => ({ sendGmail: (...a: unknown[]) => sendGmail(...a) }));

const { send_supplier_gmail } = await import("./gmail-tools");

const send = () => send_supplier_gmail("order-12345678", "prov@x.com", "Cable", 1, "ACCESORIO");

describe("send_supplier_gmail", () => {
  beforeEach(() => {
    for (const m of [chatCreate, chatUpdate, chatDeleteMany, orderUpdateMany, sendGmail]) m.mockReset();
    chatCreate.mockResolvedValue({ id: "chat-1" });
    chatUpdate.mockResolvedValue({});
    chatDeleteMany.mockResolvedValue({ count: 1 });
    orderUpdateMany.mockResolvedValue({ count: 1 });
    sendGmail.mockResolvedValue({ messageId: "m1", threadId: "t1" });
  });

  it("reserva el hilo antes de enviar, guarda el threadId y mueve el pedido solo desde estados cotizables", async () => {
    const r = await send();

    expect(r).toEqual({ success: true, gmail_thread_id: "t1" });
    expect(chatCreate.mock.invocationCallOrder[0]).toBeLessThan(sendGmail.mock.invocationCallOrder[0]);
    expect(chatUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "chat-1" }, data: expect.objectContaining({ gmail_thread_id: "t1" }) })
    );
    const { where, data } = orderUpdateMany.mock.calls[0][0];
    expect(data.status).toBe(OrderStatus.ESPERANDO_PROVEEDOR);
    expect(where.status.in).toEqual([OrderStatus.CONSULTANDO, OrderStatus.ESPERANDO_PROVEEDOR]);
  });

  it("regresión: si otro proceso ya reservó el hilo (P2002) no envía un segundo correo", async () => {
    chatCreate.mockRejectedValue({ code: "P2002" });

    const r = await send();

    expect(r).toEqual({ success: false, already_sent: true });
    expect(sendGmail).not.toHaveBeenCalled();
  });

  it("si el correo falla libera la reserva para poder reintentar", async () => {
    sendGmail.mockRejectedValue(new Error("gmail caído"));

    const r = await send();

    expect(r).toMatchObject({ success: false, error: "gmail caído" });
    expect(chatDeleteMany).toHaveBeenCalledWith({ where: { id: "chat-1", gmail_thread_id: null } });
  });
});
