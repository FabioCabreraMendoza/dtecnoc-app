/**
 * §5.4 — Procedimiento de evaluación (runner local).
 *
 * Ejecuta el sistema sobre todo el golden set, calcula las métricas de §5.2 y las
 * compara con los umbrales. Devuelve exit code ≠ 0 si no se superan (puerta CI, §8.2).
 *
 * Uso: npx tsx eval/run-eval.ts
 * Requiere GROQ_API_KEY. Si LANGSMITH_TRACING=true + LANGSMITH_API_KEY, cada
 * ejecución del agente queda trazada automáticamente en LangSmith (§5.3.1).
 */
import "dotenv/config";
import { APP_ENV } from "@/lib/config";
import { orchestratorAgent } from "@/lib/agents/orchestrator";
import { GOLDEN_SET } from "./golden-set";

// Umbrales (§2.4 / §5.2)
const ACCURACY_THRESHOLD = 0.9;
const P95_LATENCY_MS = 3000;

function percentile(values: number[], p: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const idx = Math.ceil((p / 100) * sorted.length) - 1;
  return sorted[Math.max(0, idx)];
}

async function main() {
  console.log(`\n▶ [${APP_ENV}] Evaluando ${GOLDEN_SET.length} casos del golden set...\n`);

  const latencies: number[] = [];
  let correct = 0;
  const rows: Array<{ id: string; ok: boolean; got: string; exp: string; ms: number }> = [];

  for (const c of GOLDEN_SET) {
    const t0 = Date.now();
    let got = "ERROR";
    try {
      const res = await orchestratorAgent(c.input, "eval-user");
      got = res.intent;
    } catch (err) {
      console.error(`  ${c.id} error:`, err);
    }
    const ms = Date.now() - t0;
    latencies.push(ms);
    const ok = got === c.expected;
    if (ok) correct++;
    rows.push({ id: c.id, ok, got, exp: c.expected, ms });
    console.log(`  ${ok ? "✓" : "✗"} ${c.id}  esperado=${c.expected}  obtenido=${got}  (${ms}ms)`);
  }

  const accuracy = correct / GOLDEN_SET.length;
  const p95 = percentile(latencies, 95);

  console.log("\n── Resultados (§5.2) ─────────────────────────────");
  console.log(`  Exactitud:      ${(accuracy * 100).toFixed(1)}%  (umbral ≥ ${ACCURACY_THRESHOLD * 100}%)`);
  console.log(`  Latencia p95:   ${p95}ms  (umbral < ${P95_LATENCY_MS}ms)`);
  console.log("──────────────────────────────────────────────────\n");

  const accuracyOk = accuracy >= ACCURACY_THRESHOLD;
  const latencyOk = p95 < P95_LATENCY_MS;

  if (!accuracyOk || !latencyOk) {
    console.error("✗ La evaluación NO supera los umbrales. (regla de promoción §5.3.3)");
    process.exit(1);
  }
  console.log("✓ Evaluación aprobada.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
