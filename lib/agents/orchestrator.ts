import { groq, GROQ_MODEL } from "@/lib/groq";
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

const SYSTEM_PROMPT = `Eres el enrutador de eventos principal de DTECNOC. Tu única responsabilidad es leer el mensaje entrante y el estado en la base de datos para clasificar la intención en UNA de las siguientes categorías exactas:
- NUEVA_VENTA: Cliente escribe por primera vez o consulta un producto.
- SEGUIMIENTO_VENTA: Cliente retoma la conversación sobre un pedido existente.
- FUERA_DE_CONTEXTO: Mensajes no relacionados con la empresa.

No generes texto conversacional. Devuelve ÚNICAMENTE la categoría detectada en formato JSON: {"intent": "CATEGORIA"}`;

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

  const completion = await groq.chat.completions.create({
    model: GROQ_MODEL,
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      {
        role: "user",
        content: `Mensaje: "${message}"\nSender ID: ${sender_id}${orderContext}`,
      },
    ],
    temperature: 0,
    max_tokens: 50,
    response_format: { type: "json_object" },
  });

  try {
    const result = JSON.parse(
      completion.choices[0].message.content ?? '{"intent":"FUERA_DE_CONTEXTO"}'
    );
    return {
      intent: result.intent as IntentCategory,
      order_id: existing_order_id,
    };
  } catch {
    return { intent: "FUERA_DE_CONTEXTO" };
  }
}
