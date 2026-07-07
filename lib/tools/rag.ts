import { PGVectorStore } from "@langchain/community/vectorstores/pgvector";
import { RecursiveCharacterTextSplitter } from "@langchain/textsplitters";
import { Document } from "@langchain/core/documents";
import type { PoolConfig } from "pg";
import { getEmbeddings } from "@/lib/llm";
import { config } from "@/lib/config";

/**
 * §3.3 — Subsistema RAG (recuperación semántica).
 *
 * Sustituye la antigua búsqueda por keyword ILIKE por un vector store real
 * (pgvector sobre Supabase/Postgres) con embeddings gemini-embedding-001.
 *
 * Parámetros de diseño (§3.3):
 *  - Chunking recursive, objetivo ~800 tokens, overlap ~120.
 *  - k = 4 fragmentos recuperados.
 *  - Distancia coseno.
 */

const TABLE_NAME = "rag_documents";

const pgConfig = {
  postgresConnectionOptions: {
    connectionString: process.env.DATABASE_URL,
  } as PoolConfig,
  tableName: TABLE_NAME,
  columns: {
    idColumnName: "id",
    vectorColumnName: "vector",
    contentColumnName: "content",
    metadataColumnName: "metadata",
  },
  distanceStrategy: "cosine" as const,
};

let _storePromise: Promise<PGVectorStore> | null = null;

/** Inicializa (y cachea) el vector store. Crea la tabla/índice si no existen. */
export async function getVectorStore(): Promise<PGVectorStore> {
  if (!_storePromise) {
    _storePromise = PGVectorStore.initialize(getEmbeddings(), pgConfig);
  }
  return _storePromise;
}

// Chunker: los tamaños se expresan en caracteres; ~4 chars/token → 800 tokens ≈ 3200,
// overlap 120 tokens ≈ 480. Se mantiene la intención del diseño (§3.3).
const splitter = new RecursiveCharacterTextSplitter({
  chunkSize: 3200,
  chunkOverlap: 480,
});

/**
 * Ingesta un documento fuente: lo divide en chunks, genera embeddings y los
 * guarda en el vector store. Cada chunk conserva metadata.source_id para poder
 * borrarlo luego. §3.3 (estrategia de ingesta).
 */
export async function ingestDocument(
  sourceId: string,
  content: string,
  metadata: Record<string, unknown> = {}
): Promise<{ chunks: number }> {
  const store = await getVectorStore();
  const chunks = await splitter.splitText(content);
  const docs = chunks.map(
    (chunk, i) =>
      new Document({
        pageContent: chunk,
        metadata: { ...metadata, source_id: sourceId, chunk_index: i },
      })
  );
  await store.addDocuments(docs);
  return { chunks: docs.length };
}

/** Elimina del vector store todos los chunks de un documento fuente. */
export async function deleteDocumentVectors(sourceId: string): Promise<void> {
  const store = await getVectorStore();
  await store.delete({ filter: { source_id: sourceId } });
}

/**
 * Recupera contexto técnico relevante y lo devuelve como texto para el LLM.
 * Mantiene la firma de string que consume el agente (y el tool ragQueryTool).
 */
export async function rag_query(question: string): Promise<string> {
  try {
    const store = await getVectorStore();
    const results = await store.similaritySearch(question, config.ragTopK); // k por entorno (§3.3)
    if (results.length === 0) {
      return "No hay documentos técnicos disponibles. Por favor contacta directamente con nuestro equipo técnico.";
    }
    const context = results.map((d) => d.pageContent).join("\n\n---\n\n");
    return `Información técnica disponible:\n\n${context}`;
  } catch (err) {
    console.error("[rag_query] error:", err);
    return "Información técnica no disponible en este momento.";
  }
}

/**
 * Compatibilidad: el nombre histórico usado por el agente de ventas.
 * @deprecated Usa rag_query.
 */
export const rag_query_supabase = rag_query;
