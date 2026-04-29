---
description: Run the agent eval suite and surface any regressions
---

Run `npm run evals` and report the results.

If any case fails (score < 4 or error), do this:

1. Show me the failing case's name, score, and the judge's reasoning verbatim.
2. Open `evals/cases.ts` and find the failing case so I can see the rubric.
3. Open `lib/agent/system-prompt.ts`, `lib/agent/tools.ts`, and the runner so we have context for tuning.
4. Propose ONE specific change (system prompt edit, tool description tweak, hook adjustment) that would address the failure. Cite the judge's reasoning as evidence.
5. Stop. Do not apply the change without confirmation.

If everything passes, just print the aggregate line (avg score, pass rate, total cost) and stop.
