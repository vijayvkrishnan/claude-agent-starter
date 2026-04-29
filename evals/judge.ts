import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";

/**
 * Claude-as-judge for eval grading.
 *
 * Why Claude as judge:
 *   - Rubric-based grading is reasoning-heavy; deterministic scoring is hard
 *     to write for free-form responses
 *   - Cheaper than human review for every iteration on the system prompt
 *   - Scores stable enough to detect regressions; not so precise you should
 *     chase 0.1-point gains
 *
 * The judge runs on Sonnet, not Opus, because:
 *   - Sonnet is plenty good at applied rubric grading
 *   - It's 5x cheaper, which matters when running the full suite N times
 *     during prompt tuning
 *
 * The structured output schema forces the judge to commit to a number and
 * cite specific evidence. Vague feedback is the failure mode of LLM judges.
 */

const judge = new Anthropic();

const JUDGE_SCHEMA = {
  type: "object" as const,
  properties: {
    score: {
      type: "integer" as const,
      enum: [1, 2, 3, 4, 5],
      description: "1=fails the rubric, 3=meets some criteria, 5=meets all criteria.",
    },
    reasoning: {
      type: "string" as const,
      description:
        "Specific, evidence-cited explanation. Quote the agent's response or tool calls. Max 3 sentences.",
    },
    pass: {
      type: "boolean" as const,
      description: "True if score >= 4. The line above which a regression alert should NOT fire.",
    },
  },
  required: ["score", "reasoning", "pass"],
  additionalProperties: false,
};

const JudgeOutput = z.object({
  score: z.number().int().min(1).max(5),
  reasoning: z.string(),
  pass: z.boolean(),
});
export type JudgeOutput = z.infer<typeof JudgeOutput>;

interface JudgeInput {
  userMessage: string;
  rubric: string;
  agentResponse: string;
  toolCalls: { name: string; input: unknown; result: string; isError: boolean }[];
}

export async function judgeResponse(input: JudgeInput): Promise<JudgeOutput> {
  const toolCallSummary = input.toolCalls.length === 0
    ? "(no tool calls)"
    : input.toolCalls
        .map(
          (tc, i) =>
            `[${i + 1}] ${tc.name}(${JSON.stringify(tc.input)})${tc.isError ? " ERROR" : ""}\n    → ${tc.result.slice(0, 200)}${tc.result.length > 200 ? "…" : ""}`,
        )
        .join("\n");

  const userPrompt = `You are grading an in-product AI agent against a rubric. Be strict but fair, and only quote evidence from the agent's actual output.

USER REQUEST:
${input.userMessage}

RUBRIC:
${input.rubric}

AGENT'S TOOL CALLS:
${toolCallSummary}

AGENT'S FINAL RESPONSE:
${input.agentResponse}

Apply the rubric. Cite specific evidence (tool names, task IDs from the response, missing requirements).`;

  const result = await judge.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 1024,
    output_config: { format: { type: "json_schema", schema: JUDGE_SCHEMA } },
    messages: [{ role: "user", content: userPrompt }],
  });

  const textBlock = result.content.find((b) => b.type === "text");
  if (!textBlock || textBlock.type !== "text") {
    throw new Error("Judge returned no text content");
  }
  return JudgeOutput.parse(JSON.parse(textBlock.text));
}
