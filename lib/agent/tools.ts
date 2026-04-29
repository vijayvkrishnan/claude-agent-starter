import type Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { db, type Priority, type TaskStatus } from "@/lib/db/mock";
import { runSubAgent } from "@/lib/agent/sub-agents";

/**
 * Each tool is defined twice: once as a JSON schema for the API (which Claude
 * sees) and once as a runtime handler with a Zod schema for validation. The
 * Zod schema mirrors the API schema. Keep them in sync.
 *
 * We don't auto-convert Zod → JSON schema because (a) the schemas are small
 * and explicit reads better than generated, (b) the API schema is the source
 * of truth for what Claude is told the tool accepts, and (c) hand-written
 * descriptions on each property are more concrete than what zod-to-json-schema
 * generates.
 *
 * Tools are constructed via `defineTool` so the handler's `input` parameter is
 * typed against the Zod validator's output. No casts at the call site.
 */

const StatusEnum = z.enum(["todo", "in_progress", "in_review", "done", "blocked"]);
const PriorityEnum = z.enum(["low", "medium", "high", "urgent"]);

export interface ToolDef {
  name: string;
  description: string;
  inputSchema: Anthropic.Tool["input_schema"];
  validator: z.ZodTypeAny;
  invoke: (input: unknown) => Promise<string>;
  destructive?: boolean;
}

/**
 * Factory that links a Zod validator to a strongly-typed handler. The single
 * type assertion (input → z.infer<S>) lives inside this closure; individual
 * tool definitions get full type safety on `handler(input)` and the runtime
 * call site (`executeTool`) sees a uniform `invoke(unknown) => Promise<string>`
 * surface with no casts.
 */
function defineTool<S extends z.ZodTypeAny>(opts: {
  name: string;
  description: string;
  inputSchema: Anthropic.Tool["input_schema"];
  validator: S;
  handler: (input: z.infer<S>) => Promise<string> | string;
  destructive?: boolean;
}): ToolDef {
  const def: ToolDef = {
    name: opts.name,
    description: opts.description,
    inputSchema: opts.inputSchema,
    validator: opts.validator,
    invoke: async (input: unknown): Promise<string> => opts.handler(input as z.infer<S>),
  };
  if (opts.destructive) def.destructive = true;
  return def;
}

const listUsers = defineTool({
  name: "list_users",
  description:
    "List all users in the workspace. Returns id, name, email, and role for each. Use this to resolve a user name (e.g. 'Sarah') to a user id before filtering tasks.",
  inputSchema: { type: "object", properties: {} },
  validator: z.object({}).strict(),
  handler: () => JSON.stringify(db.users.list(), null, 2),
});

const listProjects = defineTool({
  name: "list_projects",
  description:
    "List all projects in the workspace with their owner and creation date. Use this to resolve a project name to its id.",
  inputSchema: { type: "object", properties: {} },
  validator: z.object({}).strict(),
  handler: () => JSON.stringify(db.projects.list(), null, 2),
});

const listTasks = defineTool({
  name: "list_tasks",
  description:
    "List tasks with optional filters. Filters compose with AND. With no filters, returns every task in the workspace. Returns full task records: title, status, priority, project_id, assignee_id, due_date, etc.",
  inputSchema: {
    type: "object",
    properties: {
      assignee_id: { type: "string", description: "Filter to tasks assigned to this user id (e.g. 'usr_sarah')." },
      project_id: { type: "string", description: "Filter to tasks in this project id (e.g. 'proj_growth')." },
      status: {
        type: "string",
        enum: ["todo", "in_progress", "in_review", "done", "blocked"],
        description: "Filter to tasks in this status.",
      },
      priority: {
        type: "string",
        enum: ["low", "medium", "high", "urgent"],
        description: "Filter to tasks at this priority.",
      },
    },
  },
  validator: z
    .object({
      assignee_id: z.string().optional(),
      project_id: z.string().optional(),
      status: StatusEnum.optional(),
      priority: PriorityEnum.optional(),
    })
    .strict(),
  handler: (input) => {
    const filter: Parameters<typeof db.tasks.list>[0] = {};
    if (input.assignee_id) filter.assigneeId = input.assignee_id;
    if (input.project_id) filter.projectId = input.project_id;
    if (input.status) filter.status = input.status;
    if (input.priority) filter.priority = input.priority;
    return JSON.stringify(db.tasks.list(filter), null, 2);
  },
});

const getTask = defineTool({
  name: "get_task",
  description: "Fetch a single task by id. Returns the full task record or an error if the id does not exist.",
  inputSchema: {
    type: "object",
    properties: { task_id: { type: "string", description: "The task id, e.g. 'tsk_001'." } },
    required: ["task_id"],
  },
  validator: z.object({ task_id: z.string() }).strict(),
  handler: (input) => {
    const task = db.tasks.get(input.task_id);
    if (!task) return JSON.stringify({ error: `task '${input.task_id}' not found` });
    return JSON.stringify(task, null, 2);
  },
});

const createTask = defineTool({
  name: "create_task",
  description: "Create a new task. Required: title and project_id. Returns the new task with its assigned id.",
  inputSchema: {
    type: "object",
    properties: {
      title: { type: "string", description: "Short, action-oriented title." },
      description: { type: "string", description: "Optional longer description." },
      project_id: { type: "string", description: "Project id, e.g. 'proj_growth'." },
      assignee_id: {
        type: ["string", "null"],
        description: "User id to assign, or null for unassigned.",
      },
      priority: {
        type: "string",
        enum: ["low", "medium", "high", "urgent"],
        description: "Default 'medium'.",
      },
      status: {
        type: "string",
        enum: ["todo", "in_progress", "in_review", "done", "blocked"],
        description: "Default 'todo'.",
      },
      due_date: {
        type: ["string", "null"],
        description: "ISO 8601 timestamp, or null. Example: '2026-05-15T17:00:00Z'.",
      },
    },
    required: ["title", "project_id"],
  },
  validator: z
    .object({
      title: z.string().min(1),
      description: z.string().default(""),
      project_id: z.string(),
      assignee_id: z.string().nullable().default(null),
      priority: PriorityEnum.default("medium"),
      status: StatusEnum.default("todo"),
      due_date: z.string().nullable().default(null),
    })
    .strict(),
  handler: (input) => {
    if (!db.projects.get(input.project_id)) {
      return JSON.stringify({ error: `project '${input.project_id}' does not exist` });
    }
    if (input.assignee_id && !db.users.get(input.assignee_id)) {
      return JSON.stringify({ error: `user '${input.assignee_id}' does not exist` });
    }
    const task = db.tasks.create({
      title: input.title,
      description: input.description,
      projectId: input.project_id,
      assigneeId: input.assignee_id,
      priority: input.priority,
      status: input.status,
      dueDate: input.due_date,
    });
    return JSON.stringify(task, null, 2);
  },
});

const updateTask = defineTool({
  name: "update_task",
  description:
    "Update fields on an existing task. Provide task_id and any subset of mutable fields. Use this to reassign, change status, or edit content.",
  inputSchema: {
    type: "object",
    properties: {
      task_id: { type: "string", description: "Task id to update." },
      title: { type: "string" },
      description: { type: "string" },
      status: { type: "string", enum: ["todo", "in_progress", "in_review", "done", "blocked"] },
      priority: { type: "string", enum: ["low", "medium", "high", "urgent"] },
      assignee_id: { type: ["string", "null"], description: "User id, or null to unassign." },
      due_date: { type: ["string", "null"], description: "ISO 8601 timestamp, or null." },
    },
    required: ["task_id"],
  },
  validator: z
    .object({
      task_id: z.string(),
      title: z.string().optional(),
      description: z.string().optional(),
      status: StatusEnum.optional(),
      priority: PriorityEnum.optional(),
      assignee_id: z.string().nullable().optional(),
      due_date: z.string().nullable().optional(),
    })
    .strict()
    .refine((v) => Object.keys(v).length > 1, {
      message: "At least one field beyond task_id must be provided.",
    }),
  handler: (input) => {
    if (input.assignee_id && !db.users.get(input.assignee_id)) {
      return JSON.stringify({ error: `user '${input.assignee_id}' does not exist` });
    }
    const patch: Parameters<typeof db.tasks.update>[1] = {};
    if (input.title !== undefined) patch.title = input.title;
    if (input.description !== undefined) patch.description = input.description;
    if (input.status !== undefined) patch.status = input.status as TaskStatus;
    if (input.priority !== undefined) patch.priority = input.priority as Priority;
    if (input.assignee_id !== undefined) patch.assigneeId = input.assignee_id;
    if (input.due_date !== undefined) patch.dueDate = input.due_date;
    const updated = db.tasks.update(input.task_id, patch);
    if (!updated) return JSON.stringify({ error: `task '${input.task_id}' not found` });
    return JSON.stringify(updated, null, 2);
  },
});

const deleteTask = defineTool({
  name: "delete_task",
  description:
    "Delete a task. DESTRUCTIVE: deletion is permanent and cannot be undone. In this deployment, the agent cannot execute deletes. The destructive-op hook will block this and tell the user that delete requires a confirmation flow outside the agent.",
  inputSchema: {
    type: "object",
    properties: { task_id: { type: "string", description: "Task id to delete." } },
    required: ["task_id"],
  },
  validator: z.object({ task_id: z.string() }).strict(),
  destructive: true,
  handler: () => {
    // Unreachable in this deployment: the destructive-op hook in lib/agent/hooks.ts
    // blocks execution before this handler runs. Implementation kept as a
    // placeholder for a real deployment that wires up its own confirmation flow.
    throw new Error("delete_task requires confirmation. Not allowed in this deployment.");
  },
});

/**
 * Sub-agent demo. Spawns three parallel sub-agents on Sonnet 4.6, each
 * analyzing the workspace from a different angle, then returns their findings
 * for the main agent (Opus 4.7) to synthesize. The sub-agent pattern keeps
 * the main loop's context clean while exploiting parallelism on cheaper
 * inference for narrow, single-shot reasoning tasks.
 */
const analyzeWorkspaceHealth = defineTool({
  name: "analyze_workspace_health",
  description:
    "Run a parallel multi-perspective health check on the workspace using sub-agents. Spawns three Sonnet sub-agents in parallel, each examining one dimension (delivery risk, dependency risk, scope risk), and returns their structured findings. The main agent should call this when asked an open-ended question about workspace health, project risk, or what to focus on. Cheaper and faster than reasoning over all the data in the main loop.",
  inputSchema: {
    type: "object",
    properties: {},
  },
  validator: z.object({}).strict(),
  handler: async () => {
    const tasks = db.tasks.list();
    const projects = db.projects.list();
    const users = db.users.list();
    const snapshot = JSON.stringify({ projects, users, tasks }, null, 2);

    const perspectives = [
      {
        name: "delivery_risk",
        prompt:
          "You are assessing DELIVERY RISK on a B2B workspace. Find tasks that are blocked, overdue, or urgent. Output a 3-sentence finding citing specific task IDs and assignees. Be concrete; no hedging.",
      },
      {
        name: "dependency_risk",
        prompt:
          "You are assessing DEPENDENCY RISK on a B2B workspace. Find concentration in any single owner's queue, or projects where a single person owns multiple critical-path items. Output a 3-sentence finding citing specific user IDs and task counts. Be concrete; no hedging.",
      },
      {
        name: "scope_risk",
        prompt:
          "You are assessing SCOPE RISK on a B2B workspace. Find projects with unusually high task counts or many in-progress items relative to done items, suggesting scope creep. Output a 3-sentence finding citing specific project IDs and counts. Be concrete; no hedging.",
      },
    ] as const;

    const findings = await Promise.all(
      perspectives.map(async (p) => {
        const text = await runSubAgent({
          system: p.prompt,
          userMessage: `Workspace snapshot:\n\n${snapshot}\n\nProvide your finding now.`,
        });
        return { perspective: p.name, finding: text };
      }),
    );

    return JSON.stringify(findings, null, 2);
  },
});

const TOOLS: readonly ToolDef[] = [
  listUsers,
  listProjects,
  listTasks,
  getTask,
  createTask,
  updateTask,
  deleteTask,
  analyzeWorkspaceHealth,
];

export const TOOL_DEFINITIONS: Anthropic.Tool[] = TOOLS.map((t) => ({
  name: t.name,
  description: t.description,
  input_schema: t.inputSchema,
}));

export const DESTRUCTIVE_TOOLS: ReadonlySet<string> = new Set(
  TOOLS.filter((t) => t.destructive).map((t) => t.name),
);

export interface ToolExecutionResult {
  content: string;
  isError: boolean;
}

export async function executeTool(name: string, rawInput: unknown): Promise<ToolExecutionResult> {
  const tool = TOOLS.find((t) => t.name === name);
  if (!tool) {
    return { content: JSON.stringify({ error: `unknown tool: ${name}` }), isError: true };
  }
  const parsed = tool.validator.safeParse(rawInput);
  if (!parsed.success) {
    return {
      content: JSON.stringify({ error: "invalid tool input", details: parsed.error.issues }),
      isError: true,
    };
  }
  try {
    const content = await tool.invoke(parsed.data);
    return { content, isError: false };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { content: JSON.stringify({ error: message }), isError: true };
  }
}
