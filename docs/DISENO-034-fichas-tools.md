# §3.4 — Especificación de herramientas (tools)

> Sección 3.4 del *Documento de Diseño*. Cada tool es una API que consume un agente; su
> *description* (docstring) es la interfaz semántica que el modelo lee para decidir cuándo
> usarla. Todas se definen con `tool()` de LangChain + esquema **zod** en `lib/tools/lc/`.

---

## Ficha — `find_and_add_product`

| Campo | Valor |
|-------|-------|
| **Nombre** | `find_and_add_product` |
| **Fuente** | `lib/tools/lc/inventory-tools.ts` |
| **Propósito (docstring)** | Busca un producto por nombre, verifica su disponibilidad y lo agrega al pedido. Úsala solo cuando el cliente pregunta por un producto que aún no está en el pedido. Nunca cuando solo confirma interés ("sí", "quiero", "acepto"). |
| **Argumentos** | `order_id: string` (ID del pedido) · `query: string` (nombre/descripción del producto) |
| **Retorno** | JSON: `{ product_id, name, category, stock_quantity, selling_price, is_just_in_time, needs_restock, added_to_order, already_added, other_results[] }` o `{ error, query }` si no está en catálogo |
| **Efectos / idempotencia** | **Escritura**: crea un `OrderItem` si no existe. Idempotente por (order, product): si ya está, devuelve `already_added=true` sin duplicar. Incluye chequeo de marca (evita que "iPhone" matchee un Samsung). |
| **Manejo de errores** | Producto no encontrado → `{ error, query }`; el agente deriva a `ESPERANDO_PROVEEDOR`. |

## Ficha — `update_order_status`

| Campo | Valor |
|-------|-------|
| **Nombre** | `update_order_status` |
| **Fuente** | `lib/tools/lc/inventory-tools.ts` |
| **Propósito (docstring)** | Actualiza el estado del pedido. Solo permite `ESPERANDO_PROVEEDOR` (sin stock / fuera de catálogo) o `PAGO_PENDIENTE` (cliente listo para pagar, datos completos). |
| **Argumentos** | `order_id: string` · `status: enum(ESPERANDO_PROVEEDOR \| PAGO_PENDIENTE)` · `requested_product?: string` (obligatorio cuando el producto no está en catálogo) |
| **Retorno** | `{ success, order_id, new_status }` o `{ success:false, skipped, reason }` si se intenta retroceder |
| **Efectos / idempotencia** | **Escritura**: cambia `Order.status`. **No retrocede**: si el estado actual es más avanzado (por `STATUS_RANK`), la operación se omite. `requested_product` se guarda en `notes` como "Cliente solicita: …". |
| **Manejo de errores** | Transición hacia atrás → `skipped:true` con motivo, sin lanzar. |

## Ficha — `rag_query_supabase`

| Campo | Valor |
|-------|-------|
| **Nombre** | `rag_query_supabase` |
| **Fuente** | `lib/tools/lc/rag-tool.ts` → `lib/tools/rag.ts` |
| **Propósito (docstring)** | Consulta la base de conocimiento técnico de DTECNOC (manuales, especificaciones, instalación) para responder dudas técnicas. La respuesta debe apoyarse en el contexto recuperado. |
| **Argumentos** | `technical_question: string` (la duda del cliente en lenguaje natural) |
| **Retorno** | `string` — "Información técnica disponible:\n\n" + los `k=4` fragmentos más relevantes, o un mensaje de fallback si no hay documentos |
| **Efectos / idempotencia** | **Solo lectura, idempotente.** Búsqueda por similitud coseno en `PGVectorStore` (pgvector) con embeddings `gemini-embedding-001`. |
| **Manejo de errores** | Ante fallo del vector store, devuelve "Información técnica no disponible en este momento." (no lanza). |

## Ficha — `get_technician_schedule`

| Campo | Valor |
|-------|-------|
| **Nombre** | `get_technician_schedule` |
| **Fuente** | `lib/tools/lc/logistics-tools.ts` |
| **Propósito (docstring)** | Obtiene los horarios disponibles del técnico para una fecha. |
| **Argumentos** | `date: string` (formato `YYYY-MM-DD`) |
| **Retorno** | JSON: `{ date, available_slots: [{ time, available }], technician_id }` |
| **Efectos / idempotencia** | **Solo lectura, idempotente.** (Implementación actual con horarios simulados.) |
| **Manejo de errores** | — (retorno determinista). |

## Ficha — `book_installation`

| Campo | Valor |
|-------|-------|
| **Nombre** | `book_installation` |
| **Fuente** | `lib/tools/lc/logistics-tools.ts` |
| **Propósito (docstring)** | Registra y confirma la instalación en el sistema (pasa el pedido a `EN_RUTA`). |
| **Argumentos** | `order_id: string` · `technician_id: string` · `client_address: string` · `date: string (YYYY-MM-DD)` |
| **Retorno** | JSON: `{ success, order_id, technician_id, address, scheduled_date, status: "EN_RUTA", confirmation_message }` |
| **Efectos / idempotencia** | **Escritura**: cambia `Order.status` a `EN_RUTA` y guarda la cita en `notes`. No idempotente (re-agendar sobrescribe). |
| **Manejo de errores** | — (asume `order_id` válido). |

---

## Notas de diseño

- **Herramientas por estado (§3.1):** en estados `COTIZADO`+ el `salesAgent` **retira**
  `find_and_add_product` del conjunto de tools, para que el modelo no reabra la búsqueda de
  productos una vez cotizado.
- **Interceptación de resultados:** el nodo `tools` del `StateGraph` no solo ejecuta la tool;
  intercepta su resultado para aplicar guardrails (p. ej. producto ya en carrito → salta a
  recopilación de datos; fuera de catálogo → `ESPERANDO_PROVEEDOR`). Ver [ADR-004](DISENO-04-adr.md).
- **Correo al proveedor** (`send_supplier_gmail`) e **inventario** no se exponen como tools del
  LLM: son lógica determinista invocada por `inventoryAgent` tras el turno de ventas (§2.1 —
  no todo requiere LLM).
