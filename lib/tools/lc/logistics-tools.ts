import { tool } from "@langchain/core/tools";
import { z } from "zod";
import {
  get_technician_schedule,
  book_installation,
} from "@/lib/tools/logistics";

/** §3.4 — Herramientas de logística para el agente de coordinación. */

export const getTechnicianScheduleTool = tool(
  async ({ date }) => {
    const result = await get_technician_schedule(date);
    return JSON.stringify(result);
  },
  {
    name: "get_technician_schedule",
    description: "Obtiene los horarios disponibles del técnico para una fecha.",
    schema: z.object({
      date: z.string().describe("Fecha en formato YYYY-MM-DD"),
    }),
  }
);

export const bookInstallationTool = tool(
  async ({ order_id, technician_id, client_address, date }) => {
    const result = await book_installation(
      order_id,
      technician_id,
      client_address,
      date
    );
    return JSON.stringify(result);
  },
  {
    name: "book_installation",
    description: "Registra y confirma la instalación en el sistema (pasa el pedido a EN_RUTA).",
    schema: z.object({
      order_id: z.string(),
      technician_id: z.string(),
      client_address: z.string(),
      date: z.string().describe("Fecha en formato YYYY-MM-DD"),
    }),
  }
);
