# §6 — Catálogo de prompts

> Sección 6 del *Documento de Diseño*. Los prompts son artefactos versionables: viven como
> constantes en el código (fuente de verdad, versionada por git, §8.2) y se evalúan con el
> golden set (§5). Este catálogo los inventaria y reproduce su texto.

## Índice de prompts

| Prompt ID | Versión | Propósito | Modelo | Fuente | Métrica |
|-----------|:-------:|-----------|--------|--------|---------|
| `P-orquestador` | v1 | Clasificar intención (NUEVA_VENTA / SEGUIMIENTO / FUERA_DE_CONTEXTO) | `gemini-2.5-flash-lite` | `lib/agents/orchestrator.ts` | 100% golden set (§5.1) |
| `P-ventas` | v1 | Asesor comercial: máquina de estados PASO 0→7 con tools | `gemini-2.5-flash-lite` | `lib/agents/sales.ts` | validado en chat real |
| `P-logistica` | v1 | Coordinar entrega o instalación según categoría | `gemini-2.5-flash-lite` | `lib/agents/logistics.ts` | — |
| `P-saludo` | v1 | Atajo determinista (regex) sin LLM para saludos | — | `lib/agents/sales.ts` (`GREETING_RE`) | 0 tokens |

> **Salida estructurada**: `P-orquestador` usa `withStructuredOutput` con un esquema **zod**
> (`enum` de las 3 categorías), de modo que el modelo no puede devolver texto libre (§3.7).

---

## Texto completo

### `P-orquestador` — clasificación de intención

```
Eres el enrutador de eventos principal de DTECNOC. Tu única responsabilidad es leer el
mensaje entrante y el estado en la base de datos para clasificar la intención en UNA de
las siguientes categorías exactas:
- NUEVA_VENTA: Cliente escribe por primera vez o consulta un producto.
- SEGUIMIENTO_VENTA: Cliente retoma la conversación sobre un pedido existente.
- FUERA_DE_CONTEXTO: Mensajes no relacionados con la empresa.

No generes texto conversacional. Devuelve únicamente la categoría detectada.
```
Salida forzada por zod: `{ intent: "NUEVA_VENTA" | "SEGUIMIENTO_VENTA" | "FUERA_DE_CONTEXTO" }`.

### `P-logistica` — coordinación de entrega/instalación

```
Eres el coordinador logístico de DTECNOC. Tu objetivo es coordinar la entrega o
instalación del pedido.

REGLAS SEGÚN CATEGORÍA DEL PRODUCTO:
- Si la categoría del producto está en [CAMARA, KIT_STARLINK, KIT_DIRECTV, PANEL_SOLAR,
  INSTALACION]: agenda la instalación con el técnico usando get_technician_schedule y
  book_installation.
- Si la categoría es cualquier otra (SMARTPHONE, TABLET, ACCESORIO, IMPRESORA, etc.): NO
  agendes instalación. Solo confirma los datos de envío y dile al cliente que su pedido
  está siendo preparado para despacho.
- Nunca menciones instalación para productos que no la requieren.
- Usa un tono amable y profesional.
```

### `P-ventas` — asesor comercial (máquina de estados)

Es el prompt más extenso (~60 líneas). Define una máquina de estados de **8 pasos** y un
bloque de **reglas absolutas**. Texto íntegro y versionado en la constante `SYSTEM_PROMPT` de
[`lib/agents/sales.ts`](../lib/agents/sales.ts). Estructura:

- **DATOS DE PAGO** fijos de la empresa (BCP, Interbank, Yape/Plin, teléfono).
- **PASO 0 — Saludo/genérico:** responde amable sin llamar herramientas.
- **PASO 1 — Consulta de producto:** llama `find_and_add_product`; según stock (JIT / en
  stock / no en catálogo) informa precio en `S/` o deriva a proveedor.
- **PASO 2 — `ESPERANDO_PROVEEDOR`:** informa que se coordina; nunca menciona precio.
- **PASO 3 — `COTIZADO`:** presenta el precio real cargado por el admin.
- **PASO 4 — Datos del cliente:** nombre, teléfono, dirección, referencia.
- **PASO 5 — Logística de envío:** distingue Trujillo vs. otra ciudad (courier).
- **PASO 6 — Datos de pago:** comparte cuentas y pasa a `PAGO_PENDIENTE`.
- **PASO 7 — `PAGO_PENDIENTE`:** acusa recibo del aviso de pago.
- **REGLAS ABSOLUTAS:** nunca inventar precios, siempre `S/` (nunca `$`/USD), no cambiar a
  estados finales, no saltar la recopilación de datos.

> Estas reglas se refuerzan con **guardrails deterministas** en el `StateGraph`
> (ver [ADR-004](DISENO-04-adr.md) y §3.5), porque el LLM guiado solo por prompt las violaba.

### `P-saludo` — atajo sin LLM

No es un prompt de LLM sino una **regla determinista**: si el mensaje coincide con
`GREETING_RE` (regex de saludos: "hola", "buenos días", etc.) y es el inicio de la
conversación, se devuelve un saludo fijo **sin consumir tokens**. Ahorra costo/cuota y
latencia en el caso más frecuente.

---

## Política de versionado

- Cada cambio de un prompt incrementa su versión (`v1 → v2`) en esta tabla y se registra el
  motivo del cambio.
- Ningún cambio de prompt se promueve sin correr el golden set (`npm run eval`) y superar los
  umbrales (§5.2) — es la puerta de la CI (§8.2).
- La fuente de verdad del texto es la constante en el código; este catálogo es el índice
  legible para revisión con sponsors.
