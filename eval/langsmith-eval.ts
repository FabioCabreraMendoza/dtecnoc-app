/**
 * §5.3 — Evaluación en LangSmith (datasets + experiments).
 *
 * 1. Sube el golden set como dataset (idempotente).
 * 2. Ejecuta un experimento sobre el dataset con un evaluador de correctness.
 *
 * Uso: npx tsx eval/langsmith-eval.ts
 * Requiere LANGSMITH_API_KEY, LANGSMITH_PROJECT y GROQ_API_KEY.
 *
 * Cada experimento es comparable con el baseline en la UI de LangSmith; la regla
 * de promoción (§5.3.3 / §8.2) es no desplegar si cae frente al baseline.
 */
import "dotenv/config";
import { Client } from "langsmith";
import { evaluate } from "langsmith/evaluation";
import { orchestratorAgent } from "@/lib/agents/orchestrator";
import { GOLDEN_SET } from "./golden-set";

const DATASET_NAME = "dtecnoc-intent-golden";

async function ensureDataset(client: Client): Promise<void> {
  const exists = await client.hasDataset({ datasetName: DATASET_NAME });
  if (exists) {
    console.log(`Dataset "${DATASET_NAME}" ya existe. Se reutiliza.`);
    return;
  }
  const dataset = await client.createDataset(DATASET_NAME, {
    description: "Golden set de clasificación de intención — DTECNOC (§5.1)",
  });
  await client.createExamples(
    GOLDEN_SET.map((c) => ({
      dataset_id: dataset.id,
      inputs: { message: c.input },
      outputs: { intent: c.expected },
      metadata: { rf: c.rf, notes: c.notes ?? "" },
    }))
  );
  console.log(`Dataset creado con ${GOLDEN_SET.length} ejemplos.`);
}

// Evaluador de correctness determinista (§5.3.2 — tipo heurístico Exact).
function correctness(args: {
  outputs: Record<string, unknown>;
  referenceOutputs?: Record<string, unknown>;
}) {
  const score = args.outputs?.intent === args.referenceOutputs?.intent ? 1 : 0;
  return { key: "correctness", score };
}

async function main() {
  if (!process.env.LANGSMITH_API_KEY) {
    console.error("Falta LANGSMITH_API_KEY. Aborta.");
    process.exit(1);
  }
  const client = new Client();
  await ensureDataset(client);

  console.log("\n▶ Ejecutando experimento sobre LangSmith...\n");
  await evaluate(
    async (inputs: Record<string, unknown>) => {
      const res = await orchestratorAgent(String(inputs.message), "eval-user");
      return { intent: res.intent };
    },
    {
      data: DATASET_NAME,
      evaluators: [correctness],
      experimentPrefix: "intent-classifier",
      client,
    }
  );
  console.log("\n✓ Experimento enviado. Revisa los resultados en LangSmith.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
