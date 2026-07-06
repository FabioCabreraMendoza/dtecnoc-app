/**
 * Reindexa todos los EmbeddingDocument en el vector store pgvector.
 * Uso: npx tsx scripts/reindex-rag.ts
 *
 * Requiere GOOGLE_API_KEY (embeddings) y DATABASE_URL con la extensión `vector`
 * habilitada (en Supabase: SQL Editor → `create extension if not exists vector;`).
 */
import "dotenv/config";
import { validateSecrets } from "@/lib/config";
import { prisma } from "@/lib/prisma";
import { ingestDocument, deleteDocumentVectors } from "@/lib/tools/rag";

async function main() {
  validateSecrets();

  const docs = await prisma.embeddingDocument.findMany({
    where: {
      NOT: { metadata_json: { path: ["type"], equals: "gmail_history_id" } },
    },
    select: { id: true, content: true, metadata_json: true },
  });

  console.log(`Reindexando ${docs.length} documentos...`);
  let totalChunks = 0;
  for (const doc of docs) {
    await deleteDocumentVectors(doc.id); // idempotente: limpia antes de reinsertar
    const meta = (doc.metadata_json as Record<string, unknown>) ?? {};
    const { chunks } = await ingestDocument(doc.id, doc.content, meta);
    totalChunks += chunks;
    console.log(`  ✓ ${doc.id} → ${chunks} chunks`);
  }
  console.log(`Listo. ${totalChunks} chunks indexados.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
