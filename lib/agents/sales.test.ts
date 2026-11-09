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

  // Regresión (visto en producción): cada "ya pagué" en PAGO_PENDIENTE volvía a
  // pegar el bloque de pago completo, contradiciendo "hemos registrado tu aviso".
  it("regresión: no repite los datos de pago si el pedido ya estaba en PAGO_PENDIENTE al inicio del turno", () => {
    const reply = "¡Gracias! Hemos registrado tu aviso. El administrador verificará tu depósito.";
    expect(
      ensurePaymentInfoShown(reply, OrderStatus.PAGO_PENDIENTE, OrderStatus.PAGO_PENDIENTE)
    ).toBe(reply);
  });

  it("agrega los datos si el pedido llegó a PAGO_PENDIENTE en este turno (venía de CONSULTANDO)", () => {
    const result = ensurePaymentInfoShown(
      NO_PAYMENT_TEXT,
      OrderStatus.PAGO_PENDIENTE,
      OrderStatus.CONSULTANDO
    );
    expect(result).toContain("BCP");
  });

  it("incluye el total a pagar cuando se conoce", () => {
    const result = ensurePaymentInfoShown(
      NO_PAYMENT_TEXT,
      OrderStatus.PAGO_PENDIENTE,
      OrderStatus.CONSULTANDO,
      "120.5"
    );
    expect(result).toContain("Total a pagar: S/ 120.5");
    expect(result.indexOf("Total a pagar")).toBeLessThan(result.indexOf("BCP"));
  });

  it("sin total conocido no agrega la línea de total", () => {
    const result = ensurePaymentInfoShown(
      NO_PAYMENT_TEXT,
      OrderStatus.PAGO_PENDIENTE,
      OrderStatus.CONSULTANDO,
      null
    );
    expect(result).not.toContain("Total a pagar");
  });

  it("regresión: no duplica la frase de cierre si la respuesta ya la traía", () => {
    const closing = "Avísanos cuando hayas realizado el depósito. ¡Muchas gracias! 😊";
    const result = ensurePaymentInfoShown(
      `Listo, tu pedido está en pago.\n\n${closing}`,
      OrderStatus.PAGO_PENDIENTE,
      OrderStatus.CONSULTANDO
    );
    expect(result.split(closing)).toHaveLength(2); // aparece exactamente una vez
    expect(result.endsWith(closing)).toBe(true);
    expect(result).toContain("BCP");
  });

  it("si la respuesta era solo la frase de cierre, no deja un encabezado vacío", () => {
    const closing = "Avísanos cuando hayas realizado el depósito. ¡Muchas gracias! 😊";
    const result = ensurePaymentInfoShown(closing, OrderStatus.PAGO_PENDIENTE, OrderStatus.CONSULTANDO);
    expect(result.startsWith("Aquí tienes los datos de pago:")).toBe(true);
    expect(result.split(closing)).toHaveLength(2);
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
