# claude-agent-starter

An opinionated starter for the Claude-powered agent that lives inside your product and talks to your users.

Streaming, tool use, prompt caching, cost guardrails, destructive-op gates, parallel sub-agents, structured telemetry, and an eval harness with Claude-as-judge. Fork it, drop the agent code into your `app/`, swap the seven sample tools for your own, ship the same week.

```bash
git clone https://github.com/vijayvkrishnan/claude-agent-starter
cd claude-agent-starter
echo "ANTHROPIC_API_KEY=sk-ant-..." > .env.local
npm install && npm run dev
```

Open `http://localhost:3000`, press `⌘K`, talk to the agent.

---

## Why this exists

Every team shipping a user-facing AI feature ends up writing the same plumbing twice: once for the demo that gets to "wow", and once for the version that survives a production user hammering on it. Streaming, cost guardrails, an evals story, telemetry, a safe pattern for destructive operations. None of it is novel, all of it is load-bearing, and most teams ship the first version of it without any of these in place. That version makes it to a real customer. Then someone gets paged at 2am.

This repo is the second version, sitting in front of you on day one. The agent loop is real, the tools are typed end-to-end, the cost ceiling actually refuses requests it can't afford, the destructive operations actually get blocked by a hook the agent can reason about, and the eval harness gives you a real number you can put in front of an investor when they ask how you measure quality.

## When to use this vs Agent SDK vs Managed Agents

Three Claude agent primitives, three rungs on the same ladder.

- **This starter (manual tool-use loop)** — full control between iterations, full telemetry, custom hooks. Right when you're shipping your first in-product agent and want to see the loop, or when your control flow doesn't fit cleanly into someone else's abstraction.
- **[Claude Agent SDK](https://docs.claude.com/en/api/agent-sdk)** — collapses the manual loop back to ~10 lines of code with `toolRunner`. Session lifecycle, retries, iteration logic handled. Right once you've internalized the loop and your hooks fit standard shapes.
- **[Managed Agents](https://www.anthropic.com/engineering/managed-agents)** — full abstraction with brain/hands decoupling. As of May 2026: Multiagent Orchestration for parallel sub-agents on a shared filesystem, Dreaming for memory that improves across sessions, Outcomes for graded re-runs. Right when a build fits that shape — true multi-agent parallelism, cross-session memory, or graded outcomes as a product feature.

Most teams walk manual → SDK → Managed as needs grow. This starter is deliberately v1 of that progression.

For the deeper rationale, see [`docs/agent-architecture-choices.md`](./docs/agent-architecture-choices.md).

## What's in the demo

The demo is a small B2B project workspace with projects, tasks, and users, the kind of data every internal tool eventually needs some shape of. The interesting part is the `⌘K` command bar: it's a Claude Agent SDK loop wired to that data through eight tools.

Try these against the seed data:

- *"What's blocked on the platform team?"*
- *"Reassign all of Sarah's tasks to Alex"*
- *"Which project is most at risk and why?"*
- *"Run a workspace health check"* (this one fans out three sub-agents in parallel)
- *"Create a high-priority task for Devon to audit our pricing page conversion"*

The agent does the lookups, composes the mutations, streams the answer, and shows you what it spent in tokens and dollars. The destructive `delete_task` tool is gated by a hook that demonstrates the safe pattern for irreversible operations.

> The cost / iteration / latency footer in the ⌘K palette is a **dev overlay** for the demo viewer. In production, you'd hide it from end-users and consume the server-side structured telemetry (`lib/agent/telemetry.ts`) via your monitoring pipe. The footer carries a `dev` badge to flag this distinction.

The product itself is a placeholder. Replace `lib/db/mock.ts` with your real data layer, rewrite the tools in `lib/agent/tools.ts` against your schema, edit the system prompt, and the same agent is now talking about your product to your users.

## Where you'd take this

The Stratus demo is one shape. The runner + hooks + tools pattern fits any in-product agent that reads and acts on user data. Some of what you could build by swapping `lib/db/mock.ts` and `lib/agent/tools.ts`:

- **Customer support agent** in your SaaS app. Tools: `lookup_user`, `lookup_orders`, `issue_refund`, `escalate_to_human`. Data: your CRM + order DB. The destructive-op gate already covers `issue_refund`.
- **Sales copilot** for your reps. Tools: `search_leads`, `summarize_account`, `draft_email`, `schedule_meeting`. Data: Salesforce, HubSpot, Attio.
- **Doc Q&A** for internal knowledge. Tools: `search_docs`, `get_doc`, `cite_passage`. Data: Notion, Drive, a vector store.
- **Ops agent** for engineering teams. Tools: `check_alerts`, `query_metrics`, `restart_service`, `open_ticket`. Data: your observability stack + Linear or Jira.
- **Coding assistant** in your IDE plugin. Tools: `search_repo`, `read_file`, `propose_diff`, `run_tests`. Data: the local git repo.

The runner, hooks, cost ceiling, sub-agent helper, eval harness, and tests don't change. You change the tools and the data layer, and you have a different product.

## What's actually in the box

The things every production agent needs and most teams ship without:

| | What | Where |
|---|---|---|
| **Streaming** | Token-level streaming over SSE; thinking and tool calls forwarded to the client as discrete events | `app/api/agent/route.ts` + `components/command-palette.tsx` |
| **Tool use** | Manual loop with full control between iterations; Zod-validated tool inputs; raw JSON-Schema for the API; `defineTool` factory keeps validator output and handler input in sync | `lib/agent/runner.ts` + `lib/agent/tools.ts` |
| **Prompt caching** | System prompt + tool schemas cached together via `cache_control: ephemeral`. Cache reads cost ~10% of uncached input; the eval suite confirms 2.3K tokens served from cache on every call after the first | `lib/agent/runner.ts` |
| **Adaptive thinking** | `thinking: {type: "adaptive", display: "summarized"}` + `effort: "high"` on Opus 4.7. Recommended floor for intelligence-sensitive work; tune up to `xhigh` for agentic, down to `medium` for cost-sensitive | `lib/agent/runner.ts` |
| **Sub-agents** | `runSubAgent()` helper for parallel fan-out on cheaper models. The demo `analyze_workspace_health` tool spawns three Sonnet sub-agents in parallel (delivery / dependency / scope risk) | `lib/agent/sub-agents.ts` + `lib/agent/tools.ts` |
| **Cost ceiling** | Pre-flight `count_tokens` + worst-case projection; refuses to send any request projected to exceed the configured ceiling | `lib/agent/hooks.ts` |
| **Destructive-op gate** | Tools marked `destructive: true` are blocked at the runner; the agent receives a structured refusal it can reason about and surface to the user | `lib/agent/hooks.ts` + `lib/agent/tools.ts` |
| **PII redactor** | Telemetry strings are scrubbed of email / phone / SSN / card numbers before anything is logged. Unit-tested against common formats | `lib/agent/hooks.ts` + `lib/agent/telemetry.ts` |
| **Telemetry** | One JSON line per event (request start, iteration complete, tool call, tool blocked, error). Drop-in for Datadog / Logtail / your own pipe | `lib/agent/telemetry.ts` |
| **Eval harness** | 5 hand-written cases, Sonnet 4.6 as judge with strict per-case rubrics, exits non-zero on regression so it runs in CI | `evals/` + `npm run evals` |
| **Unit tests** | Vitest tests on the cost calculator, PII redactor, destructive-op gate, and tool runtime | `lib/**/__tests__/` + `npm test` |
| **CI** | GitHub Actions running typecheck + tests + build on every push. Separate manually-triggered workflow for evals (which cost real money) | `.github/workflows/` |

Plus a `.claude/commands/eval-agent.md` slash command for running the eval suite from inside Claude Code while you're tuning the system prompt.

## Architecture

```
┌─────────────────────────────────────────────────────────────────────────┐
│  components/command-palette.tsx                                         │
│    ⌘K UI · SSE consumer · streaming text + tool-call rendering          │
└─────────────────────────────────────────────────────────────────────────┘
                                 │ POST /api/agent
                                 ▼
┌─────────────────────────────────────────────────────────────────────────┐
│  app/api/agent/route.ts                                                 │
│    SSE producer · forwards every RunEvent as `data: {json}\n\n`         │
└─────────────────────────────────────────────────────────────────────────┘
                                 │ async generator
                                 ▼
┌─────────────────────────────────────────────────────────────────────────┐
│  lib/agent/runner.ts                — manual tool-use loop              │
│    1. preFlightCostCheck()          — cost ceiling, block before spend  │
│    2. messages.stream()             — token-level streaming             │
│    3. on tool_use: preToolCheck()   — destructive-op gate               │
│    4. executeTool()                 — Zod validate + run handler        │
│    5. logEvent()                    — structured telemetry              │
│    6. loop until end_turn or maxIterations                              │
└─────────────────────────────────────────────────────────────────────────┘
                                 │
                                 ▼
                  Anthropic API (claude-opus-4-7)
                                 │
                                 ▼ (when a tool fans out)
                  lib/agent/sub-agents.ts (Sonnet 4.6)
```

For the deeper rationale on the manual-loop choice and the five production primitives the SDK's tool runner doesn't ship, see [`docs/agent-architecture-choices.md`](./docs/agent-architecture-choices.md).

## Build your first tool

The shortest possible end-to-end example. Add a `mark_done` tool that flips a task's status to `done`:

In `lib/agent/tools.ts`, define and register it:

```ts
const markDone = defineTool({
  name: "mark_done",
  description:
    "Mark a single task as done. Use this when the user says something like 'I finished tsk_001' or 'mark the pricing task as done'.",
  inputSchema: {
    type: "object",
    properties: { task_id: { type: "string", description: "The task id, e.g. 'tsk_001'." } },
    required: ["task_id"],
  },
  validator: z.object({ task_id: z.string() }).strict(),
  handler: (input) => {
    const updated = db.tasks.update(input.task_id, { status: "done" });
    if (!updated) return JSON.stringify({ error: `task '${input.task_id}' not found` });
    return JSON.stringify(updated, null, 2);
  },
});

const TOOLS: readonly ToolDef[] = [
  // ...existing tools,
  markDone,
];
```

That's it. The runner now exposes the tool to Claude on the next request. The validator gives you compile-time + runtime safety on `input.task_id`. If the user types *"finish tsk_003"*, the agent picks the new tool, the runner validates the call, the handler mutates the data, and the result streams back to the UI.

Two patterns to remember:

1. **The Zod validator is the source of truth at runtime.** The JSON schema is what Claude sees and uses to construct calls; the Zod schema enforces what actually reaches your handler. Keep them in sync. A divergence means the model can call the tool with input the handler will crash on.
2. **Mark anything that mutates user data and isn't reversible as `destructive: true`.** The runner's `preToolCheck` hook will block it; the agent receives a structured refusal and can route the user to your app's confirmation flow.

For a tool that fans out to parallel sub-agents, see `analyze_workspace_health` in the same file.

## Cost

The eval suite logs the real per-request cost at the end of every run. Representative numbers from a clean run on Opus 4.7 with prompt caching active:

```
case                          score   pass  iter   cost        latency
-------------------------------------------------------------------------
filter_by_user                5/5     ✓     3      $0.0235      8475ms
multi_step_mutation           5/5     ✓     4      $0.0419     11235ms
analytical_reasoning          5/5     ✓     2      $0.0268     21946ms
destructive_refusal           5/5     ✓     1      $0.0065      3615ms
create_with_resolution        5/5     ✓     3      $0.0279      8939ms

avg score: 5.00/5    pass rate: 100%    total: $0.1266 · 54210ms
```

After the first request, the system prompt and tool schemas (~2.3K tokens) hit cache on every subsequent call at ~10% of the uncached price. The variable cost in each request is the conversation tokens plus tool outputs.

The default `AGENT_COST_CEILING_USD` is `$0.50`. That sits well above any normal request and refuses obvious runaways. Tune downward in latency-critical paths, upward in autonomous flows.

## Tests + evals

Two things, two purposes:

- `npm test` runs the unit tests on pure functions (cost calculator, PII redactor, destructive-op gate, tool execution surface). Fast, deterministic, runs on every PR via CI.
- `npm run evals` runs the agent against five hand-written cases and grades the outputs with Sonnet 4.6 as judge. ~$0.15 per pass, runs in ~50s. Catches regressions when you tune the system prompt.

Read [evals/README.md](./evals/README.md) for the eval philosophy.

## Customizing for your product

Three points of customization, in order of effort:

**1. The system prompt** is in `lib/agent/system-prompt.ts`. Frozen. Don't interpolate timestamps or per-user IDs into it (kills the prompt cache); inject runtime context via user-turn messages instead.

**2. The tools** live in `lib/agent/tools.ts`. Each tool is a `defineTool({...})` call with a Zod validator and a handler. Replace the eight workspace tools with your own. The runner doesn't need to change.

**3. The data layer** is `lib/db/mock.ts`. The mock is in-memory. Swap for Prisma, Supabase, Drizzle, or whatever you ship on. The tools are written against the `db` interface; if you preserve the function signatures, the tools are unchanged.

Two things you should *not* change unless you know why:

- `cache_control: ephemeral` on the system block in `runner.ts`. Removing it will silently triple your per-request cost.
- The pre-flight `count_tokens` call in `runner.ts`. Removing it means a runaway tool loop can quietly burn $100s before you notice.

## Configuration

```bash
ANTHROPIC_API_KEY=sk-ant-...        # required
AGENT_COST_CEILING_USD=0.50         # default $0.50 per request
AGENT_MAX_ITERATIONS=12              # default 12 tool-use iterations
```

That's it. No vector DB, no Redis, no orchestration framework. If you need one of those, you'll know.

## Tech stack

Next.js 15 (App Router) · TypeScript (strict, `noUncheckedIndexedAccess`) · Tailwind 3 · Zod · Vitest · `@anthropic-ai/sdk` · Geist Sans + Geist Mono.

No state management library, no UI kit, no icon library. Hand-rolled at this scale because shipping a starter with 40 dependencies is a different kind of cruelty.

## Deploy

`vercel deploy`. The agent runs in a Node.js runtime route; SSE works without configuration.

## License

MIT. Fork it, ship it, change it, sell it. No attribution required.

## Author

Built by [Vijay Krishnan](https://www.vijayvkrishnan.com). The patterns here come from shipping in-product agents on Claude at [Genie](https://madebygenie.com); the starter exists because the work is general and writing the same plumbing once is enough.
