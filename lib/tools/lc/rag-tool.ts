import { tool } from "@langchain/core/tools";
import { z } from "zod";
import { rag_query } from "@/lib/tools/rag";

/**
 * §3.3 / §3.4 — Recuperación semántica sobre la base de conocimiento técnico.
 * La implementación real (pgvector + embeddings) vive en lib/tools/rag.ts.
 */
export const ragQueryTool = tool(
  async ({ technical_question }) => {
    return rag_query(technical_question);
  },
  {
    name: "rag_query_supabase",
    description:
      "Consulta la base de conocimiento técnico de DTECNOC (manuales, especificaciones, " +
      "instalación) para responder dudas técnicas del cliente. La respuesta debe apoyarse " +
      "en el contexto recuperado.",
    schema: z.object({
      technical_question: z
        .string()
        .describe("La duda técnica del cliente, en lenguaje natural"),
    }),
  }
);
