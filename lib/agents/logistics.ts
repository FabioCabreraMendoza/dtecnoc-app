import Groq from "groq-sdk";
import { groq, GROQ_MODEL } from "@/lib/groq";
import {
  get_technician_schedule,
  book_installation,
} from "@/lib/tools/logistics";
import { get_order_status } from "@/lib/tools/inventory";

const INSTALLATION_CATEGORIES = ["CAMARA", "KIT_STARLINK", "KIT_DIRECTV", "PANEL_SOLAR", "INSTALACION"];

const SYSTEM_PROMPT = `Eres el coordinador logístico de DTECNOC. Tu objetivo es coordinar la entrega o instalación del pedido.

REGLAS SEGÚN CATEGORÍA DEL PRODUCTO:
- Si la categoría del producto está en [CAMARA, KIT_STARLINK, KIT_DIRECTV, PANEL_SOLAR, INSTALACION]: agenda la instalación con el técnico usando get_technician_schedule y book_installation.
- Si la categoría es cualquier otra (SMARTPHONE, TABLET, ACCESORIO, IMPRESORA, etc.): NO agendes instalación. Solo confirma los datos de envío y dile al cliente que su pedido está siendo preparado para despacho.
- Nunca menciones instalación para productos que no la requieren.
- Usa un tono amable y profesional.`;

const TOOLS: Groq.Chat.ChatCompletionTool[] = [
  {
    type: "function",
    function: {
      name: "get_technician_schedule",
      description: "Obtiene los horarios disponibles del técnico para una fecha",
      parameters: {
        type: "object",
        properties: { date: { type: "string", description: "Fecha en formato YYYY-MM-DD" } },
        required: ["date"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "book_installation",
      description: "Registra y confirma la instalación en el sistema",
      parameters: {
        type: "object",
        properties: {
          order_id: { type: "string" },
          technician_id: { type: "string" },
          client_address: { type: "string" },
          date: { type: "string" },
        },
        required: ["order_id", "technician_id", "client_address", "date"],
      },
    },
  },
];

async function executeTool(name: string, args: Record<string, string>) {
  switch (name) {
    case "get_technician_schedule":
      return get_technician_schedule(args.date);
    case "book_installation":
      return book_installation(args.order_id, args.technician_id, args.client_address, args.date);
    default:
      return { error: "Tool not found" };
  }
}

export async function logisticsAgent(
  message: string,
  order_id: string
): Promise<string> {
  const orderCtx = await get_order_status(order_id);

  // For delivery-only products, skip LLM entirely
  if (!("error" in orderCtx)) {
    const category = (orderCtx.items?.[0] as { category?: string } | undefined)?.category ?? "";
    if (category && !INSTALLATION_CATEGORIES.includes(category)) {
      return "Tu pedido está siendo preparado para despacho. En breve recibirás la confirmación del envío con el número de seguimiento. ¡Gracias por tu compra! 📦";
    }
  }

  const orderInfo =
    "error" in orderCtx ? "" : `\nDetalle del pedido: ${JSON.stringify(orderCtx)}`;

  const messages: Groq.Chat.ChatCompletionMessageParam[] = [
    { role: "system", content: SYSTEM_PROMPT },
    {
      role: "user",
      content: `Mensaje del cliente: "${message}"${orderInfo}\nOrder ID: ${order_id}`,
    },
  ];

  for (let i = 0; i < 3; i++) {
    const completion = await groq.chat.completions.create({
      model: GROQ_MODEL,
      messages,
      tools: TOOLS,
      tool_choice: "auto",
      temperature: 0.6,
      max_tokens: 500,
    });

    const choice = completion.choices[0];
    if (choice.finish_reason === "stop" || !choice.message.tool_calls?.length) {
      return (
        choice.message.content ??
        "Coordinando la instalación. En breve te confirmamos fecha y hora."
      );
    }

    messages.push({
      role: "assistant",
      content: choice.message.content ?? "",
      tool_calls: choice.message.tool_calls,
    });

    for (const call of choice.message.tool_calls) {
      const result = await executeTool(call.function.name, JSON.parse(call.function.arguments));
      messages.push({
        role: "tool",
        tool_call_id: call.id,
        content: JSON.stringify(result),
      });
    }
  }

  return "Coordinando la instalación. En breve te confirmamos fecha y hora.";
}
