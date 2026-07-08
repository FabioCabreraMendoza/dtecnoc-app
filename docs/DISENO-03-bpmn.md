# §3.2 — Diagrama de proceso (BPMN as-is / to-be)

> Sección 3.2 del *Documento de Diseño*. Los diagramas delimitan qué pasos **automatiza
> el LLM**, cuáles permanecen **deterministas** y dónde hay **intervención humana**.
> Están en Mermaid (renderizan en GitHub); para el documento final se pueden exportar a
> BPMN 2.0 estricto con [bpmn.io](https://bpmn.io) conservando la misma semántica.

## Leyenda

| Marca | Significado |
|-------|-------------|
| 🤖 LLM | Paso ejecutado por un agente con modelo de lenguaje |
| ⚙️ det | Paso determinista (regla, BD, regex, envío de correo) |
| 🧑 humano | Intervención humana (admin o proveedor) |
| ◆ gateway | Decisión / bifurcación |

## Proceso AS-IS (manual, pre-IA)

```mermaid
flowchart TD
    A([Cliente escribe por WhatsApp]) --> B[🧑 Asesor lee y responde]
    B --> C[🧑 Busca producto y precio manualmente]
    C --> D{◆ ¿Hay stock?}
    D -- Sí --> E[🧑 Informa precio]
    D -- No --> F[🧑 Contacta al proveedor por su cuenta]
    F --> G[🧑 Espera respuesta - horas/días]
    G --> E
    E --> H[🧑 Toma datos del cliente]
    H --> I[🧑 Coordina envío/instalación]
    I --> J[🧑 Verifica pago y confirma]
    J --> K([Pedido gestionado])
```

**Problemas del as-is:** todo depende de un asesor humano; tiempos muertos esperando al
proveedor; sin trazabilidad; no escala con el volumen (2,400 consultas/mes, §7.2).

## Proceso TO-BE (con agentes de IA)

```mermaid
flowchart TD
    A([Cliente escribe en chat web]) --> ORq[🤖 Orquestador: clasifica intención]
    ORq --> G0{◆ Intención}
    G0 -- Fuera de contexto --> FX[🤖 Responde y reencauza] --> FIN0([Fin])
    G0 -- Nueva/Seguimiento --> SA[🤖 SalesAgent]

    SA --> FIND[⚙️ find_and_add_product - búsqueda RAG/BD]
    FIND --> G1{◆ ¿En catálogo y con stock?}

    G1 -- Sí, con stock --> PRICE[🤖 Informa precio real S/]
    G1 -- Sin stock / fuera de catálogo --> WAIT[⚙️ Estado = ESPERANDO_PROVEEDOR]

    WAIT --> INV[⚙️ InventoryAgent envía email de cotización]
    INV --> SUP[[🧑 Proveedor responde por Gmail]]
    SUP --> CRON[⚙️ Vercel Cron cada 5 min]
    CRON --> SUPA[⚙️ SupplierAgent: extrae precio + margen]
    SUPA --> COT[⚙️ Estado = COTIZADO] --> PRICE

    PRICE --> DATA[🤖 Recopila datos del cliente]
    DATA --> G2{◆ ¿Requiere instalación?}
    G2 -- Sí --> LOG[🤖 LogisticsAgent agenda técnico]
    G2 -- No --> DESP[🤖 Confirma despacho]
    LOG --> PAY[🤖 Comparte datos de pago -> PAGO_PENDIENTE]
    DESP --> PAY

    PAY --> ADMIN[[🧑 Admin verifica depósito]]
    ADMIN --> CONF[⚙️ PAGO_CONFIRMADO -> EN_RUTA]
    CONF --> DONE([⚙️ COMPLETADO])
```

## Delimitación LLM / determinista / humano

| Paso | Tipo | Componente |
|------|------|-----------|
| Clasificar intención | 🤖 LLM (salida zod) | `orchestratorAgent` |
| Conversación de ventas y recopilación de datos | 🤖 LLM (LangGraph) | `salesAgent` |
| Búsqueda/agregado de producto | ⚙️ det (BD + RAG) | `find_and_add_product` |
| Consulta técnica | 🤖 LLM + ⚙️ RAG | `rag_query` (pgvector) |
| Envío de cotización al proveedor | ⚙️ det (Gmail) | `inventoryAgent` |
| **Respuesta del proveedor** | 🧑 humano | correo Gmail |
| Emparejar respuesta y extraer precio | ⚙️ det (cron + regex + margen) | `supplierAgent` |
| Coordinación logística / instalación | 🤖 LLM + ⚙️ tools | `logisticsAgent` |
| **Verificación del depósito** | 🧑 humano | panel admin |
| Transiciones de estado | ⚙️ det (guardado + guardrails) | `update_order_status` |

## Puntos de intervención humana (HITL, §3.5)

1. **Proveedor** responde el correo de cotización (asíncrono, fuera del sistema).
2. **Admin** verifica el depósito antes de pasar a `PAGO_CONFIRMADO` (control de alto
   impacto: dinero). Punto natural para un *interrupt* de LangGraph si se migra la
   memoria del grafo a un checkpointer durable.

> El to-be automatiza toda la conversación y la coordinación, dejando al humano solo las
> dos decisiones de alto impacto/externas. Esto ataca directamente los tiempos muertos y
> la no-escalabilidad del as-is.
