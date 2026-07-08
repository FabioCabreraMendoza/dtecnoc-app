# Migración a LangChain — DTECNOC

Este documento resume la migración del stack de agentes desde el **Groq SDK directo**
hacia **LangChain / LangGraph / LangSmith**, y mapea cada cambio a las secciones del
*Documento de Diseño (Automatización Inteligente de Procesos con LangChain)*.

## Stack resultante

| Capa | Antes | Ahora | Sección doc |
|------|-------|-------|-------------|
| Framework | Groq SDK (bucles a mano) | LangChain + LangGraph.js | §3.1, §3.5 |
| Modelo LLM | `groq-sdk` (llama) | `@langchain/google-genai` (`ChatGoogleGenerativeAI`) — **Gemini Flash** (capa gratuita) | §3.1 |
| Orquestación de ventas | bucle `for` manual | `StateGraph` con estado tipado, nodos y aristas condicionales | §3.5 |
| RAG | keyword `ILIKE` | `PGVectorStore` (pgvector) + embeddings `gemini-embedding-001` | §3.3 |
| Salida estructurada | `JSON.parse` frágil | `withStructuredOutput` + esquemas **zod** | §3.7 |
| Robustez | fallback 429 manual | `maxRetries`, `timeout`, `withFallbacks`, `InMemoryCache` | §3.8 |
| Observabilidad | ninguna | LangSmith (tracing automático por env) | §5.3 |
| Evaluación | ninguna | golden set + runner con umbrales + `evaluate` LangSmith | §5.1, §5.2, §5.4 |

## Mapa de archivos

- `lib/llm.ts` — configuración de modelos `ChatGoogleGenerativeAI`/Gemini
  (`makeChat`, `salesChat`, `fastChat`), embeddings Google y caché. Un solo
  `GOOGLE_API_KEY` para chat y embeddings. Sustituye a `lib/groq.ts` (eliminado). **§3.1, §3.8**
- `lib/tools/lc/*.ts` — herramientas LangChain (`tool()` + zod) que envuelven las
  funciones de dominio existentes. **§3.4**
- `lib/tools/rag.ts` — RAG vectorial real: `getVectorStore`, `ingestDocument`,
  `deleteDocumentVectors`, `rag_query`. **§3.3**
- `lib/agents/sales.ts` — `StateGraph` de ventas: estado (`Annotation.Root`), nodos
  `agent` / `tools` / `finalize`, aristas condicionales, guardrails preservados y
  soporte de checkpointer (`buildSalesGraph`). **§3.5**
- `lib/agents/orchestrator.ts` — clasificación de intención con salida estructurada
  zod + caché. **§3.7**
- `lib/agents/logistics.ts` — agente de logística con `bindTools` (LangChain).
- `lib/agents/inventory.ts`, `lib/agents/supplier.ts` — **sin cambios de framework**:
  son lógica/parsing deterministas sin LLM (§2.1 — no todo requiere LLM).
- `eval/golden-set.ts`, `eval/run-eval.ts`, `eval/langsmith-eval.ts` — evaluación. **§5**
- `scripts/reindex-rag.ts` — reindexado de documentos al vector store.

## Puesta en marcha (nuevas dependencias de entorno)

Además de lo anterior, el nuevo stack requiere (ver `.env.example`):

1. `GOOGLE_API_KEY` — embeddings `gemini-embedding-001`.
2. `LANGSMITH_TRACING=true`, `LANGSMITH_API_KEY`, `LANGSMITH_PROJECT` — observabilidad.
3. Extensión pgvector en Postgres/Supabase:
   ```sql
   create extension if not exists vector;
   ```
   La tabla `rag_documents` la crea `PGVectorStore.initialize` automáticamente.

### Comandos

```bash
npm run typecheck        # tsc --noEmit
npm run reindex-rag      # (re)indexa EmbeddingDocument → vector store
npm run eval             # evaluación local con puerta de umbral (§5.4)
npm run eval:langsmith   # sube dataset y ejecuta experimento en LangSmith (§5.3)
```

## Notas de diseño

- **Memoria del agente de ventas**: la fuente durable sigue siendo `ClientConversation`
  (BD), reconstruida como historial en cada turno; el grafo de runtime es *stateless*
  para evitar duplicación. Para memoria gestionada por el grafo (LangGraph Platform)
  se compila con un `PostgresSaver` vía `buildSalesGraph(saver)` (§3.5).
- **Guardrails**: se conservaron íntegros como nodos deterministas del grafo (anti
  invención de precio, JIT, auto-transición a `PAGO_PENDIENTE`). Ver `lib/agents/sales.ts`.
- **Pendiente / futuro**: evaluación end-to-end del flujo de ventas requiere una BD
  sembrada (staging, §8.1); el golden set actual cubre el clasificador de intención.
