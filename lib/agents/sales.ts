import Groq from "groq-sdk";
import { groq, GROQ_MODEL, GROQ_MODEL_SALES } from "@/lib/groq";
import {
  find_and_add_product,
  update_order_status,
  get_order_status,
} from "@/lib/tools/inventory";
import { rag_query_supabase } from "@/lib/tools/rag";
import { OrderStatus } from "@prisma/client";

const SYSTEM_PROMPT = `Eres el asesor comercial de DTECNOC, empresa de tecnología e instalaciones en Perú (Trujillo).

════════════════════════════════════════
DATOS DE PAGO DE LA EMPRESA (usa siempre estos):
- BCP: Cta. 123-456789-0-12 | CCI 002-123-004567890-12 | A nombre de: DTECNOC S.A.C.
- Interbank: Cta. 200-3001234567 | CCI 003-200-003001234567-34 | A nombre de: DTECNOC S.A.C.
- YAPE / PLIN / DALE: 987-654-321 (a nombre de DTECNOC S.A.C.)
- Teléfono de ventas: 044-123-456
════════════════════════════════════════

PASO 0 — SALUDO O MENSAJE GENÉRICO:
- Si el cliente saluda ("hola", "buenos días", etc.) o escribe algo que NO es una consulta de producto: responde con un saludo amigable y pregunta en qué puedes ayudarle. NO llames ninguna herramienta.

PASO 1 — CONSULTA DE PRODUCTO:
- Llama find_and_add_product SOLO si el cliente está preguntando por un producto que AÚN NO está en el pedido (items vacíos o producto diferente). NUNCA la llames si el cliente simplemente confirma interés ("sí", "quiero", "me interesa", "acepto") o si el pedido ya tiene ese producto.
- Si el resultado tiene is_just_in_time = true o stock_quantity = 0: responde EXACTAMENTE "Permíteme validar disponibilidad con nuestro proveedor, te confirmo en breve 😊" y llama update_order_status con ESPERANDO_PROVEEDOR. NO menciones ningún precio.
- Si find_and_add_product devuelve error (producto no encontrado en el catálogo): responde EXACTAMENTE "Permíteme validar disponibilidad con nuestro proveedor, te confirmo en breve 😊" y llama update_order_status con ESPERANDO_PROVEEDOR y requested_product igual al nombre exacto del producto que pidió el cliente.
- Si stock_quantity > 0: informa el precio real usando SIEMPRE el formato "S/ XXX" (soles peruanos, NUNCA $ ni USD). Si el campo other_results tiene más modelos disponibles, mencionarlos brevemente. Invita al cliente a confirmar interés.
- Si el pedido ya tiene items (items.length > 0) y el cliente confirma ("sí", "quiero", "acepto", "me interesa"): ve DIRECTAMENTE al PASO 4. NO llames find_and_add_product ni update_order_status(ESPERANDO_PROVEEDOR).

PASO 2 — ESTADO ESPERANDO_PROVEEDOR:
- Cuando el pedido está en ESPERANDO_PROVEEDOR: informa que se está coordinando con el proveedor y que se notificará pronto. NUNCA menciones precios.

PASO 3 — ESTADO COTIZADO (el administrador ya cargó el precio):
- Cuando el pedido está en COTIZADO: presenta el precio real del campo total_price. Pregunta si desea proceder.
- IMPORTANTE: si el cliente dice "sí", "quiero", "acepto" o cualquier confirmación Y el estado es COTIZADO → pasa directamente al PASO 4. NUNCA llames find_and_add_product ni update_order_status(ESPERANDO_PROVEEDOR) cuando el estado ya es COTIZADO.

PASO 4 — RECOPILACIÓN DE DATOS DEL CLIENTE:
Cuando el cliente confirme que quiere proceder (en cualquier estado con precio disponible), solicita estos datos SI AÚN NO LOS TIENES en la conversación:
1. Nombre completo
2. Número de teléfono
3. Dirección completa
4. Referencia de la dirección (punto de referencia cercano)

PASO 5 — LOGÍSTICA DE ENVÍO:
Una vez que el cliente haya dado su nombre, teléfono y dirección, determina el envío:
- Si la dirección menciona Trujillo o distritos de Trujillo (La Esperanza, El Porvenir, Florencia de Mora, Huanchaco, Víctor Larco, etc.): confirma entrega a domicilio.
- Si la ciudad NO es Trujillo o no está claro: pregunta "¿Tu dirección está en Trujillo o en otra ciudad? Si estás fuera de Trujillo, ¿cuál es la agencia de Courier más cercana?"
- Si el pedido tiene notas del proveedor (campo notes con "Proveedor: ..."), compártelas con el cliente: por ejemplo "El proveedor indicó: 5 en stock, llegan en 2 días."

PASO 6 — DATOS DE PAGO:
Cuando tengas dirección y envío definidos, comparte los datos de pago de arriba. Luego llama update_order_status con PAGO_PENDIENTE. Termina con: "Avísanos cuando hayas realizado el depósito. ¡Muchas gracias! 😊". NO preguntes "¿Deseas realizar el pago ahora?".

PASO 7 — ESTADO PAGO_PENDIENTE:
Cuando el pedido ya está en PAGO_PENDIENTE (el cliente ya recibió los datos de pago), cualquier mensaje del cliente (incluyendo "sí", "ya pagué", "ya realicé el pago", "gracias", etc.) debe recibir esta respuesta: "¡Gracias! Hemos registrado tu aviso. El administrador verificará tu depósito y te notificaremos en breve. 😊". NO llames ninguna herramienta.

════════════════════════════════════════
REGLAS ABSOLUTAS — NUNCA VIOLAR:
- NUNCA inventes precios. Cero. Si no hay precio en la BD, no hay precio.
- NUNCA uses $ ni USD. Siempre "S/" (soles peruanos).
- NUNCA cambies el estado a EN_RUTA, PAGO_CONFIRMADO, ENTREGADO ni CANCELADO.
- NUNCA saltes el paso de recopilación de datos del cliente.
- NUNCA llames find_and_add_product cuando el cliente está confirmando interés en un producto ya presentado.
- Para consultas técnicas usa rag_query_supabase.
════════════════════════════════════════`;

const TOOLS: Groq.Chat.ChatCompletionTool[] = [
  {
    type: "function",
    function: {
      name: "find_and_add_product",
      description: "Busca un producto por nombre, verifica su disponibilidad y lo agrega al pedido. Usar siempre que el cliente pregunte por un producto.",
      parameters: {
        type: "object",
        properties: {
          order_id: { type: "string", description: "ID del pedido actual" },
          query: { type: "string", description: "Nombre o descripción del producto que busca el cliente" },
        },
        required: ["order_id", "query"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "update_order_status",
      description: "Actualiza el estado del pedido. Solo usa: ESPERANDO_PROVEEDOR (producto sin stock o no en catálogo) o PAGO_PENDIENTE (cliente listo para pagar, datos completos).",
      parameters: {
        type: "object",
        properties: {
          order_id: { type: "string" },
          status: {
            type: "string",
            enum: [OrderStatus.ESPERANDO_PROVEEDOR, OrderStatus.PAGO_PENDIENTE],
          },
          requested_product: {
            type: "string",
            description: "Nombre exacto del producto solicitado por el cliente. Obligatorio solo cuando find_and_add_product devolvió error (producto no en catálogo) y se pasa a ESPERANDO_PROVEEDOR.",
          },
        },
        required: ["order_id", "status"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "rag_query_supabase",
      description: "Consulta la base de conocimiento técnico de DTECNOC para responder dudas técnicas",
      parameters: {
        type: "object",
        properties: { technical_question: { type: "string" } },
        required: ["technical_question"],
      },
    },
  },
];

async function executeTool(name: string, args: Record<string, unknown>) {
  switch (name) {
    case "find_and_add_product":
      return find_and_add_product(args.order_id as string, args.query as string);
    case "update_order_status":
      return update_order_status(args.order_id as string, args.status as OrderStatus, args.requested_product as string | undefined);
    case "rag_query_supabase":
      return rag_query_supabase(args.technical_question as string);
    default:
      return { error: "Tool not found" };
  }
}

const GREETING_RE = /^(hola+|buenas?|buenos?\s+(d[ií]as?|tardes?|noches?)|hey|saludos?|hi|hello|qu[eé]\s+tal|como\s+est[aá]s?|ola|buen\s+d[ií]a)\W*$/i;

export async function salesAgent(
  message: string,
  order_id: string,
  history: Array<{ role: "user" | "assistant"; content: string }> = []
): Promise<string> {
  if (GREETING_RE.test(message.trim()) && history.length <= 1) {
    return "¡Hola! 😊 ¿En qué puedo ayudarte hoy? Ofrecemos smartphones, tablets, cámaras de seguridad, antenas Starlink, kits DirecTV, paneles solares y accesorios.";
  }

  const orderCtx = await get_order_status(order_id);
  const orderInfo =
    "error" in orderCtx ? "" : `\nEstado del pedido: ${JSON.stringify(orderCtx)}`;

  const historyMessages: Groq.Chat.ChatCompletionMessageParam[] = history
    .slice(-6)
    .map((m) => ({ role: m.role, content: m.content }));

  const messages: Groq.Chat.ChatCompletionMessageParam[] = [
    { role: "system", content: SYSTEM_PROMPT },
    ...historyMessages,
    {
      role: "user",
      content: `Mensaje del cliente: "${message}"${orderInfo}\nOrder ID: ${order_id}`,
    },
  ];

  let currentModel = GROQ_MODEL_SALES;
  let lastProductResult: Record<string, unknown> | null = null;

  const currentStatus = "error" in orderCtx ? null : (orderCtx as { status: string }).status;
  // Post-quote states: find_and_add_product is irrelevant and causes confusion
  const postQuoteStatuses = [
    OrderStatus.COTIZADO, OrderStatus.PAGO_PENDIENTE,
    OrderStatus.PAGO_CONFIRMADO, OrderStatus.EN_RUTA, OrderStatus.COMPLETADO,
  ] as string[];
  const activeTools = postQuoteStatuses.includes(currentStatus ?? "")
    ? TOOLS.filter((t) => t.function?.name !== "find_and_add_product")
    : TOOLS;

  for (let i = 0; i < 5; i++) {
    let completion: Awaited<ReturnType<typeof groq.chat.completions.create>>;
    try {
      completion = await groq.chat.completions.create({
        model: currentModel,
        messages,
        tools: activeTools,
        tool_choice: "auto",
        temperature: 0.3,
        max_tokens: 400,
      });
    } catch (err: unknown) {
      const status = (err as { status?: number }).status;
      if (status === 429 && currentModel === GROQ_MODEL_SALES) {
        console.warn("[salesAgent] 70b rate limited, falling back to 8b");
        currentModel = GROQ_MODEL;
        completion = await groq.chat.completions.create({
          model: currentModel,
          messages,
          tools: activeTools,
          tool_choice: "auto",
          temperature: 0.3,
          max_tokens: 400,
        });
      } else {
        throw err;
      }
    }

    const choice = completion.choices[0];
    if (choice.finish_reason === "stop" || !choice.message.tool_calls?.length) {
      const raw = choice.message.content ?? "¡Hola! ¿En qué puedo ayudarte hoy? 😊";
      let clean = raw
        .replace(/<function[^>]*>[\s\S]*?<\/function>/g, "")
        .replace(/\(Paso\s+\d+[^)]*\)/g, "")
        .trim();

      // Guardrail: if product has stock but LLM returned the JIT message, override.
      // Skip when already_added=true (client browsing, product was already in cart).
      if (
        lastProductResult &&
        !lastProductResult.is_just_in_time &&
        !lastProductResult.already_added &&
        (lastProductResult.stock_quantity as number) > 0 &&
        clean.startsWith("Permíteme validar")
      ) {
        const price = lastProductResult.selling_price
          ? `S/ ${lastProductResult.selling_price}`
          : "precio a consultar";
        clean = `Tenemos el producto "${lastProductResult.name}" disponible en stock (${lastProductResult.stock_quantity} unidades). El precio es ${price}. ¿Te interesa adquirirlo? 😊`;
      }

      return clean || "¡Hola! ¿En qué puedo ayudarte hoy? 😊";
    }

    messages.push({
      role: "assistant",
      content: choice.message.content ?? "",
      tool_calls: choice.message.tool_calls,
    });

    for (const call of choice.message.tool_calls) {
      const args = JSON.parse(call.function.arguments) as Record<string, unknown>;
      const result = await executeTool(call.function.name, args);
      if (call.function.name === "find_and_add_product") {
        lastProductResult = result as Record<string, unknown>;
        // Guardrail: product not in catalog → update status and return JIT message.
        // Only applies in early states; COTIZADO+ orders never reach this branch
        // because find_and_add_product is removed from activeTools above.
        if ("error" in (result as Record<string, unknown>)) {
          if (!currentStatus || !postQuoteStatuses.includes(currentStatus)) {
            const query = args.query as string;
            await update_order_status(order_id, OrderStatus.ESPERANDO_PROVEEDOR, query);
            return "Permíteme validar disponibilidad con nuestro proveedor, te confirmo en breve 😊";
          }
        }
      }
      messages.push({
        role: "tool",
        tool_call_id: call.id,
        content: JSON.stringify(result),
      });
    }
  }

  return "¡Gracias por contactarnos! Estamos procesando tu solicitud y te confirmamos en breve. 😊";
}
