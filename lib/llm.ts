import { ChatDeepSeek } from "@langchain/deepseek";
import { GoogleGenerativeAIEmbeddings } from "@langchain/google-genai";
import { InMemoryCache } from "@langchain/core/caches";
import type { BaseChatModel } from "@langchain/core/language_models/chat_models";
import type { Runnable } from "@langchain/core/runnables";
import type { BaseMessage } from "@langchain/core/messages";
import type { AIMessageChunk } from "@langchain/core/messages";
import { config } from "@/lib/config";

// ── Modelos ───────────────────────────────────────────────────────────────────
// Modelos resueltos por entorno (§8.1). El CHAT usa DeepSeek (DEEPSEEK_API_KEY,
// pago por uso, muy barato y sin los límites de la capa gratuita de Gemini); los
// EMBEDDINGS del RAG se quedan en Google (GOOGLE_API_KEY), ya que DeepSeek no
// ofrece una API de embeddings.
export const FAST_MODEL = config.fastModel; // rápido / barato
export const SALES_MODEL = config.salesModel; // razonamiento de ventas

// §3.8 — Caché de resultados para entradas repetidas (ahorro de costo/latencia).
// En memoria por proceso; en producción serverless se puede sustituir por una
// caché distribuida (Redis) sin cambiar los call sites.
const llmCache = new InMemoryCache();

export interface ChatOptions {
  temperature?: number;
  maxTokens?: number;
  /** Habilita caché de respuestas. Recomendado solo para llamadas deterministas. */
  cache?: boolean;
}

/** Crea un ChatDeepSeek con reintentos y caché opcional. */
export function makeChat(
  model: string,
  opts: ChatOptions = {}
): ChatDeepSeek {
  return new ChatDeepSeek({
    apiKey: process.env.DEEPSEEK_API_KEY,
    model,
    temperature: opts.temperature ?? 0.3,
    maxTokens: opts.maxTokens ?? 400,
    // §3.8 — 1 reintento: fallar rápido evita que un flujo de varias llamadas se
    // cuelgue hasta el timeout ante un error transitorio del proveedor.
    maxRetries: 1,
    // deepseek-v4-flash viene en modo "thinking" por defecto, que no admite
    // tool_choice forzado (rompe bindTools/withStructuredOutput). Se desactiva
    // explícitamente para usar el modo no-thinking (equivalente al legacy
    // "deepseek-chat").
    modelKwargs: { thinking: { type: "disabled" } },
    ...(opts.cache ? { cache: llmCache } : {}),
  });
}

/**
 * Modelo de ventas con fallback automático a un segundo modelo.
 * Sustituye al manejo manual del 429 que existía en el salesAgent original.
 * §3.8 — fallback entre modelos.
 */
export function salesChat(
  opts: ChatOptions = {}
): Runnable<BaseMessage[], AIMessageChunk> {
  const primary = makeChat(SALES_MODEL, opts);
  const fallback = makeChat(FAST_MODEL, opts);
  return primary.withFallbacks([fallback]);
}

/** Modelo rápido para enrutamiento, logística y tareas deterministas. */
export function fastChat(opts: ChatOptions = {}): ChatDeepSeek {
  return makeChat(FAST_MODEL, opts);
}

// ── Embeddings ────────────────────────────────────────────────────────────────
// gemini-embedding-001 de Google (3072 dim). Reemplaza a text-embedding-004, que
// no está disponible en la API gratuita v1beta para todas las claves. §3.3
let _embeddings: GoogleGenerativeAIEmbeddings | null = null;
export function getEmbeddings(): GoogleGenerativeAIEmbeddings {
  if (!_embeddings) {
    _embeddings = new GoogleGenerativeAIEmbeddings({
      apiKey: process.env.GOOGLE_API_KEY,
      model: "gemini-embedding-001",
    });
  }
  return _embeddings;
}

// Se re-exporta el tipo para que los agentes tipen sus modelos sin acoplarse al proveedor.
export type ChatModel = BaseChatModel;
