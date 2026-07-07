# §4 — Registro de decisiones de arquitectura (ADR)

> Sección 4 del *Documento de Diseño*. Cada decisión técnica relevante se registra con
> su contexto, la decisión, las alternativas descartadas y sus consecuencias.

---

## ADR-001 — Framework: LangChain + LangGraph.js sobre bucles a mano

| | |
|---|---|
| **Estado** | Aceptada |
| **Fecha** | 2026-07-01 |

**Contexto.** La versión inicial orquestaba los agentes con el Groq SDK directo y bucles
`for` de *tool-calling* escritos a mano, con parsing frágil (`JSON.parse` del texto del LLM).
El Documento de Diseño exige un stack LangChain (Runnables, orquestación con estado).

**Decisión.** Migrar todo a **LangChain.js + LangGraph.js**. El agente de ventas se modela
como un `StateGraph`; los demás agentes usan `ChatModel.bindTools` / `withStructuredOutput`.

**Alternativas.** (a) Mantener el SDK directo — descartada: no cumple el documento y el
parsing manual es frágil. (b) LangChain solo sin LangGraph — descartada: el flujo de ventas
tiene ramas, estado y bucles que piden un grafo (§3.1).

**Consecuencias.** ➕ Orquestación declarativa, salida estructurada validada, checkpointing
disponible, portabilidad de proveedor. ➖ Curva de aprendizaje y una capa de dependencias
más. Deuda: el `orchestratorAgent` existe pero el enrutado real se hace por `order.status`
en `app/api/chat/route.ts`.

---

## ADR-002 — Proveedor de LLM: Google Gemini (capa gratuita) sobre Groq

| | |
|---|---|
| **Estado** | Aceptada |
| **Fecha** | 2026-07-07 |

**Contexto.** Se requería un LLM más robusto que el `llama` de Groq pero con **costo nulo o
mínimo**. El proyecto ya usaba `GOOGLE_API_KEY` para embeddings.

**Decisión.** Usar **Gemini vía `@langchain/google-genai`**: chat `gemini-2.5-flash-lite`
(capa gratuita) para todos los niveles. Una sola clave cubre chat y embeddings.

**Alternativas.** (a) Claude/OpenAI — descartadas por costo (no hay capa gratuita
equivalente). (b) `gemini-2.0-flash` — descartada: cuota diaria gratuita muy baja.
(c) `gemini-2.5-flash` — descartada: su *thinking* por defecto consume el presupuesto de
tokens en llamadas de tokens bajos (orquestador = 50) y devuelve respuestas vacías.

**Consecuencias.** ➕ Costo de tokens ≈ S/ 0; un solo proveedor. ➖ Límites de peticiones del
free tier (por minuto y por día) — se mitigó con throttling en el eval (`EVAL_DELAY_MS`) y
`withFallbacks`; para producción de alto volumen se pasaría a un plan de pago. Requirió
ajustes de compatibilidad (Gemini exige un único *system message*; ver ADR-004).

---

## ADR-003 — RAG: pgvector + embeddings `gemini-embedding-001` sobre keyword ILIKE

| | |
|---|---|
| **Estado** | Aceptada |
| **Fecha** | 2026-07-01 (revisada 2026-07-07) |

**Contexto.** La "RAG" original era una búsqueda `ILIKE` por palabra clave sobre la tabla
`EmbeddingDocument` — sin semántica real, pese al nombre. El documento (§3.3) pide un vector
store con embeddings.

**Decisión.** Recuperación semántica real con **`PGVectorStore` (pgvector)** sobre la misma
Postgres de Supabase, chunking `RecursiveCharacterTextSplitter`, `k=4`, distancia coseno, y
embeddings **`gemini-embedding-001`** (3072 dim).

**Alternativas.** (a) Mantener ILIKE — descartada: sin relevancia semántica. (b) Vector store
externo (Pinecone/Weaviate) — descartada: pgvector reutiliza la infraestructura existente.
(c) `text-embedding-004` — descartada: no disponible en la API v1beta gratuita (devuelve
vectores vacíos).

**Consecuencias.** ➕ Recuperación por significado, validada (consulta "instalar Starlink" →
documento correcto). ➖ Dimensión 3072 (índice más pesado); la ingesta consume cuota de
embeddings. Nota operativa: `PGVectorStore` deja un pool `pg` abierto — los scripts fuerzan
`process.exit(0)`.

---

## ADR-004 — Ventas: `StateGraph` de LangGraph con guardrails deterministas

| | |
|---|---|
| **Estado** | Aceptada |
| **Fecha** | 2026-07-01 |

**Contexto.** El flujo de ventas es una máquina de estados (PASO 0→7) que el LLM, guiado solo
por prompt, violaba (inventaba precios, saltaba pasos). El historial de git del proyecto
muestra varios `fix:` sobre esto.

**Decisión.** Modelar el flujo como un **`StateGraph`** con estado tipado (`Annotation.Root`),
nodos `agent`/`tools`/`finalize` y aristas condicionales. Los *guardrails* deterministas se
conservan como código en los nodos (anti-invención de precio, JIT, auto-transición a
`PAGO_PENDIENTE`). Además, se fusionan los dos *system messages* en uno solo por exigencia de
Gemini.

**Alternativas.** (a) `createReactAgent` (prebuilt) — descartada: no da control sobre el
post-procesado de los guardrails. (b) Confiar solo en el prompt — descartada: es justo lo que
fallaba antes.

**Consecuencias.** ➕ Comportamiento predecible y auditable; los guardrails no dependen del
LLM. ➖ Más código de orquestación. La memoria durable sigue en `ClientConversation` (BD); el
grafo de runtime es *stateless* (se puede inyectar un `PostgresSaver` para memoria gestionada).

---

## ADR-005 — Despliegue: Vercel serverless + Supabase; esquema aplicado por SQL directo

| | |
|---|---|
| **Estado** | Aceptada |
| **Fecha** | 2026-07-07 |

**Contexto.** MVP de bajo volumen, sin equipo de ops. Además, `prisma db push` se **cuelga**
contra el *transaction pooler* de Supabase (puerto 6543, pgbouncer) por los *advisory locks*.

**Decisión.** Topología **Vercel (serverless) + Supabase (Postgres/pgvector)** (§8.3). Para el
esquema, generar el SQL offline (`prisma migrate diff`) y aplicarlo por conexión `pg` directa
(las sentencias `CREATE TABLE` sí pasan por el pooler).

**Alternativas.** (a) `prisma db push` normal — descartada: se cuelga con el pooler.
(b) Kubernetes/Docker — descartada: sobredimensionado para el volumen. (c) Migraciones Prisma
formales con `directUrl` (puerto 5432) — **recomendada a futuro** para un flujo de migraciones
versionado.

**Consecuencias.** ➕ Despliegue simple, costo proporcional al uso, rollback instantáneo en
Vercel. ➖ Sin historial de migraciones formal (deuda técnica asumida); el `.env` único lo leen
Next, Prisma y los scripts `tsx`.
