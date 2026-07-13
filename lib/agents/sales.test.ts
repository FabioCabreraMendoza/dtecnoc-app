import { describe, it, expect } from "vitest";
import { shouldForcePagoPendiente, ensurePaymentInfoShown } from "./sales";
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

describe("ensurePaymentInfoShown", () => {
  const NO_PAYMENT_TEXT =
    "El pedido ha sido registrado con estado PAGO_PENDIENTE. ¡Gracias!";
  const WITH_PAYMENT_TEXT =
    "Aquí tienes los datos de pago: BCP cuenta 123-456789-0-12. ¡Gracias!";

  // Regresión: bug real donde el LLM llamó update_order_status(PAGO_PENDIENTE)
  // directamente (saltándose PASO 5/6) y el cliente nunca recibió los datos de
  // pago, aunque su pedido ya estaba "listo para pagar".
  it("regresión: agrega los datos de pago si el pedido está PAGO_PENDIENTE y la respuesta no los menciona", () => {
    const result = ensurePaymentInfoShown(
      NO_PAYMENT_TEXT,
      OrderStatus.PAGO_PENDIENTE
    );
    expect(result).toContain(NO_PAYMENT_TEXT);
    expect(result).toContain("BCP");
    expect(result).toContain("Interbank");
    expect(result).toContain("YAPE");
  });

  it("no duplica los datos de pago si la respuesta ya los incluye", () => {
    const result = ensurePaymentInfoShown(
      WITH_PAYMENT_TEXT,
      OrderStatus.PAGO_PENDIENTE
    );
    expect(result).toBe(WITH_PAYMENT_TEXT);
  });

  it.each([
    OrderStatus.CONSULTANDO,
    OrderStatus.ESPERANDO_PROVEEDOR,
    OrderStatus.COTIZADO,
    OrderStatus.PAGO_CONFIRMADO,
    OrderStatus.EN_RUTA,
    OrderStatus.COMPLETADO,
    OrderStatus.CANCELADO,
  ])(
    "no agrega nada si el estado no es PAGO_PENDIENTE (%s)",
    (status) => {
      expect(ensurePaymentInfoShown(NO_PAYMENT_TEXT, status)).toBe(
        NO_PAYMENT_TEXT
      );
    }
  );
});
