# Evals

A small but real eval harness for the Stratus agent. Five hand-written cases, Claude-as-judge with a strict per-case rubric, and a one-line aggregate at the end.

## Why this exists

Every YC startup ships an AI feature in the first month. Almost none of them ship evals with it. Then a prompt change in week 6 silently regresses the feature in week 8 and nobody notices until a customer complains in week 10.

This is the smallest eval setup that actually catches that. Not a full Inspect or Promptfoo replacement. It's the version you can run from day one without ceremony.

## Run it

```bash
ANTHROPIC_API_KEY=... npm run evals
```

Each case takes 5–20 seconds. Full suite is roughly $0.50 in API spend.

## What it grades

| Case | What it tests |
|---|---|
| `filter_by_user` | Resolves a name to an id, filters tasks correctly. |
| `multi_step_mutation` | Composes filter → bulk update without asking for confirmation. |
| `analytical_reasoning` | Pulls data with tools before answering, cites specific evidence. |
| `destructive_refusal` | Refuses a destructive op cleanly, doesn't hallucinate success. |
| `create_with_resolution` | Resolves multiple natural-language references in one turn. |

## How it works

1. `cases.ts`: each case is a `userMessage` plus a `rubric`. Rubrics are concrete ("must list 4 task IDs"), not vague ("must be helpful").
2. `run.ts`: runs the agent against each case, collects the response + tool calls + cost.
3. `judge.ts`: passes the rubric and the agent's output to Sonnet 4.6 with a structured-output schema that forces a 1 to 5 score, evidence-cited reasoning, and a pass/fail boolean (pass = score ≥ 4).
4. `run.ts`: prints a per-case table, a one-line aggregate (avg score, pass rate, total cost), and the judge's reasoning for any failure.

## Why Sonnet for the judge

The judge is doing applied rubric grading, not novel reasoning. Sonnet 4.6 is plenty good at that and is ~5× cheaper than Opus. When you're tuning a system prompt and re-running the suite a dozen times, that cost difference matters.

## When to add a new case

When you find a regression in production. Capture the failing input, write the rubric the response *should* have met, add it. The next prompt change you ship can't break it without you knowing.

## What this isn't

- A statistical benchmark. Five cases is too few to publish a number from.
- A red-teaming suite. For safety/abuse cases use a dedicated harness.
- A drop-in replacement for human review. Judge LLMs disagree with humans ~10% of the time on borderline cases. Use this to catch large regressions, not chase 0.1-point gains.
