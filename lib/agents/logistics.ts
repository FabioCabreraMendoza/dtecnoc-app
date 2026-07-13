import {
  SystemMessage,
  HumanMessage,
  ToolMessage,
  type BaseMessage,
} from "@langchain/core/messages";
import { fastChat } from "@/lib/llm";
import {
  getTechnicianScheduleTool,
  bookInstallationTool,
} from "@/lib/tools/lc/logistics-tools";
import type { StructuredToolInterface } from "@langchain/core/tools";
import { get_order_status } from "@/lib/tools/inventory";
import { toLcMessage, type ChatTurn } from "@/lib/agents/message-utils";

const INSTALLATION_CATEGORIES = [
  "CAMARA",
  "KIT_STARLINK",
  "KIT_DIRECTV",
  "PANEL_SOLAR",
  "INSTALACION",
];

const SYSTEM_PROMPT = `Eres el coordinador logístico de DTECNOC. Tu objetivo es coordinar la entrega o instalación del pedido.

REGLAS SEGÚN CATEGORÍA DEL PRODUCTO:
- Si la categoría del producto está en [CAMARA, KIT_STARLINK, KIT_DIRECTV, PANEL_SOLAR, INSTALACION]: agenda la instalación con el técnico usando get_technician_schedule y book_installation.
- Si la categoría es cualquier otra (SMARTPHONE, TABLET, ACCESORIO, IMPRESORA, etc.): NO agendes instalación. Solo confirma los datos de envío y dile al cliente que su pedido está siendo preparado para despacho.
- Nunca menciones instalación para productos que no la requieren.
- Usa un tono amable y profesional.`;

const TOOLS: StructuredToolInterface[] = [
  getTechnicianScheduleTool,
  bookInstallationTool,
];
const TOOL_MAP: Record<string, StructuredToolInterface> = Object.fromEntries(
  TOOLS.map((t) => [t.name, t])
);

export async function logisticsAgent(
  message: string,
  order_id: string,
  history: ChatTurn[] = []
): Promise<string> {
  const orderCtx = await get_order_status(order_id);

  // Para productos solo-entrega, saltar el LLM por completo (determinista).
  if (!("error" in orderCtx)) {
    const category =
      (orderCtx.items?.[0] as { category?: string } | undefined)?.category ?? "";
    if (category && !INSTALLATION_CATEGORIES.includes(category)) {
      return "Tu pedido está siendo preparado para despacho. En breve recibirás la confirmación del envío con el número de seguimiento. ¡Gracias por tu compra! 📦";
    }
  }

  const orderInfo =
    "error" in orderCtx ? "" : `\nDetalle del pedido: ${JSON.stringify(orderCtx)}`;

  const model = fastChat({ temperature: 0.6, maxTokens: 500 }).bindTools(TOOLS);

  // El historial es imprescindible aquí: coordinar una instalación toma varios
  // turnos (fecha → horario → dirección) y sin memoria de la conversación el
  // agente "olvida" lo que el cliente ya dijo en el turno anterior (bug real
  // detectado en pruebas: preguntó la fecha de nuevo justo después de que el
  // cliente eligiera un horario para la fecha que ya había dado).
  const messages: BaseMessage[] = [
    new SystemMessage(
      `${SYSTEM_PROMPT}\n\nContexto actual:${orderInfo}\nOrder ID: ${order_id}`
    ),
    ...history.slice(-6).map(toLcMessage),
    new HumanMessage(message),
  ];

  for (let i = 0; i < 3; i++) {
    const response = await model.invoke(messages);
    messages.push(response);

    if (!response.tool_calls?.length) {
      return typeof response.content === "string" && response.content.trim()
        ? response.content
        : "Coordinando la instalación. En breve te confirmamos fecha y hora.";
    }

    for (const call of response.tool_calls) {
      const tool = TOOL_MAP[call.name];
      const output = tool
        ? ((await tool.invoke(call.args)) as string)
        : JSON.stringify({ error: "Tool not found" });
      messages.push(
        new ToolMessage({ content: output, tool_call_id: call.id ?? call.name })
      );
    }
  }

  return "Coordinando la instalación. En breve te confirmamos fecha y hora.";
}
