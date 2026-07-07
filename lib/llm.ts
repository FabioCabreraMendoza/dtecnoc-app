import { ChatGoogleGenerativeAI } from "@langchain/google-genai";
import { GoogleGenerativeAIEmbeddings } from "@langchain/google-genai";
import { InMemoryCache } from "@langchain/core/caches";
import type { BaseChatModel } from "@langchain/core/language_models/chat_models";
import type { Runnable } from "@langchain/core/runnables";
import type { BaseMessage } from "@langchain/core/messages";
import type { AIMessageChunk } from "@langchain/core/messages";
import { config } from "@/lib/config";

// ── Modelos ───────────────────────────────────────────────────────────────────
// Modelos Gemini resueltos por entorno (§8.1). La misma GOOGLE_API_KEY sirve para
// el chat y para los embeddings (un solo proveedor). Los modelos Flash son gratis
// en la capa gratuita de Google AI Studio.
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

/** Crea un ChatGoogleGenerativeAI (Gemini) con reintentos y caché opcional. */
export function makeChat(
  model: string,
  opts: ChatOptions = {}
): ChatGoogleGenerativeAI {
  return new ChatGoogleGenerativeAI({
    apiKey: process.env.GOOGLE_API_KEY,
    model,
    temperature: opts.temperature ?? 0.3,
    maxOutputTokens: opts.maxTokens ?? 400,
    maxRetries: 2, // §3.8 — reintentos ante errores transitorios del proveedor
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
export function fastChat(opts: ChatOptions = {}): ChatGoogleGenerativeAI {
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
