import { describe, it, expect } from "vitest";
import { executeTool, TOOL_DEFINITIONS, DESTRUCTIVE_TOOLS } from "@/lib/agent/tools";

describe("executeTool", () => {
  it("returns an error for an unknown tool name", async () => {
    const result = await executeTool("nonexistent_tool", {});
    expect(result.isError).toBe(true);
    expect(result.content).toContain("unknown tool");
  });

  it("rejects malformed input via Zod validation", async () => {
    const result = await executeTool("get_task", { wrong_field: "value" });
    expect(result.isError).toBe(true);
    expect(result.content).toContain("invalid tool input");
  });

  it("list_users returns a non-empty array of user records", async () => {
    const result = await executeTool("list_users", {});
    expect(result.isError).toBe(false);
    const parsed: unknown = JSON.parse(result.content);
    expect(Array.isArray(parsed)).toBe(true);
    expect((parsed as unknown[]).length).toBeGreaterThan(0);
  });

  it("get_task returns a structured 'not found' error in the content for an unknown id", async () => {
    const result = await executeTool("get_task", { task_id: "tsk_does_not_exist" });
    // Tool succeeded (no validation/runtime error); the lookup miss is in the payload.
    expect(result.isError).toBe(false);
    const parsed = JSON.parse(result.content) as { error?: string };
    expect(parsed.error).toBeTruthy();
    expect(parsed.error).toContain("not found");
  });

  it("list_tasks accepts an empty filter and returns all tasks", async () => {
    const result = await executeTool("list_tasks", {});
    expect(result.isError).toBe(false);
    const parsed = JSON.parse(result.content) as unknown[];
    expect(parsed.length).toBeGreaterThan(0);
  });

  it("list_tasks filters by assignee_id", async () => {
    const result = await executeTool("list_tasks", { assignee_id: "usr_sarah" });
    expect(result.isError).toBe(false);
    const parsed = JSON.parse(result.content) as Array<{ assigneeId: string }>;
    expect(parsed.length).toBeGreaterThan(0);
    for (const t of parsed) expect(t.assigneeId).toBe("usr_sarah");
  });
});

describe("TOOL_DEFINITIONS", () => {
  it("exposes every tool with name, description, and input_schema", () => {
    expect(TOOL_DEFINITIONS.length).toBeGreaterThan(0);
    for (const t of TOOL_DEFINITIONS) {
      expect(t.name).toBeTruthy();
      expect(t.description).toBeDefined();
      expect(t.description?.length ?? 0).toBeGreaterThan(20);
      expect(t.input_schema).toBeTruthy();
    }
  });

  it("includes the canonical workspace tools", () => {
    const names = TOOL_DEFINITIONS.map((t) => t.name);
    for (const expected of [
      "list_users",
      "list_projects",
      "list_tasks",
      "get_task",
      "create_task",
      "update_task",
      "delete_task",
      "analyze_workspace_health",
    ]) {
      expect(names).toContain(expected);
    }
  });
});

describe("DESTRUCTIVE_TOOLS", () => {
  it("marks delete_task as destructive", () => {
    expect(DESTRUCTIVE_TOOLS.has("delete_task")).toBe(true);
  });

  it("does not mark read or non-destructive mutators as destructive", () => {
    expect(DESTRUCTIVE_TOOLS.has("list_tasks")).toBe(false);
    expect(DESTRUCTIVE_TOOLS.has("create_task")).toBe(false);
    expect(DESTRUCTIVE_TOOLS.has("update_task")).toBe(false);
  });
});
