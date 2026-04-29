import { runAgent, type RunEvent } from "@/lib/agent/runner";
import { CASES, type EvalCase } from "@/evals/cases";
import { judgeResponse, type JudgeOutput } from "@/evals/judge";

/**
 * Runs the eval suite end-to-end.
 *
 * For each case:
 *   1. Run the agent with the case's user message
 *   2. Collect the streamed events into a final response + tool call log
 *   3. Pass to the judge for rubric grading
 *   4. Print one line per case + an aggregate at the end
 *
 * Run with: npm run evals
 *
 * Requires ANTHROPIC_API_KEY in the environment. The agent uses Opus 4.7 by
 * default (~$0.05-0.20 per case). The judge uses Sonnet 4.6 (~$0.005 per case).
 * Full suite of 5 cases is roughly $0.50.
 */

interface CaseResult {
  case: EvalCase;
  agentResponse: string;
  toolCalls: { name: string; input: unknown; result: string; isError: boolean }[];
  costUsd: number;
  latencyMs: number;
  iterations: number;
  blocked: boolean;
  error: string | null;
  judgment: JudgeOutput | null;
}

async function runCase(c: EvalCase): Promise<CaseResult> {
  let agentResponse = "";
  const toolCalls: CaseResult["toolCalls"] = [];
  const pendingTools = new Map<string, { name: string; input: unknown }>();
  let costUsd = 0;
  let latencyMs = 0;
  let iterations = 0;
  let blocked = false;
  let error: string | null = null;

  const events = runAgent({
    messages: [{ role: "user", content: c.userMessage }],
  });

  for await (const event of events as AsyncGenerator<RunEvent>) {
    switch (event.type) {
      case "text_delta":
        agentResponse += event.delta;
        break;
      case "tool_call_start":
        pendingTools.set(event.id, { name: event.name, input: event.input });
        break;
      case "tool_call_result": {
        const pending = pendingTools.get(event.id);
        if (pending) {
          toolCalls.push({
            name: pending.name,
            input: pending.input,
            result: event.content,
            isError: event.isError,
          });
          pendingTools.delete(event.id);
        }
        break;
      }
      case "done":
        costUsd = event.totalCostUsd;
        latencyMs = event.totalLatencyMs;
        iterations = event.iterations;
        break;
      case "blocked":
        blocked = true;
        error = event.reason;
        break;
      case "error":
        error = event.message;
        break;
    }
  }

  let judgment: JudgeOutput | null = null;
  if (!error) {
    try {
      judgment = await judgeResponse({
        userMessage: c.userMessage,
        rubric: c.rubric,
        agentResponse,
        toolCalls,
      });
    } catch (err) {
      error = err instanceof Error ? `judge failed: ${err.message}` : String(err);
    }
  }

  return { case: c, agentResponse, toolCalls, costUsd, latencyMs, iterations, blocked, error, judgment };
}

function formatTable(results: CaseResult[]): string {
  const rows = results.map((r) => {
    const score = r.judgment ? `${r.judgment.score}/5` : r.error ? "ERR" : "n/a";
    const pass = r.judgment?.pass ? "✓" : "✗";
    return [
      r.case.id.padEnd(28),
      score.padEnd(6),
      pass.padEnd(4),
      `${r.iterations}`.padEnd(5),
      `$${r.costUsd.toFixed(4)}`.padEnd(10),
      `${r.latencyMs}ms`.padEnd(10),
    ].join("  ");
  });
  const header = ["case".padEnd(28), "score".padEnd(6), "pass".padEnd(4), "iter".padEnd(5), "cost".padEnd(10), "latency".padEnd(10)].join("  ");
  const sep = "-".repeat(header.length);
  return [header, sep, ...rows].join("\n");
}

async function main(): Promise<void> {
  if (!process.env.ANTHROPIC_API_KEY) {
    console.error("ANTHROPIC_API_KEY is required. Add it to .env.local or export it.");
    process.exit(1);
  }

  console.log(`Running ${CASES.length} eval cases...\n`);
  const results: CaseResult[] = [];
  for (const c of CASES) {
    process.stdout.write(`  ${c.id}... `);
    const result = await runCase(c);
    results.push(result);
    if (result.error) {
      process.stdout.write(`error: ${result.error.slice(0, 60)}\n`);
    } else if (result.judgment) {
      process.stdout.write(`${result.judgment.score}/5 ${result.judgment.pass ? "✓" : "✗"}\n`);
    } else {
      process.stdout.write("no judgment\n");
    }
  }

  console.log("\n" + formatTable(results));

  const judged = results.filter((r) => r.judgment !== null);
  if (judged.length > 0) {
    const avgScore = judged.reduce((s, r) => s + (r.judgment?.score ?? 0), 0) / judged.length;
    const passRate = judged.filter((r) => r.judgment?.pass).length / judged.length;
    const totalCost = results.reduce((s, r) => s + r.costUsd, 0);
    const totalLatency = results.reduce((s, r) => s + r.latencyMs, 0);

    console.log(
      `\n  avg score: ${avgScore.toFixed(2)}/5    pass rate: ${(passRate * 100).toFixed(0)}%    total: $${totalCost.toFixed(4)} · ${totalLatency}ms`,
    );
  }

  // Print judge reasoning for any failures so the human can investigate.
  const failures = results.filter((r) => r.judgment && !r.judgment.pass);
  if (failures.length > 0) {
    console.log("\nFailures (judge reasoning):");
    for (const f of failures) {
      console.log(`\n  [${f.case.id}]`);
      console.log(`    ${f.judgment?.reasoning}`);
    }
  }

  // Exit 1 on any failure so this can run in CI.
  const hasFailure = results.some((r) => r.error || (r.judgment && !r.judgment.pass));
  process.exit(hasFailure ? 1 : 0);
}

void main();
