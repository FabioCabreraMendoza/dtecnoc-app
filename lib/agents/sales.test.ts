import { describe, it, expect } from "vitest";
import { shouldForcePagoPendiente } from "./sales";
import { OrderStatus } from "@prisma/client";

describe("shouldForcePagoPendiente", () => {
  const PAYMENT_TEXT =
    "Aquí te comparto los datos de pago: BCP cuenta 123-456789-0-12.";
  const NO_PAYMENT_TEXT = "¿En qué más puedo ayudarte?";

  it.each([
    OrderStatus.CONSULTANDO,
    OrderStatus.ESPERANDO_PROVEEDOR,
    OrderStatus.COTIZADO,
  ])(
    "dispara PAGO_PENDIENTE cuando el estado es %s y la respuesta comparte datos de pago",
    (status) => {
      expect(shouldForcePagoPendiente(status, PAYMENT_TEXT)).toBe(true);
    }
  );

  it.each([
    OrderStatus.PAGO_PENDIENTE,
    OrderStatus.PAGO_CONFIRMADO,
    OrderStatus.EN_RUTA,
    OrderStatus.COMPLETADO,
    OrderStatus.CANCELADO,
  ])(
    "NO dispara de nuevo cuando el estado ya pasó la etapa de pago (%s)",
    (status) => {
      expect(shouldForcePagoPendiente(status, PAYMENT_TEXT)).toBe(false);
    }
  );

  it("no dispara si la respuesta no menciona datos de pago", () => {
    expect(shouldForcePagoPendiente(OrderStatus.CONSULTANDO, NO_PAYMENT_TEXT)).toBe(
      false
    );
  });

  it("reconoce Interbank y YAPE además de BCP", () => {
    expect(
      shouldForcePagoPendiente(OrderStatus.COTIZADO, "Cuenta Interbank: 200-300...")
    ).toBe(true);
    expect(
      shouldForcePagoPendiente(OrderStatus.COTIZADO, "YAPE al 987-654-321")
    ).toBe(true);
  });

  // Regresión: bug real donde el guardrail solo miraba COTIZADO y nunca
  // disparaba para la compra directa de un producto en stock (CONSULTANDO).
  it("regresión: compra directa (CONSULTANDO) con datos de pago compartidos", () => {
    expect(shouldForcePagoPendiente(OrderStatus.CONSULTANDO, PAYMENT_TEXT)).toBe(
      true
    );
  });
});
