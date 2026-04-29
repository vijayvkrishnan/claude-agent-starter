import { redactPii } from "@/lib/agent/hooks";

/**
 * Structured logger for the agent. One JSON line per event, easy to ingest
 * into Datadog / Logtail / wherever. Replace the console.log call with your
 * own transport.
 */

type Level = "info" | "warn" | "error";

export type AgentEvent =
  | {
      kind: "request_start";
      requestId: string;
      model: string;
      messageCount: number;
      estimatedInputTokens: number;
      estimatedCostUsd: number;
    }
  | {
      kind: "request_blocked";
      requestId: string;
      reason: string;
    }
  | {
      kind: "iteration_complete";
      requestId: string;
      iteration: number;
      stopReason: string;
      latencyMs: number;
      usage: {
        inputTokens: number;
        outputTokens: number;
        cacheReadTokens: number;
        cacheCreationTokens: number;
      };
      costUsd: number;
    }
  | {
      kind: "tool_call";
      requestId: string;
      iteration: number;
      tool: string;
      input: unknown;
      latencyMs: number;
      isError: boolean;
    }
  | {
      kind: "tool_blocked";
      requestId: string;
      iteration: number;
      tool: string;
      reason: string;
    }
  | {
      kind: "request_complete";
      requestId: string;
      iterations: number;
      totalLatencyMs: number;
      totalCostUsd: number;
      finalStopReason: string;
    }
  | {
      kind: "error";
      requestId: string;
      message: string;
      stack?: string;
    };

function levelFor(kind: AgentEvent["kind"]): Level {
  if (kind === "error") return "error";
  if (kind === "request_blocked" || kind === "tool_blocked") return "warn";
  return "info";
}

export function logEvent(event: AgentEvent): void {
  const payload = JSON.parse(redactPii(JSON.stringify(event))) as unknown;
  const line = JSON.stringify({
    ts: new Date().toISOString(),
    level: levelFor(event.kind),
    ...(payload as object),
  });
  // eslint-disable-next-line no-console
  console.log(line);
}

let counter = 0;
export function newRequestId(): string {
  counter += 1;
  return `req_${Date.now().toString(36)}_${counter.toString(36)}`;
}
