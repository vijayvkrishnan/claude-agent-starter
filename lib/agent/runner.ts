import Anthropic from "@anthropic-ai/sdk";
import { SYSTEM_PROMPT } from "@/lib/agent/system-prompt";
import { TOOL_DEFINITIONS, executeTool } from "@/lib/agent/tools";
import {
  calculateCostUsd,
  isKnownModel,
  preFlightCostCheck,
  preToolCheck,
  type ModelId,
} from "@/lib/agent/hooks";
import { logEvent, newRequestId } from "@/lib/agent/telemetry";

/**
 * The agent runner.
 *
 * This is a manual tool-use loop, not the SDK's tool runner. We use the
 * manual loop because we need fine-grained control between iterations:
 *   - pre-flight cost ceiling (block before spending money)
 *   - per-tool destructive-op gating
 *   - per-call structured telemetry (latency, tokens, cost)
 *   - token-level streaming forwarded to the client as SSE
 *
 * The SDK's tool runner is great for the 80% case where you just want the
 * loop to "just work". For production agents that need guardrails and
 * observability, do it manually.
 */

const DEFAULT_MODEL: ModelId = "claude-opus-4-7";
const DEFAULT_MAX_TOKENS = 4096;

export interface RunInput {
  messages: Anthropic.MessageParam[];
  model?: ModelId;
  maxTokens?: number;
  costCeilingUsd?: number;
  maxIterations?: number;
}

export type RunEvent =
  | { type: "request_start"; requestId: string; model: string; estimatedInputTokens: number; estimatedCostUsd: number }
  | { type: "blocked"; reason: string }
  | { type: "thinking_delta"; delta: string }
  | { type: "text_delta"; delta: string }
  | { type: "tool_call_start"; id: string; name: string; input: unknown }
  | { type: "tool_call_result"; id: string; name: string; isError: boolean; content: string; latencyMs: number }
  | { type: "iteration_complete"; iteration: number; stopReason: string; costUsd: number; cumulativeCostUsd: number }
  | { type: "done"; iterations: number; totalCostUsd: number; totalLatencyMs: number }
  | { type: "error"; message: string };

const client = new Anthropic();

export async function* runAgent(input: RunInput): AsyncGenerator<RunEvent> {
  const requestId = newRequestId();
  const model = input.model ?? DEFAULT_MODEL;
  const maxTokens = input.maxTokens ?? DEFAULT_MAX_TOKENS;
  const costCeilingUsd = input.costCeilingUsd ?? Number(process.env.AGENT_COST_CEILING_USD ?? "0.50");
  const maxIterations = input.maxIterations ?? Number(process.env.AGENT_MAX_ITERATIONS ?? "12");

  if (!isKnownModel(model)) {
    yield { type: "error", message: `Unknown model: ${model}` };
    return;
  }

  // Cache the system prompt + tools together. The cache_control on the last
  // (only) system block also covers the tools array, which renders before
  // system. After the first request, every subsequent call within the 5-min
  // TTL hits cache for the entire prefix.
  const system: Anthropic.MessageCreateParams["system"] = [
    { type: "text", text: SYSTEM_PROMPT, cache_control: { type: "ephemeral" } },
  ];

  const messages = [...input.messages];

  const preFlight = await preFlightCostCheck({
    client,
    model,
    system,
    tools: TOOL_DEFINITIONS,
    messages,
    maxTokens,
    costCeilingUsd,
  });

  if (!preFlight.ok) {
    logEvent({ kind: "request_blocked", requestId, reason: preFlight.reason ?? "unknown" });
    yield { type: "blocked", reason: preFlight.reason ?? "Cost ceiling exceeded." };
    return;
  }

  logEvent({
    kind: "request_start",
    requestId,
    model,
    messageCount: messages.length,
    estimatedInputTokens: preFlight.estimatedInputTokens,
    estimatedCostUsd: preFlight.estimatedCostUsd,
  });

  yield {
    type: "request_start",
    requestId,
    model,
    estimatedInputTokens: preFlight.estimatedInputTokens,
    estimatedCostUsd: preFlight.estimatedCostUsd,
  };

  const startedAt = Date.now();
  let cumulativeCostUsd = 0;
  let iteration = 0;
  let finalStopReason = "unknown";

  try {
    while (iteration < maxIterations) {
      iteration += 1;
      const iterationStarted = Date.now();

      const stream = client.messages.stream({
        model,
        max_tokens: maxTokens,
        system,
        tools: TOOL_DEFINITIONS,
        // 'summarized' surfaces thinking text in the response stream so the
        // UI can show progress. The default on Opus 4.7 is 'omitted', which
        // looks like a long pause before output begins.
        thinking: { type: "adaptive", display: "summarized" },
        // 'high' is the recommended minimum for intelligence-sensitive work
        // on Opus 4.7. Bump to 'xhigh' for coding/agentic; drop to 'medium'
        // if cost-sensitive.
        output_config: { effort: "high" },
        messages,
      });

      for await (const event of stream) {
        if (event.type === "content_block_delta") {
          if (event.delta.type === "text_delta") {
            yield { type: "text_delta", delta: event.delta.text };
          } else if (event.delta.type === "thinking_delta") {
            yield { type: "thinking_delta", delta: event.delta.thinking };
          }
        }
      }

      const message = await stream.finalMessage();
      const latencyMs = Date.now() - iterationStarted;
      const iterationCost = calculateCostUsd(model, {
        inputTokens: message.usage.input_tokens,
        outputTokens: message.usage.output_tokens,
        cacheReadTokens: message.usage.cache_read_input_tokens ?? 0,
        cacheCreationTokens: message.usage.cache_creation_input_tokens ?? 0,
      });
      cumulativeCostUsd += iterationCost;

      logEvent({
        kind: "iteration_complete",
        requestId,
        iteration,
        stopReason: message.stop_reason ?? "unknown",
        latencyMs,
        usage: {
          inputTokens: message.usage.input_tokens,
          outputTokens: message.usage.output_tokens,
          cacheReadTokens: message.usage.cache_read_input_tokens ?? 0,
          cacheCreationTokens: message.usage.cache_creation_input_tokens ?? 0,
        },
        costUsd: iterationCost,
      });

      yield {
        type: "iteration_complete",
        iteration,
        stopReason: message.stop_reason ?? "unknown",
        costUsd: iterationCost,
        cumulativeCostUsd,
      };

      // Always append the assistant turn to history before processing tools.
      // We need the full content[] (including tool_use blocks) for the next
      // turn's tool_result blocks to reference.
      messages.push({ role: "assistant", content: message.content });

      finalStopReason = message.stop_reason ?? "unknown";

      if (message.stop_reason === "end_turn") break;

      // Tool-use stop: execute every tool_use block in this assistant turn,
      // collect results into a single user-turn message, continue the loop.
      const toolUseBlocks = message.content.filter(
        (b): b is Anthropic.ToolUseBlock => b.type === "tool_use",
      );

      if (toolUseBlocks.length === 0) {
        // Stop reason wasn't end_turn but there are no tool calls. Nothing
        // we can do to continue. Break and let the caller see the stop reason.
        break;
      }

      const toolResults: Anthropic.ToolResultBlockParam[] = [];
      for (const block of toolUseBlocks) {
        yield { type: "tool_call_start", id: block.id, name: block.name, input: block.input };

        const gate = preToolCheck(block.name);
        if (!gate.ok) {
          logEvent({
            kind: "tool_blocked",
            requestId,
            iteration,
            tool: block.name,
            reason: gate.reason ?? "blocked",
          });
          yield {
            type: "tool_call_result",
            id: block.id,
            name: block.name,
            isError: true,
            content: gate.reason ?? "blocked by hook",
            latencyMs: 0,
          };
          toolResults.push({
            type: "tool_result",
            tool_use_id: block.id,
            content: gate.reason ?? "blocked by hook",
            is_error: true,
          });
          continue;
        }

        const toolStarted = Date.now();
        const result = await executeTool(block.name, block.input);
        const toolLatency = Date.now() - toolStarted;

        logEvent({
          kind: "tool_call",
          requestId,
          iteration,
          tool: block.name,
          input: block.input,
          latencyMs: toolLatency,
          isError: result.isError,
        });

        yield {
          type: "tool_call_result",
          id: block.id,
          name: block.name,
          isError: result.isError,
          content: result.content,
          latencyMs: toolLatency,
        };

        toolResults.push({
          type: "tool_result",
          tool_use_id: block.id,
          content: result.content,
          is_error: result.isError,
        });
      }

      messages.push({ role: "user", content: toolResults });
    }

    const totalLatencyMs = Date.now() - startedAt;
    logEvent({
      kind: "request_complete",
      requestId,
      iterations: iteration,
      totalLatencyMs,
      totalCostUsd: cumulativeCostUsd,
      finalStopReason,
    });

    yield {
      type: "done",
      iterations: iteration,
      totalCostUsd: cumulativeCostUsd,
      totalLatencyMs,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const stack = err instanceof Error ? err.stack : undefined;
    logEvent({ kind: "error", requestId, message, stack });
    yield { type: "error", message };
  }
}
