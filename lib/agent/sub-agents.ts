import Anthropic from "@anthropic-ai/sdk";

/**
 * Sub-agent helper.
 *
 * A sub-agent is a separate `messages.create` call with its own system prompt
 * and a single user message. It does NOT participate in the main agent's
 * tool-use loop or share its conversation history. Its output is text that
 * gets fed back to the main agent as a tool result.
 *
 * This pattern is useful when:
 *   - The main agent needs N independent analyses fanned out in parallel
 *     (Promise.all over runSubAgent calls)
 *   - The narrow sub-task is cheap enough to run on Sonnet/Haiku, saving cost
 *   - Keeping the main loop's context clean matters more than letting the
 *     model see every intermediate step
 *
 * Sub-agents intentionally don't have tools. If you need a sub-agent that
 * can call tools, hoist the work back into the main loop with a more
 * specific tool, or build a second runAgent-style loop inside the sub-agent.
 */

const client = new Anthropic();

interface SubAgentInput {
  readonly system: string;
  readonly userMessage: string;
  readonly model?: "claude-sonnet-4-6" | "claude-haiku-4-5";
  readonly maxTokens?: number;
}

export async function runSubAgent(input: SubAgentInput): Promise<string> {
  const response = await client.messages.create({
    model: input.model ?? "claude-sonnet-4-6",
    max_tokens: input.maxTokens ?? 1024,
    system: input.system,
    messages: [{ role: "user", content: input.userMessage }],
  });

  const text = response.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("\n");

  return text || "(sub-agent returned no text)";
}
