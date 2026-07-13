import { z } from "zod";

/**
 * §8.1 / §8.4 — Configuración por entorno.
 *
 * Fuente única de verdad de los ajustes NO secretos de cada entorno (versionados
 * a propósito) y validación de los secretos que llegan por variables de entorno.
 *
 * El entorno se decide con APP_ENV (development | staging | production), desacoplado
 * de NODE_ENV para poder tener un "staging" real (Next.js solo conoce dev/prod).
 */

export type AppEnv = "development" | "staging" | "production";

function resolveEnv(): AppEnv {
  const raw = (process.env.APP_ENV ?? process.env.NODE_ENV ?? "development").toLowerCase();
  if (raw === "production") return "production";
  if (raw === "staging") return "staging";
  return "development";
}

export const APP_ENV: AppEnv = resolveEnv();

// Modelos DeepSeek disponibles (API compatible con OpenAI, pago por uso muy barato,
// sin los límites de la capa gratuita de Gemini). "deepseek-v4-flash" (modo no-thinking)
// sirve tanto para enrutamiento/logística como para el razonamiento de ventas.
// NOTA: los alias legacy "deepseek-chat"/"deepseek-reasoner" se deprecan el 2026-07-24;
// se usa directamente el nombre vigente. Confirma en https://api-docs.deepseek.com/quick_start/pricing.
const MODEL_FLASH = "deepseek-v4-flash"; // rápido / barato (modo no-thinking)
// Para staging/producción se puede subir a "deepseek-v4-pro" sin tocar el resto del
// código; por defecto se mantiene v4-flash para no incurrir en más costo.
const MODEL_PRO = "deepseek-v4-flash";

export interface EnvSettings {
  /** Modelo para el agente de ventas (razonamiento). */
  salesModel: string;
  /** Modelo para enrutamiento/logística/tareas deterministas. */
  fastModel: string;
  /** Proyecto de LangSmith según convención <proyecto>-<env> (§5.3.1). */
  langsmithProject: string;
  /** Habilita el tracing hacia LangSmith. */
  tracingEnabled: boolean;
  /** Nivel de log de la aplicación. */
  logLevel: "debug" | "info" | "warn" | "error";
  /** Fragmentos recuperados por consulta RAG (§3.3). */
  ragTopK: number;
}

// §8.1 — Desarrollo: modelo flash y logs verbosos; Staging/Producción: modelo pro.
const SETTINGS: Record<AppEnv, EnvSettings> = {
  development: {
    salesModel: MODEL_FLASH,
    fastModel: MODEL_FLASH,
    langsmithProject: "dtecnoc-dev",
    tracingEnabled: true,
    logLevel: "debug",
    ragTopK: 4,
  },
  staging: {
    salesModel: MODEL_PRO,
    fastModel: MODEL_FLASH,
    langsmithProject: "dtecnoc-stg",
    tracingEnabled: true,
    logLevel: "info",
    ragTopK: 4,
  },
  production: {
    salesModel: MODEL_PRO,
    fastModel: MODEL_FLASH,
    langsmithProject: "dtecnoc-prod",
    tracingEnabled: true,
    logLevel: "warn",
    ragTopK: 4,
  },
};

export const config: EnvSettings = SETTINGS[APP_ENV];

// Impone la convención de nombres del proyecto LangSmith por entorno (§5.3.1),
// sin pisar un valor explícito del operador.
if (config.tracingEnabled && !process.env.LANGSMITH_PROJECT) {
  process.env.LANGSMITH_PROJECT = config.langsmithProject;
}

// ── Validación de secretos (§8.4 — mínimo privilegio / fail-fast) ─────────────
// Se valida bajo demanda para no romper `next build` sin secretos.
const secretsSchema = z.object({
  DATABASE_URL: z.string().min(1, "DATABASE_URL requerido"),
  DEEPSEEK_API_KEY: z.string().min(1, "DEEPSEEK_API_KEY requerido (chat)"),
  GOOGLE_API_KEY: z
    .string()
    .min(1, "GOOGLE_API_KEY requerido (embeddings RAG)"),
  JWT_SECRET: z.string().min(1, "JWT_SECRET requerido"),
  ADMIN_SECRET: z.string().min(1, "ADMIN_SECRET requerido"),
});

export type AppSecrets = z.infer<typeof secretsSchema>;

/**
 * Valida que estén presentes los secretos obligatorios. Úsalo en el arranque de
 * scripts (seed, eval, reindex) para fallar temprano con un mensaje claro.
 */
export function validateSecrets(): AppSecrets {
  const parsed = secretsSchema.safeParse(process.env);
  if (!parsed.success) {
    const detail = parsed.error.issues
      .map((i) => `${i.path.join(".")}: ${i.message}`)
      .join("\n  - ");
    throw new Error(
      `[config] Configuración de entorno inválida para APP_ENV=${APP_ENV}:\n  - ${detail}`
    );
  }
  return parsed.data;
}
