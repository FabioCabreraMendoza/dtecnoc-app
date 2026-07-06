import { tool } from "@langchain/core/tools";
import { z } from "zod";
import { OrderStatus } from "@prisma/client";
import {
  find_and_add_product,
  update_order_status,
} from "@/lib/tools/inventory";

/**
 * §3.4 — Especificación de herramientas (tools).
 * Cada tool envuelve una función de dominio ya existente y expone un docstring
 * (description) + esquema zod que el modelo lee para decidir cuándo invocarla.
 */

export const findAndAddProductTool = tool(
  async ({ order_id, query }) => {
    const result = await find_and_add_product(order_id, query);
    return JSON.stringify(result);
  },
  {
    name: "find_and_add_product",
    description:
      "Busca un producto por nombre, verifica su disponibilidad y lo agrega al pedido. " +
      "Úsala solo cuando el cliente pregunta por un producto que aún no está en el pedido. " +
      "Nunca la uses si el cliente solo confirma interés ('sí', 'quiero', 'acepto').",
    schema: z.object({
      order_id: z.string().describe("ID del pedido actual"),
      query: z
        .string()
        .describe("Nombre o descripción del producto que busca el cliente"),
    }),
  }
);

export const updateOrderStatusTool = tool(
  async ({ order_id, status, requested_product }) => {
    const result = await update_order_status(
      order_id,
      status as OrderStatus,
      requested_product
    );
    return JSON.stringify(result);
  },
  {
    name: "update_order_status",
    description:
      "Actualiza el estado del pedido. Solo permite ESPERANDO_PROVEEDOR (producto sin " +
      "stock o fuera de catálogo) o PAGO_PENDIENTE (cliente listo para pagar, datos completos).",
    schema: z.object({
      order_id: z.string(),
      status: z.enum([
        OrderStatus.ESPERANDO_PROVEEDOR,
        OrderStatus.PAGO_PENDIENTE,
      ]),
      requested_product: z
        .string()
        .optional()
        .describe(
          "Nombre exacto del producto solicitado. Obligatorio cuando find_and_add_product " +
            "devolvió error (producto no en catálogo) y se pasa a ESPERANDO_PROVEEDOR."
        ),
    }),
  }
);
