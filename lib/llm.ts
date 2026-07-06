import { ChatGroq } from "@langchain/groq";
import { GoogleGenerativeAIEmbeddings } from "@langchain/google-genai";
import { InMemoryCache } from "@langchain/core/caches";
import type { BaseChatModel } from "@langchain/core/language_models/chat_models";
import type { Runnable } from "@langchain/core/runnables";
import type { BaseMessage } from "@langchain/core/messages";
import type { AIMessageChunk } from "@langchain/core/messages";
import { config } from "@/lib/config";

// ── Modelos ───────────────────────────────────────────────────────────────────
// Los modelos se resuelven por entorno (§8.1): dev usa flash; staging/prod, pro.
export const GROQ_MODEL = config.fastModel; // rápido / barato
export const GROQ_MODEL_SALES = config.salesModel; // razonamiento de ventas

// §3.8 — Caché de resultados para entradas repetidas (ahorro de costo/latencia).
// En memoria por proceso; en producción serverless se puede sustituir por una
// caché distribuida (Redis) sin cambiar los call sites.
const llmCache = new InMemoryCache();

export interface ChatOptions {
  temperature?: number;
  maxTokens?: number;
  /** Timeout por llamada en ms (§3.8). */
  timeoutMs?: number;
  /** Habilita caché de respuestas. Recomendado solo para llamadas deterministas. */
  cache?: boolean;
}

/** Crea un ChatGroq LangChain con reintentos, timeout y caché opcional. */
export function makeChat(model: string, opts: ChatOptions = {}): ChatGroq {
  return new ChatGroq({
    apiKey: process.env.GROQ_API_KEY,
    model,
    temperature: opts.temperature ?? 0.3,
    maxTokens: opts.maxTokens ?? 400,
    maxRetries: 2, // §3.8 — reintentos ante errores transitorios del proveedor
    timeout: opts.timeoutMs ?? 30_000, // §3.8 — timeout por paso
    ...(opts.cache ? { cache: llmCache } : {}),
  });
}

/**
 * Modelo de ventas (70b) con fallback automático al 8b.
 * Sustituye al manejo manual del 429 que existía en el salesAgent original.
 * §3.8 — fallback entre modelos.
 */
export function salesChat(
  opts: ChatOptions = {}
): Runnable<BaseMessage[], AIMessageChunk> {
  const primary = makeChat(GROQ_MODEL_SALES, opts);
  const fallback = makeChat(GROQ_MODEL, opts);
  return primary.withFallbacks([fallback]);
}

/** Modelo rápido (8b) para enrutamiento, logística y tareas deterministas. */
export function fastChat(opts: ChatOptions = {}): ChatGroq {
  return makeChat(GROQ_MODEL, opts);
}

// ── Embeddings ────────────────────────────────────────────────────────────────
// text-embedding-004 de Google (§3.3 del documento de diseño).
let _embeddings: GoogleGenerativeAIEmbeddings | null = null;
export function getEmbeddings(): GoogleGenerativeAIEmbeddings {
  if (!_embeddings) {
    _embeddings = new GoogleGenerativeAIEmbeddings({
      apiKey: process.env.GOOGLE_API_KEY,
      model: "text-embedding-004",
    });
  }
  return _embeddings;
}

// Se re-exporta el tipo para que los agentes tipen sus modelos sin acoplarse a Groq.
export type ChatModel = BaseChatModel;
