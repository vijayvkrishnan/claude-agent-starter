import { describe, it, expect } from "vitest";
import {
  calculateCostUsd,
  isKnownModel,
  preToolCheck,
  redactPii,
} from "@/lib/agent/hooks";

describe("calculateCostUsd", () => {
  it("computes cost from a mix of input, output, cache-read, and cache-create tokens", () => {
    // Opus 4.7 pricing (per 1M tokens):
    //   input $5.00 · output $25.00 · cache write $6.25 · cache read $0.50
    // Inputs:
    //   1000 input + 500 output + 2000 cache_read + 100 cache_create
    // Expected:
    //   (1000 * 5 + 500 * 25 + 2000 * 0.5 + 100 * 6.25) / 1_000_000
    //   = (5000 + 12500 + 1000 + 625) / 1_000_000
    //   = 19125 / 1_000_000
    //   = 0.019125
    const cost = calculateCostUsd("claude-opus-4-7", {
      inputTokens: 1000,
      outputTokens: 500,
      cacheReadTokens: 2000,
      cacheCreationTokens: 100,
    });
    expect(cost).toBeCloseTo(0.019125, 6);
  });

  it("returns 0 for zero usage", () => {
    expect(
      calculateCostUsd("claude-opus-4-7", {
        inputTokens: 0,
        outputTokens: 0,
        cacheReadTokens: 0,
        cacheCreationTokens: 0,
      }),
    ).toBe(0);
  });

  it("prices Sonnet 4.6 cheaper than Opus 4.7 for the same workload", () => {
    const usage = {
      inputTokens: 10_000,
      outputTokens: 2_000,
      cacheReadTokens: 0,
      cacheCreationTokens: 0,
    };
    const opus = calculateCostUsd("claude-opus-4-7", usage);
    const sonnet = calculateCostUsd("claude-sonnet-4-6", usage);
    expect(sonnet).toBeLessThan(opus);
  });

  it("prices cache reads ~10x cheaper than uncached input", () => {
    const allInput = calculateCostUsd("claude-opus-4-7", {
      inputTokens: 10_000,
      outputTokens: 0,
      cacheReadTokens: 0,
      cacheCreationTokens: 0,
    });
    const allCacheRead = calculateCostUsd("claude-opus-4-7", {
      inputTokens: 0,
      outputTokens: 0,
      cacheReadTokens: 10_000,
      cacheCreationTokens: 0,
    });
    expect(allCacheRead).toBeCloseTo(allInput / 10, 8);
  });
});

describe("isKnownModel", () => {
  it("recognizes current model IDs", () => {
    expect(isKnownModel("claude-opus-4-7")).toBe(true);
    expect(isKnownModel("claude-sonnet-4-6")).toBe(true);
    expect(isKnownModel("claude-haiku-4-5")).toBe(true);
  });

  it("rejects unknown or stale IDs", () => {
    expect(isKnownModel("claude-3-opus-20240229")).toBe(false);
    expect(isKnownModel("gpt-4o")).toBe(false);
    expect(isKnownModel("")).toBe(false);
  });
});

describe("redactPii", () => {
  it("redacts email addresses", () => {
    expect(redactPii("Contact me at user@example.com please")).toBe(
      "Contact me at [email] please",
    );
  });

  it("redacts US phone numbers in common formats", () => {
    expect(redactPii("Call 555-123-4567")).toBe("Call [phone]");
    expect(redactPii("Reach me at (555) 123-4567")).toBe("Reach me at [phone]");
    expect(redactPii("Mobile: +1 555.123.4567")).toBe("Mobile: [phone]");
  });

  it("redacts SSNs", () => {
    expect(redactPii("SSN on file: 123-45-6789")).toBe("SSN on file: [ssn]");
  });

  it("redacts credit card numbers", () => {
    expect(redactPii("Card: 4111 1111 1111 1111")).toBe("Card: [card]");
    expect(redactPii("On file 4111-1111-1111-1111")).toBe("On file [card]");
  });

  it("preserves text with no PII", () => {
    const clean = "Workspace task tsk_001 was reassigned to user usr_alex.";
    expect(redactPii(clean)).toBe(clean);
  });

  it("redacts multiple PII types in one pass", () => {
    expect(redactPii("Email user@example.com or text 555-123-4567 — SSN 123-45-6789")).toBe(
      "Email [email] or text [phone] — SSN [ssn]",
    );
  });
});

describe("preToolCheck", () => {
  it("blocks the destructive delete_task tool", () => {
    const decision = preToolCheck("delete_task");
    expect(decision.ok).toBe(false);
    expect(decision.reason).toBeTruthy();
    expect(decision.reason).toContain("destructive");
  });

  it("allows all read tools", () => {
    expect(preToolCheck("list_users").ok).toBe(true);
    expect(preToolCheck("list_projects").ok).toBe(true);
    expect(preToolCheck("list_tasks").ok).toBe(true);
    expect(preToolCheck("get_task").ok).toBe(true);
  });

  it("allows mutating but non-destructive tools", () => {
    expect(preToolCheck("create_task").ok).toBe(true);
    expect(preToolCheck("update_task").ok).toBe(true);
  });

  it("does not block tools the runner does not know about (unknown-tool errors are surfaced elsewhere)", () => {
    expect(preToolCheck("not_a_real_tool").ok).toBe(true);
  });
});
