# Entornos y despliegue — DTECNOC

Diseño de los entornos de trabajo para un flujo profesional. Cubre las secciones
§8.1–§8.5 del *Documento de Diseño*. La configuración **no secreta** por entorno vive
en [`lib/config.ts`](lib/config.ts); los **secretos** se inyectan por variables de
entorno (nunca se versionan).

## §8.1 — Entornos

| Entorno | `APP_ENV` | Propósito | Datos | Modelo ventas | LangSmith | Rama / despliegue |
|---------|-----------|-----------|-------|---------------|-----------|-------------------|
| **Desarrollo** | `development` | Iteración rápida y pruebas locales | Sintéticos (seed) | `gemini-2.0-flash` (gratis) | `dtecnoc-dev` | local (`npm run dev`) |
| **Staging** | `staging` | Evaluación contra el dataset completo antes de producción | Reales anonimizados | `gemini-2.0-flash` | `dtecnoc-stg` | rama `develop` → Vercel Preview |
| **Producción** | `production` | Tráfico real | Reales | `gemini-2.0-flash` (o modelo pro de pago) | `dtecnoc-prod` | rama `main` → Vercel Production |

Los valores anteriores están codificados en la matriz `SETTINGS` de `lib/config.ts`.
Cambiar `APP_ENV` cambia automáticamente modelo, proyecto LangSmith, nivel de log y `k` de RAG.

## §8.2 — CI/CD y versionado

Pipeline en [`.github/workflows/ci.yml`](.github/workflows/ci.yml):

1. **check** (push/PR): `npm ci` → `prisma generate` → `typecheck` → `lint` → `build`.
2. **evaluate** (solo PR): ejecuta el golden set (`npm run eval`) como **puerta de
   promoción** — si la exactitud/latencia caen bajo el umbral (§5.2), el PR falla.

Prompts, esquemas zod y `lib/config.ts` se versionan como código (§8.2). El versionado
de prompts se lleva en el *Catálogo de prompts* (§6) del documento de diseño.

### Flujo de ramas y promoción

```
feature/* ──PR──▶ develop ──▶ Vercel Preview (staging)  ──PR──▶ main ──▶ Vercel Production
                    │                                              │
                 eval gate                                     eval gate
```

- `develop`: cada push despliega un Preview (staging) y corre la evaluación.
- `main`: protegida; requiere PR verde (check + evaluate) para promover a producción.

## §8.3 — Topología de despliegue

**Elegida: Vercel (serverless) + Supabase (Postgres/pgvector).** Justificación frente a
§2.4: MVP con baja carga, sin equipo de ops dedicado, latencia aceptable y coste
proporcional al uso. El cron de proveedores usa Vercel Cron ([`vercel.json`](vercel.json)).
Alternativas descartadas: Kubernetes (sobredimensionado para el volumen actual),
self-hosted Docker (sin HA), LangGraph Platform (se puede adoptar si la memoria del
grafo pasa a `PostgresSaver`, ver [`MIGRATION.md`](MIGRATION.md)).

## §8.4 — Configuración y secretos

- **No secreto**, versionado: `lib/config.ts` (modelos, proyecto LangSmith, `k`, logs).
- **Secreto**, por entorno: variables de entorno. En local, `.env.local` (ignorado por
  git); en la nube, *Environment Variables* de Vercel separadas por entorno.
- `validateSecrets()` (en `lib/config.ts`) hace *fail-fast* con mensaje claro al arrancar
  scripts (`seed`, `eval`, `reindex-rag`).
- Rotación de claves: recomendada trimestral; mínimo privilegio en credenciales de BD.

### Matriz de secretos por entorno

| Variable | development | staging | production | Notas |
|----------|:-----------:|:-------:|:----------:|-------|
| `DATABASE_URL` | BD dev | BD staging | BD prod | proyecto Supabase distinto por entorno |
| `GOOGLE_API_KEY` | ✓ | ✓ | ✓ | Gemini (chat) + embeddings RAG |
| `LANGSMITH_API_KEY` | ✓ | ✓ | ✓ | observabilidad |
| `JWT_SECRET` / `ADMIN_SECRET` | ✓ | ✓ | ✓ | distintos por entorno |
| `GMAIL_*` | sandbox | buzón staging | buzón real | OAuth por entorno |
| `CRON_SECRET` | — | ✓ | ✓ | protege `/api/cron/*` |

## §8.5 — Estrategias de release

- **Preview por PR** (Vercel): cada PR obtiene una URL aislada para validación manual.
- **Canary/promoción**: `develop` (staging) recibe el cambio primero; solo se abre PR a
  `main` si las métricas se mantienen.
- **Rollback**: *Instant Rollback* de Vercel (volver al despliegue anterior en un clic).
- **Feature flags**: se pueden añadir como campos booleanos en `EnvSettings` de
  `lib/config.ts` para activar comportamiento por entorno sin redeploy de código.

## Puesta en marcha por entorno

```bash
# Desarrollo (local)
cp .env.example .env.local      # rellena secretos de DEV
APP_ENV=development npm run dev

# Verificación previa a PR (equivale a la CI)
npm run typecheck && npm run lint && npm run build && npm run eval

# Datos
npm run seed                    # datos sintéticos (dev)
npm run reindex-rag             # indexa la base de conocimiento al vector store
```

En Supabase (una vez por entorno): `create extension if not exists vector;`
