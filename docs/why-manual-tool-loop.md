# What the Claude Agent SDK's tool runner doesn't ship

The Anthropic SDK ships with a tool runner that handles the entire agentic loop for you. You define your tools, hand them to `client.beta.messages.toolRunner({...})`, and iterate over the result. The model calls tools, the SDK runs them, results feed back, the loop ends when the model is done. About ten lines of code.

It's the right call most of the time. For an in-product agent that talks to your real users, it's not.

I built [`claude-agent-starter`](https://github.com/vijayvkrishnan/claude-agent-starter) as the production version of an in-product agent. The biggest single decision in that build was rewriting the tool-use loop manually instead of using the SDK's runner. This post is what that costs you, and what you gain.

## What the tool runner gives you (the easy path)

The shape with `betaZodTool` and `toolRunner` is clean:

```typescript
import Anthropic from "@anthropic-ai/sdk";
import { betaZodTool } from "@anthropic-ai/sdk/helpers/beta/zod";
import { z } from "zod";

const client = new Anthropic();

const getWeather = betaZodTool({
  name: "get_weather",
  description: "Get current weather for a location",
  inputSchema: z.object({ location: z.string() }),
  run: async ({ location }) => `72°F and sunny in ${location}`,
});

const finalMessage = await client.beta.messages.toolRunner({
  model: "claude-opus-4-7",
  max_tokens: 16000,
  tools: [getWeather],
  messages: [{ role: "user", content: "Weather in Paris?" }],
});
```

That's the whole agentic loop. Type-safe input via Zod, tool execution handled, automatic termination on `end_turn`. For a script, an internal tool, or a prototype that only you and three teammates use, this is the right primitive.

## What it doesn't give you

The tool runner abstracts away every decision point between iterations. That abstraction is a feature when nothing should happen between iterations. It's a problem when several things should.

Five things production agents need that live in those gaps:

**A pre-flight cost ceiling.** Before any request is sent, you want to know what it could cost in the worst case and refuse to send it if the projection exceeds a threshold. The model can't help you here, and neither can the runner. By the time the runner is iterating, the cost is being incurred. The fix: call `messages.countTokens` with the same model, system, tools, and messages, multiply input tokens by input price, multiply `max_tokens` by output price (worst case), reject anything over the ceiling. About 30 lines of code that prevents the 2am page when a runaway loop bills you $400 against a $5 budget.

**A destructive-op gate.** Some tools shouldn't run without an explicit confirmation flow that lives outside the agent. Deleting a customer record. Sending an email to a real list. Issuing a refund. These need to be exposed to the model so it knows the capability exists, but blocked from execution until your app's confirmation UI says yes. The tool runner has no notion of "this tool is destructive, intercept it." You can build it inside the tool's `run` function by throwing, but that conflates execution with policy. A gate at the loop level keeps tool implementations clean and the policy auditable in one place.

**Per-iteration structured telemetry.** A request that takes four iterations is the request you want to debug at 2am. You want one log line per iteration with: stop reason, latency, input/output token counts, cache hit ratio, dollar cost, the tool calls executed, and any blocked attempts. The runner emits message-level events; getting per-iteration aggregates means hooking into the stream and accumulating yourself. At which point you're already most of the way to a manual loop.

**Conditional execution between tool calls.** "If `get_account_balance` returns less than $0, do not execute the next `process_payment` call." That's a perfectly reasonable production constraint. The tool runner will execute every tool call the model emits in a turn before handing back. A manual loop lets you intercept the tool_use block, inspect the prior tool result, and either execute or short-circuit with an error result the model can reason about.

**Human-in-the-loop pauses.** Some agents need to pause between iterations for an approval click before the next action. The runner doesn't pause; it iterates. You can implement HITL as a tool the model calls to request approval, but that puts the policy in the model's head where it can be socially-engineered. A pause that the runner can't bypass lives at the loop level.

## What the manual loop looks like

```typescript
while (iteration < maxIterations) {
  iteration += 1;

  // 1. Pre-flight: refuse before spending
  const preFlight = await preFlightCostCheck({...});
  if (!preFlight.ok) {
    yield { type: "blocked", reason: preFlight.reason };
    return;
  }

  // 2. Stream the API call (token-level deltas to the client)
  const stream = client.messages.stream({
    model, system, tools, messages,
    thinking: { type: "adaptive", display: "summarized" },
    output_config: { effort: "high" },
  });
  for await (const event of stream) {
    // forward text/thinking deltas to the SSE client
  }
  const message = await stream.finalMessage();

  // 3. Telemetry per iteration
  logEvent({ kind: "iteration_complete", ...message.usage, costUsd });

  // 4. End conditions
  if (message.stop_reason === "end_turn") break;

  // 5. Process tool calls with per-tool gating
  for (const block of toolUseBlocks(message)) {
    const gate = preToolCheck(block.name);
    if (!gate.ok) {
      // Tell the model the tool was blocked and why; let it reason about it
      toolResults.push({ type: "tool_result", tool_use_id: block.id,
                         content: gate.reason, is_error: true });
      continue;
    }
    const result = await executeTool(block.name, block.input);
    toolResults.push({ type: "tool_result", tool_use_id: block.id,
                       content: result.content });
  }

  messages.push({ role: "assistant", content: message.content });
  messages.push({ role: "user", content: toolResults });
}
```

This is the entire shape. About 150 lines once you fill it in with the cost calculator, the telemetry logger, the tool registry, and proper error handling. Compare that to the 10 lines of `toolRunner({...})` and the cost is real.

The structure of every gap-fill is the same: something happens between iterations that the tool runner doesn't expose.

## The destructive-op gate, in detail

The most useful primitive is also the smallest. Mark tools that shouldn't be executed without external confirmation:

```typescript
const deleteTask = defineTool({
  name: "delete_task",
  description: "Delete a task. Destructive: requires confirmation.",
  inputSchema: { /* ... */ },
  validator: z.object({ task_id: z.string() }).strict(),
  destructive: true,
  handler: () => {
    // Unreachable: the gate blocks execution before this runs.
    throw new Error("delete_task requires confirmation. Not allowed.");
  },
});
```

In the loop:

```typescript
function preToolCheck(toolName: string): PreToolDecision {
  if (DESTRUCTIVE_TOOLS.has(toolName)) {
    return { ok: false,
             reason: `Tool '${toolName}' is destructive and requires explicit user confirmation through your app's UI.` };
  }
  return { ok: true };
}
```

When the model tries to delete, the gate intercepts. Instead of calling the handler, the loop sends back a `tool_result` with `is_error: true` and the gate's explanation. The model reads the explanation, understands the constraint, and surfaces it to the user as a recommendation to use the confirmation flow. The user gets a coherent response: *"I can't delete tsk_001 directly. Use the confirmation modal in your dashboard to remove it."*

No throw, no crash, no awkward catch-block. The model treats the refusal as data and reasons about it.

This works because the structured refusal stays in-context for the rest of the conversation. If the user comes back and says "okay, I confirmed it in the UI, try again," the model can call the tool again with the assumption that the policy has changed externally. The gate is the source of truth, not the model's memory.

## What you give up

The costs are real:

- **About 150 lines of code instead of 10.** You have to write the loop, the streaming forwarding, the cost calculator, the telemetry, the per-tool gating logic, the error paths.
- **Bugs you have to find yourself.** The SDK runner has been hardened by usage; your loop hasn't. Off-by-one in the iteration counter, wrong stop-reason handling, a tool result that drops on the floor. These are yours to discover.
- **Context that goes stale.** When the SDK ships a new feature (compaction, programmatic tool calling, a new tool runner shape), you adopt it later than the runner-using teams. You're maintaining your own version of someone else's well-maintained primitive.

These are real costs. For most teams shipping AI features, they're worth paying once.

## When to use the tool runner anyway

Three cases where the tool runner is the right call:

**Prototypes.** You're proving the concept works at all. Cost ceilings, destructive gates, and per-iteration telemetry are luxury items at this stage. Ship the prototype, learn what's actually painful, then graduate.

**Trusted internal tools.** The agent is run by you and four engineers, not by paying users. The cost ceiling is your monthly Anthropic bill. The destructive-op gate is "we don't give the agent destructive tools." The telemetry is reading the SDK's events when something goes wrong. The runner does what you need.

**One-shot tool calls.** The agent makes a single tool call and returns. There's no loop to instrument. The runner's abstraction matches the problem shape exactly.

If you're outside those three, the manual loop pays for itself the first time it refuses a $50 runaway request.

## What you ship

The `claude-agent-starter` repo is the working example. The runner, the hooks, the cost ceiling, the destructive-op gate, the eval harness, the tests are all there. Fork it, swap the tools and the data layer for your own, and the loop doesn't change.

`git clone https://github.com/vijayvkrishnan/claude-agent-starter`
