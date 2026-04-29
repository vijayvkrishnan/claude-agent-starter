import type Anthropic from "@anthropic-ai/sdk";
import { DESTRUCTIVE_TOOLS } from "@/lib/agent/tools";

/**
 * Application-level hooks around the agent loop. These are NOT SDK features.
 * They are wrappers we run before sending a request and before executing a
 * tool call. The pattern matches what production agents need:
 *
 *   - preFlight:  cost ceiling, PII redaction, prompt-injection screen
 *   - preTool:    destructive-op gate, rate limit per tool, audit log
 *
 * Hooks are intentionally synchronous-or-throwing. If a hook decides a
 * request must not proceed, it returns a `block` reason; the runner returns
 * that to the user instead of calling the API.
 */

// Pricing in USD per million tokens. Update when Anthropic pricing changes.
// Source: https://docs.claude.com/en/docs/about-claude/pricing
const PRICING = {
  "claude-opus-4-7": { input: 5.0, output: 25.0, cacheWrite: 6.25, cacheRead: 0.5 },
  "claude-opus-4-6": { input: 5.0, output: 25.0, cacheWrite: 6.25, cacheRead: 0.5 },
  "claude-sonnet-4-6": { input: 3.0, output: 15.0, cacheWrite: 3.75, cacheRead: 0.3 },
  "claude-haiku-4-5": { input: 1.0, output: 5.0, cacheWrite: 1.25, cacheRead: 0.1 },
} as const;

export type ModelId = keyof typeof PRICING;

export function isKnownModel(model: string): model is ModelId {
  return model in PRICING;
}

export interface UsageBreakdown {
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheCreationTokens: number;
}

export function calculateCostUsd(model: ModelId, usage: UsageBreakdown): number {
  const p = PRICING[model];
  return (
    (usage.inputTokens * p.input +
      usage.outputTokens * p.output +
      usage.cacheCreationTokens * p.cacheWrite +
      usage.cacheReadTokens * p.cacheRead) /
    1_000_000
  );
}

/**
 * Conservative pre-flight estimate. We use the API's token counter to get
 * exact input tokens, then assume worst-case output tokens (= max_tokens) at
 * full output price. This intentionally over-estimates so the ceiling
 * triggers on requests that COULD blow the budget, not just those that did.
 */
export interface PreFlightContext {
  client: Anthropic;
  model: ModelId;
  system: Anthropic.MessageCreateParams["system"];
  tools: Anthropic.Tool[];
  messages: Anthropic.MessageParam[];
  maxTokens: number;
  costCeilingUsd: number;
}

export interface PreFlightDecision {
  ok: boolean;
  estimatedCostUsd: number;
  estimatedInputTokens: number;
  reason?: string;
}

export async function preFlightCostCheck(ctx: PreFlightContext): Promise<PreFlightDecision> {
  const count = await ctx.client.messages.countTokens({
    model: ctx.model,
    system: ctx.system,
    tools: ctx.tools,
    messages: ctx.messages,
  });

  // Worst-case projection: every input token uncached, every output token at max.
  const worstCase = calculateCostUsd(ctx.model, {
    inputTokens: count.input_tokens,
    outputTokens: ctx.maxTokens,
    cacheReadTokens: 0,
    cacheCreationTokens: 0,
  });

  if (worstCase > ctx.costCeilingUsd) {
    return {
      ok: false,
      estimatedCostUsd: worstCase,
      estimatedInputTokens: count.input_tokens,
      reason: `Worst-case cost $${worstCase.toFixed(4)} exceeds ceiling $${ctx.costCeilingUsd.toFixed(4)}. Raise AGENT_COST_CEILING_USD or shorten the conversation.`,
    };
  }
  return { ok: true, estimatedCostUsd: worstCase, estimatedInputTokens: count.input_tokens };
}

/**
 * Per-tool pre-execution check. Today this gates destructive tools; in
 * production you'd also rate-limit per tool, scope by user role, audit, etc.
 */
export interface PreToolDecision {
  ok: boolean;
  reason?: string;
}

export function preToolCheck(toolName: string): PreToolDecision {
  if (DESTRUCTIVE_TOOLS.has(toolName)) {
    return {
      ok: false,
      reason: `Tool '${toolName}' is destructive and requires explicit user confirmation through your app's UI. The agent is not permitted to execute it directly. To support this in production, expose a separate confirmation endpoint or add a UI modal that the user must approve before the deletion is committed.`,
    };
  }
  return { ok: true };
}

/**
 * Lightweight PII redactor for outbound logs / telemetry. NOT a security
 * boundary. Anything you log to a third party should be reviewed by your
 * security team. This is the "don't accidentally page someone with a customer
 * email in the Slack alert" version.
 */
const EMAIL_RE = /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g;
// Requires a separator between the 3-3-4 digit groups (`-`, `.`, or space) so
// we don't accidentally redact 10-digit IDs. Allows optional leading `+1` and
// optional `(` around the area code.
const PHONE_RE = /(?:\+?1[-.\s]?)?\(?\d{3}\)?[-.\s]\d{3}[-.\s]\d{4}/g;
const SSN_RE = /\b\d{3}-\d{2}-\d{4}\b/g;
const CC_RE = /\b(?:\d[ -]*?){13,16}\b/g;

export function redactPii(text: string): string {
  return text
    .replace(EMAIL_RE, "[email]")
    .replace(SSN_RE, "[ssn]")
    .replace(CC_RE, "[card]")
    .replace(PHONE_RE, "[phone]");
}
