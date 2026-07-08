import { z } from "zod";
import { SystemMessage, HumanMessage } from "@langchain/core/messages";
import { fastChat } from "@/lib/llm";
import { get_order_status } from "@/lib/tools/inventory";

export type IntentCategory =
  | "NUEVA_VENTA"
  | "SEGUIMIENTO_VENTA"
  | "FUERA_DE_CONTEXTO";

export interface OrchestratorResult {
  intent: IntentCategory;
  order_id?: string;
  context?: Record<string, unknown>;
}

// §3.7 — Esquema de salida estructurada. El modelo está obligado a devolver
// exactamente una de las categorías; se acabó el JSON.parse frágil.
const IntentSchema = z.object({
  intent: z
    .enum(["NUEVA_VENTA", "SEGUIMIENTO_VENTA", "FUERA_DE_CONTEXTO"])
    .describe("La categoría de intención detectada"),
});

const SYSTEM_PROMPT = `Eres el enrutador de eventos principal de DTECNOC. Tu única responsabilidad es leer el mensaje entrante y el estado en la base de datos para clasificar la intención en UNA de las siguientes categorías exactas:
- NUEVA_VENTA: Cliente escribe por primera vez o consulta un producto.
- SEGUIMIENTO_VENTA: Cliente retoma la conversación sobre un pedido existente.
- FUERA_DE_CONTEXTO: Mensajes no relacionados con la empresa.

No generes texto conversacional. Devuelve únicamente la categoría detectada.`;

export async function orchestratorAgent(
  message: string,
  sender_id: string,
  existing_order_id?: string
): Promise<OrchestratorResult> {
  let orderContext = "";
  if (existing_order_id) {
    const status = await get_order_status(existing_order_id);
    if (!("error" in status)) {
      orderContext = `\nEstado actual del pedido: ${status.status}`;
    }
  }

  const model = fastChat({
    temperature: 0,
    maxTokens: 50,
    cache: true, // §3.8 — clasificación determinista, cacheable
  }).withStructuredOutput(IntentSchema, { name: "clasificar_intencion" });

  try {
    const result = await model.invoke([
      new SystemMessage(SYSTEM_PROMPT),
      new HumanMessage(
        `Mensaje: "${message}"\nSender ID: ${sender_id}${orderContext}`
      ),
    ]);
    return {
      intent: result.intent as IntentCategory,
      order_id: existing_order_id,
    };
  } catch (err) {
    console.error("[orchestratorAgent] error:", err);
    return { intent: "FUERA_DE_CONTEXTO", order_id: existing_order_id };
  }
}
