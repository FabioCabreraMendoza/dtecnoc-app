import { prisma } from "@/lib/prisma";

export async function rag_query_supabase(question: string): Promise<string> {
  try {
    // Keyword extraction: split into meaningful words (≥4 chars), ignore stopwords
    const stopwords = new Set(["para", "como", "que", "cual", "cuál", "cuales", "tiene", "hace", "puede"]);
    const keywords = question
      .toLowerCase()
      .replace(/[¿?¡!.,;:]/g, "")
      .split(/\s+/)
      .filter((w) => w.length >= 4 && !stopwords.has(w));

    let docs: Array<{ content: string }> = [];

    if (keywords.length > 0) {
      // Search with OR across all keywords using raw SQL ILIKE
      const conditions = keywords.map((kw) => `content ILIKE '%${kw.replace(/'/g, "''")}%'`).join(" OR ");
      docs = await prisma.$queryRawUnsafe<Array<{ content: string }>>(
        `SELECT content FROM "EmbeddingDocument" WHERE ${conditions} ORDER BY updated_at DESC LIMIT 4`
      );
    }

    // Fallback to most recent docs if no keyword match
    if (docs.length === 0) {
      docs = await prisma.embeddingDocument.findMany({
        take: 3,
        orderBy: { updated_at: "desc" },
        where: {
          NOT: { metadata_json: { path: ["type"], equals: "gmail_history_id" } },
        },
        select: { content: true },
      });
    }

    if (docs.length === 0) {
      return "No hay documentos técnicos disponibles. Por favor contacta directamente con nuestro equipo técnico.";
    }

    const context = docs.map((d) => d.content).join("\n\n---\n\n");
    return `Información técnica disponible:\n\n${context}`;
  } catch {
    return "Información técnica no disponible en este momento.";
  }
}
