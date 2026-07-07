# §7 — Medición de éxito y ROI (DTECNOC)

> Sección 7 del *Documento de Diseño*. Las métricas técnicas (§5) miden si el sistema
> **funciona**; esta sección mide si **vale la pena**. Todos los montos están en soles
> (S/) y los supuestos se declaran de forma explícita para permitir análisis de
> sensibilidad (§7.3).

## 7.1 KPIs de negocio

| KPI | Definición | Vincula a objetivo | Meta |
|-----|-----------|--------------------|------|
| Tiempo medio de respuesta al cliente | Desde la consulta hasta la resolución | Reducción del 60% | ≤ 7 min |
| Casos resueltos sin escalamiento | % de conversaciones cerradas sin humano | Autonomía del asesor IA | ≥ 70% |
| Costo por consulta atendida | Costo total mensual / nº de consultas | Eficiencia operativa | ≤ S/ 0.50 |
| Tasa de conversión a pedido | % de consultas que llegan a `PAGO_PENDIENTE`+ | Ingreso | ≥ 15% |
| Satisfacción (CSAT) | Encuesta 1–5 tras la interacción | Calidad percibida | ≥ 4.2 / 5 |

Cada KPI es observable con datos que la app ya registra (estados de `Order`,
`ClientConversation`, timestamps) o con una encuesta post-chat a añadir.

## 7.2 Línea base (baseline pre-IA)

Reconstruida a partir del ejemplo de la plantilla y del contexto de atención por
WhatsApp/manual de DTECNOC. **Medir 2–4 semanas reales antes del despliegue** para
sustituir estos valores de referencia.

| Métrica | Valor base (ref.) | Fuente / periodo |
|---------|-------------------|------------------|
| Tiempo medio de atención | 18 min | Atención manual, promedio |
| Volumen de consultas | 2,400 / mes | Mesa de ayuda / WhatsApp |
| Resolución sin escalamiento | ~0% (todo manual) | — |
| Costo laboral por hora de asesor | S/ 10 / hora | Referencia local Trujillo |

## 7.3 Cálculo de ROI

### Supuestos declarados (variables de sensibilidad)

| Supuesto | Valor base | Nota |
|----------|-----------|------|
| Volumen mensual | 2,400 consultas | §7.2 |
| Tokens por conversación | ~10,000 in + 1,000 out | ~5 turnos × (2k in + 200 out) |
| Modelo de chat `gemini-2.0-flash` | US$ 0 (capa gratuita de Google AI Studio) | Flash gratis dentro de los límites de peticiones |
| Embeddings `text-embedding-004` | ~US$ 0 (capa gratuita) | RAG |
| Tipo de cambio | US$ 1 = S/ 3.75 | referencia |
| % automatizado (sin escalar) | 70% | = meta KPI |
| Tiempo ahorrado por caso automatizado | 18 min | = baseline |

### Costos del proyecto

| Concepto | Monto (S/) | Periodicidad |
|----------|-----------|--------------|
| Desarrollo (≈80 h-equipo × S/ 40) | 3,200 | Una vez (inversión inicial) |
| Tokens LLM (Gemini Flash, capa gratuita) | ≈ 0 | Mensual |
| Infraestructura (Supabase Pro + LangSmith) | ≈ 130 | Mensual |
| Mantenimiento (curación datos/prompts/evals) | ≈ 100 | Mensual |
| **Total operativo mensual** | **≈ 230** | Mensual |

> Costo por consulta ≈ S/ 230 / 2,400 ≈ **S/ 0.10** → cumple la meta ≤ S/ 0.50 (§7.1).
> Nota: usar la capa gratuita de Gemini elimina el costo de tokens; si se migra a un
> modelo de pago, sumar la tarifa correspondiente aquí.

### Beneficios cuantificables (mensual)

| Beneficio | Cálculo | Estimación (S/) |
|-----------|---------|-----------------|
| Horas-persona liberadas | 2,400 × 70% × 18 min = 504 h × S/ 10 | **5,040** |
| Reducción de errores/retrabajo | estimación conservadora | 300 |
| **Beneficio bruto mensual** | | **≈ 5,340** |

### Fórmula y resultado

```
Beneficio neto mensual = 5,340 − 230 = S/ 5,110
Periodo de retorno     = Inversión inicial / Beneficio neto mensual
                       = 3,200 / 5,110 ≈ 0.6 meses
ROI anual (%)          = (Beneficio neto anual / Costo total anual) × 100
Beneficio neto anual   = 5,110 × 12 = 61,320
Costo total anual      = 3,200 + (230 × 12) = 5,960
ROI anual ≈ (61,320 / 5,960) × 100 ≈ 1,029%
```

### Análisis de sensibilidad (§7.3)

| Escenario | % automatizado | S/ / hora | Beneficio neto mensual | Payback | ROI anual |
|-----------|:--------------:|:---------:|:----------------------:|:-------:|:---------:|
| Conservador | 50% | 8 | ≈ S/ 2,587 | ≈ 1.2 meses | ≈ 455% |
| **Base** | 70% | 10 | ≈ S/ 5,110 | ≈ 0.6 meses | ≈ 1,029% |
| Optimista | 80% | 12 | ≈ S/ 6,620 | ≈ 0.5 meses | ≈ 1,180% |

Incluso en el escenario conservador el retorno es < 2 meses. El costo del LLM (≈ S/ 63/mes)
es una fracción menor frente al ahorro laboral: el driver de valor es el **tiempo de asesor
liberado**, no el precio del token.

## 7.4 Tablero de éxito (técnico + negocio)

Combina las métricas de §5 con los KPIs de §7.1. Es lo que se revisa con sponsors.

| Indicador | Dimensión | Umbral | Fuente |
|-----------|-----------|:------:|--------|
| Exactitud sobre golden set | Técnica | ≥ 90% | `npm run eval` / LangSmith |
| Groundedness (online) | Técnica | ≥ 95% | LangSmith evaluators (§5.3) |
| Latencia p95 | Técnica | < 3 s | trazas LangSmith |
| Costo por consulta | Operativa | ≤ S/ 0.50 | tokens × tarifa |
| Resolución sin escalado | Negocio | ≥ 70% | estados de `Order` |
| Conversión a pedido | Negocio | ≥ 15% | `Order.status` |
| CSAT | Negocio | ≥ 4.2/5 | encuesta post-chat |

## 7.5 Cadencia de revisión

- **Diaria (automatizada):** dashboards de costo, latencia y errores (LangSmith + Vercel).
- **Semanal (equipo técnico):** métricas §5 y experimentos abiertos en LangSmith.
- **Mensual (sponsors):** tablero §7.4 y avance hacia los KPIs de negocio.
- **Trimestral:** revisión del ROI y decisión de continuar / escalar / pivotar.

---

*Los montos son estimaciones con supuestos declarados; sustituir por mediciones reales de
la baseline (§7.2) antes de presentar a sponsors. El chat corre en la capa gratuita de
Gemini; si se migra a un modelo de pago, incorporar su tarifa vigente.*
