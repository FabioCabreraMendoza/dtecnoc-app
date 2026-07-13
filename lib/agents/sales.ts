import {
  StateGraph,
  Annotation,
  MessagesAnnotation,
  START,
  END,
  type BaseCheckpointSaver,
} from "@langchain/langgraph";
import {
  SystemMessage,
  HumanMessage,
  AIMessage,
  ToolMessage,
  type BaseMessage,
} from "@langchain/core/messages";
import { makeChat, FAST_MODEL, SALES_MODEL } from "@/lib/llm";
import {
  findAndAddProductTool,
  updateOrderStatusTool,
} from "@/lib/tools/lc/inventory-tools";
import { ragQueryTool } from "@/lib/tools/lc/rag-tool";
import { update_order_status, get_order_status } from "@/lib/tools/inventory";
import type { StructuredToolInterface } from "@langchain/core/tools";
import { OrderStatus } from "@prisma/client";

// Fuente única de los datos de pago — se usa tanto en el prompt (para que el LLM
// los comparta él mismo en PASO 6) como en el guardrail determinista de
// finalizeNode (por si el LLM salta el paso y nunca los muestra).
const PAYMENT_INFO_BLOCK = `- BCP: Cta. 123-456789-0-12 | CCI 002-123-004567890-12 | A nombre de: DTECNOC S.A.C.
- Interbank: Cta. 200-3001234567 | CCI 003-200-003001234567-34 | A nombre de: DTECNOC S.A.C.
- YAPE / PLIN / DALE: 987-654-321 (a nombre de DTECNOC S.A.C.)
- Teléfono de ventas: 044-123-456`;

// ── Prompt de sistema (§3.5 — instrucciones del nodo agente) ─────────────────
const SYSTEM_PROMPT = `Eres el asesor comercial de DTECNOC, empresa de tecnología e instalaciones en Perú (Trujillo).

DATOS DE PAGO DE LA EMPRESA (usa siempre estos):
${PAYMENT_INFO_BLOCK}

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


REGLAS ABSOLUTAS — NUNCA VIOLAR:
- NUNCA inventes precios. Cero. Si no hay precio en la BD, no hay precio.
- NUNCA uses $ ni USD. Siempre "S/" (soles peruanos).
- NUNCA cambies el estado a EN_RUTA, PAGO_CONFIRMADO, ENTREGADO ni CANCELADO.
- NUNCA saltes el paso de recopilación de datos del cliente.
- NUNCA llames find_and_add_product cuando el cliente está confirmando interés en un producto ya presentado.
- Para consultas técnicas usa rag_query_supabase.
`;

const JIT_MESSAGE =
  "Permíteme validar disponibilidad con nuestro proveedor, te confirmo en breve 😊";

// Estados posteriores a la cotización: find_and_add_product es irrelevante.
const POST_QUOTE_STATUSES = [
  OrderStatus.COTIZADO,
  OrderStatus.PAGO_PENDIENTE,
  OrderStatus.PAGO_CONFIRMADO,
  OrderStatus.EN_RUTA,
  OrderStatus.COMPLETADO,
] as string[];

// Estados donde ya se pasó (o se saltó) la etapa de pago: no tiene sentido
// forzar PAGO_PENDIENTE de nuevo.
const ALREADY_PAST_PAYMENT_STATUSES = [
  OrderStatus.PAGO_PENDIENTE,
  OrderStatus.PAGO_CONFIRMADO,
  OrderStatus.EN_RUTA,
  OrderStatus.COMPLETADO,
  OrderStatus.CANCELADO,
] as string[];

/**
 * Guardrail: la respuesta comparte datos de pago pero el LLM pudo haber olvidado
 * mover el estado → PAGO_PENDIENTE. Aplica tanto si el pedido venía de COTIZADO
 * (producto vía proveedor) como de CONSULTANDO/ESPERANDO_PROVEEDOR (producto en
 * stock, compra directa sin pasar por cotización de proveedor). Extraída como
 * función pura para poder probarla sin invocar el grafo completo (LLM + BD).
 */
export function shouldForcePagoPendiente(
  orderStatus: string,
  responseText: string
): boolean {
  return (
    !ALREADY_PAST_PAYMENT_STATUSES.includes(orderStatus) &&
    (responseText.includes("BCP") ||
      responseText.includes("Interbank") ||
      responseText.includes("YAPE"))
  );
}

const PAYMENT_REMINDER_SUFFIX = `Aquí tienes los datos de pago:
${PAYMENT_INFO_BLOCK}

Avísanos cuando hayas realizado el depósito. ¡Muchas gracias! 😊`;

/**
 * Guardrail inverso al de arriba: el pedido YA está en PAGO_PENDIENTE (el LLM
 * pudo haber llamado update_order_status directamente, saltándose el PASO 6)
 * pero la respuesta nunca mostró los datos de pago — el cliente no sabría cómo
 * pagar aunque su pedido ya esté "listo". Le agrega los datos de pago al final
 * en vez de dejar al cliente sin esa información. Función pura para testear
 * sin invocar el grafo completo.
 */
export function ensurePaymentInfoShown(
  responseText: string,
  currentOrderStatus: string
): string {
  const hasPaymentInfo =
    responseText.includes("BCP") ||
    responseText.includes("Interbank") ||
    responseText.includes("YAPE");
  if (currentOrderStatus === OrderStatus.PAGO_PENDIENTE && !hasPaymentInfo) {
    return `${responseText}\n\n${PAYMENT_REMINDER_SUFFIX}`;
  }
  return responseText;
}

const ALL_TOOLS: StructuredToolInterface[] = [
  findAndAddProductTool,
  updateOrderStatusTool,
  ragQueryTool,
];
const TOOL_MAP: Record<string, StructuredToolInterface> = Object.fromEntries(
  ALL_TOOLS.map((t) => [t.name, t])
);

// ── Estado compartido del grafo (§3.5 — TypedDict/Annotation) ────────────────
const SalesState = Annotation.Root({
  ...MessagesAnnotation.spec,
  order_id: Annotation<string>,
  order_status: Annotation<string>({
    reducer: (_p, n) => n,
    default: () => "",
  }),
  last_product_result: Annotation<Record<string, unknown> | null>({
    reducer: (_p, n) => n,
    default: () => null,
  }),
  final_response: Annotation<string | null>({
    reducer: (_p, n) => n,
    default: () => null,
  }),
});
type SalesStateT = typeof SalesState.State;

// ── Nodo: agente (llama al LLM con tools) ────────────────────────────────────
async function agentNode(state: SalesStateT): Promise<Partial<SalesStateT>> {
  const orderCtx = await get_order_status(state.order_id);
  const status =
    "error" in orderCtx ? state.order_status : (orderCtx as { status: string }).status;
  const orderInfo =
    "error" in orderCtx ? "" : `\nEstado del pedido: ${JSON.stringify(orderCtx)}`;

  // Herramientas activas según el estado (§3.1 — ramificación por estado).
  const activeTools = POST_QUOTE_STATUSES.includes(status)
    ? ALL_TOOLS.filter((t) => t.name !== "find_and_add_product")
    : ALL_TOOLS;

  // Modelo de ventas con fallback automático (§3.8), tools ligadas.
  const primary = makeChat(SALES_MODEL, { temperature: 0.3, maxTokens: 400 }).bindTools(
    activeTools
  );
  const fallback = makeChat(FAST_MODEL, { temperature: 0.3, maxTokens: 400 }).bindTools(
    activeTools
  );
  const model = primary.withFallbacks([fallback]);

  // Gemini exige un único mensaje de sistema al inicio: fusionamos prompt + contexto.
  const promptMessages: BaseMessage[] = [
    new SystemMessage(
      `${SYSTEM_PROMPT}\n\nContexto actual:${orderInfo}\nOrder ID: ${state.order_id}`
    ),
    ...state.messages,
  ];

  const response = await model.invoke(promptMessages);
  return { messages: [response], order_status: status };
}

// ── Nodo: ejecución de herramientas + guardrails deterministas ───────────────
async function toolsNode(state: SalesStateT): Promise<Partial<SalesStateT>> {
  const lastMsg = state.messages[state.messages.length - 1] as AIMessage;
  const toolMessages: ToolMessage[] = [];
  let lastProductResult = state.last_product_result;

  for (const call of lastMsg.tool_calls ?? []) {
    const tool = TOOL_MAP[call.name];
    const rawOutput = tool
      ? ((await tool.invoke(call.args)) as string)
      : JSON.stringify({ error: "Tool not found" });

    const toolMsg = new ToolMessage({
      content: rawOutput,
      tool_call_id: call.id ?? call.name,
    });

    if (call.name === "find_and_add_product") {
      const res = JSON.parse(rawOutput) as Record<string, unknown>;
      lastProductResult = res;

      // Guardrail A: producto ya en el carrito + CONSULTANDO → el cliente confirma,
      // salta directo al PASO 4 en vez de repetir el precio.
      if (res.already_added === true && state.order_status === OrderStatus.CONSULTANDO) {
        const productName = res.name as string;
        return {
          messages: [toolMsg],
          last_product_result: res,
          final_response: `¡Perfecto! El ${productName} ya está en tu pedido 😊 Para continuar, necesito algunos datos:\n\n1. ¿Cuál es tu nombre completo?\n2. ¿Tu número de teléfono?\n3. ¿Tu dirección completa?\n4. ¿Un punto de referencia cercano a tu dirección?`,
        };
      }

      // Guardrail B: producto fuera de catálogo → ESPERANDO_PROVEEDOR + mensaje JIT.
      if ("error" in res && !POST_QUOTE_STATUSES.includes(state.order_status)) {
        const query = call.args.query as string;
        await update_order_status(state.order_id, OrderStatus.ESPERANDO_PROVEEDOR, query);
        return {
          messages: [toolMsg],
          last_product_result: res,
          final_response: JIT_MESSAGE,
        };
      }
    }

    toolMessages.push(toolMsg);
  }

  return { messages: toolMessages, last_product_result: lastProductResult };
}

// ── Nodo: finalización (limpieza + guardrails de precio/pago) ────────────────
async function finalizeNode(state: SalesStateT): Promise<Partial<SalesStateT>> {
  const lastAI = [...state.messages]
    .reverse()
    .find((m): m is AIMessage => m instanceof AIMessage);
  const raw =
    (typeof lastAI?.content === "string" ? lastAI.content : "") ||
    "¡Hola! ¿En qué puedo ayudarte hoy? 😊";

  let clean = raw
    .replace(/<function[^>]*>[\s\S]*?<\/function>/g, "")
    .replace(/\(Paso\s+\d+[^)]*\)/g, "")
    .trim();

  const lpr = state.last_product_result;

  // Guardrail: el LLM nunca debe inventar precio para un producto JIT.
  if (lpr && lpr.is_just_in_time === true && !lpr.already_added) {
    return { final_response: JIT_MESSAGE };
  }

  // Guardrail: si hay stock pero el LLM soltó el mensaje JIT, sobrescribe con el precio.
  if (
    lpr &&
    !lpr.is_just_in_time &&
    !lpr.already_added &&
    (lpr.stock_quantity as number) > 0 &&
    clean.startsWith("Permíteme validar")
  ) {
    const price = lpr.selling_price ? `S/ ${lpr.selling_price}` : "precio a consultar";
    clean = `Tenemos el producto "${lpr.name}" disponible en stock (${lpr.stock_quantity} unidades). El precio es ${price}. ¿Te interesa adquirirlo? 😊`;
  }

  // Guardrail: compartió datos de pago pero olvidó mover el estado → PAGO_PENDIENTE.
  // update_order_status() además protege contra retroceder un estado ya avanzado
  // (§ STATUS_RANK).
  if (shouldForcePagoPendiente(state.order_status, clean)) {
    await update_order_status(state.order_id, OrderStatus.PAGO_PENDIENTE);
  }

  // Guardrail inverso: el pedido puede haber llegado a PAGO_PENDIENTE en este
  // mismo turno (el LLM llamó update_order_status directamente en toolsNode,
  // saltándose el PASO 6) sin mostrar los datos de pago. Se relee el estado
  // real post-tool-calls (state.order_status es el de ANTES de este turno).
  const currentCtx = await get_order_status(state.order_id);
  if (!("error" in currentCtx)) {
    clean = ensurePaymentInfoShown(clean, currentCtx.status);
  }

  return { final_response: clean || "¡Hola! ¿En qué puedo ayudarte hoy? 😊" };
}

// ── Aristas condicionales (§3.5) ─────────────────────────────────────────────
function routeFromAgent(state: SalesStateT): "tools" | "finalize" {
  const lastMsg = state.messages[state.messages.length - 1] as AIMessage;
  return (lastMsg.tool_calls?.length ?? 0) > 0 ? "tools" : "finalize";
}

function routeFromTools(state: SalesStateT): typeof END | "agent" {
  // Un guardrail cortocircuitó con una respuesta final → terminar.
  return state.final_response != null ? END : "agent";
}

// ── Construcción del grafo ───────────────────────────────────────────────────
export function buildSalesGraph(checkpointer?: BaseCheckpointSaver) {
  const graph = new StateGraph(SalesState)
    .addNode("agent", agentNode)
    .addNode("tools", toolsNode)
    .addNode("finalize", finalizeNode)
    .addEdge(START, "agent")
    .addConditionalEdges("agent", routeFromAgent, {
      tools: "tools",
      finalize: "finalize",
    })
    .addConditionalEdges("tools", routeFromTools, {
      agent: "agent",
      [END]: END,
    })
    .addEdge("finalize", END);

  return graph.compile({ checkpointer });
}

// Checkpointing (§3.5): el grafo de runtime es stateless — la memoria durable de
// la conversación proviene de ClientConversation (BD), que se reconstruye e inyecta
// como historial en cada turno. Para un despliegue con memoria gestionada por el
// grafo (LangGraph Platform / multiusuario) se compila con un checkpointer durable:
//   buildSalesGraph(PostgresSaver.fromConnString(process.env.DATABASE_URL!))
// y se invoca pasando solo el mensaje nuevo con { configurable: { thread_id } }.
// MemorySaver queda disponible para pruebas locales de reanudación.
const salesGraph = buildSalesGraph();

const GREETING_RE =
  /^(hola+|buenas?|buenos?\s+(d[ií]as?|tardes?|noches?)|hey|saludos?|hi|hello|qu[eé]\s+tal|como\s+est[aá]s?|ola|buen\s+d[ií]a)\W*$/i;

function toLcMessage(m: { role: "user" | "assistant"; content: string }): BaseMessage {
  return m.role === "user" ? new HumanMessage(m.content) : new AIMessage(m.content);
}

/**
 * Punto de entrada público — misma firma que la versión original.
 * Orquesta el flujo de ventas mediante el grafo LangGraph.
 */
export async function salesAgent(
  message: string,
  order_id: string,
  history: Array<{ role: "user" | "assistant"; content: string }> = []
): Promise<string> {
  if (GREETING_RE.test(message.trim()) && history.length <= 1) {
    return "¡Hola! 😊 ¿En qué puedo ayudarte hoy? Ofrecemos smartphones, tablets, cámaras de seguridad, antenas Starlink, kits DirecTV, paneles solares y accesorios.";
  }

  const initialMessages: BaseMessage[] = [
    ...history.slice(-6).map(toLcMessage),
    new HumanMessage(message),
  ];

  const result = await salesGraph.invoke(
    { messages: initialMessages, order_id, order_status: "", last_product_result: null },
    { recursionLimit: 12, configurable: { thread_id: order_id } }
  );

  return (
    result.final_response ??
    "¡Gracias por contactarnos! Estamos procesando tu solicitud y te confirmamos en breve. 😊"
  );
}
