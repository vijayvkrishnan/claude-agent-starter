/**
 * In-memory mock database for the demo.
 *
 * Replace this with your real data layer (Postgres, Prisma, Supabase, etc.).
 * The agent's tools are written against these interfaces, so swapping the
 * implementation is mechanical.
 */

export type TaskStatus = "todo" | "in_progress" | "in_review" | "done" | "blocked";
export type Priority = "low" | "medium" | "high" | "urgent";

export interface User {
  id: string;
  name: string;
  email: string;
  role: string;
}

export interface Project {
  id: string;
  name: string;
  description: string;
  ownerId: string;
  createdAt: string;
}

export interface Task {
  id: string;
  title: string;
  description: string;
  status: TaskStatus;
  priority: Priority;
  projectId: string;
  assigneeId: string | null;
  createdAt: string;
  dueDate: string | null;
  updatedAt: string;
}

const users: User[] = [
  { id: "usr_sarah", name: "Sarah Chen", email: "sarah@stratus.app", role: "Engineering Lead" },
  { id: "usr_alex", name: "Alex Rivera", email: "alex@stratus.app", role: "Product" },
  { id: "usr_jamie", name: "Jamie Park", email: "jamie@stratus.app", role: "Design" },
  { id: "usr_morgan", name: "Morgan Singh", email: "morgan@stratus.app", role: "Engineering" },
  { id: "usr_devon", name: "Devon Walsh", email: "devon@stratus.app", role: "Growth" },
];

const projects: Project[] = [
  {
    id: "proj_growth",
    name: "Growth Q1",
    description: "Top-of-funnel experiments and onboarding rework for Q1.",
    ownerId: "usr_devon",
    createdAt: "2026-01-12T09:00:00Z",
  },
  {
    id: "proj_platform",
    name: "Platform Reliability",
    description: "SLA hardening, error budgets, and observability investments.",
    ownerId: "usr_sarah",
    createdAt: "2026-02-03T09:00:00Z",
  },
  {
    id: "proj_mobile",
    name: "Mobile App v2",
    description: "Ground-up rewrite of the mobile app with offline-first architecture.",
    ownerId: "usr_jamie",
    createdAt: "2026-03-21T09:00:00Z",
  },
];

const tasks: Task[] = [
  {
    id: "tsk_001",
    title: "Audit Stripe webhook signature verification",
    description: "Confirm signature verification is enforced on every webhook endpoint, not just /payments.",
    status: "in_progress",
    priority: "high",
    projectId: "proj_platform",
    assigneeId: "usr_sarah",
    createdAt: "2026-04-15T10:00:00Z",
    dueDate: "2026-04-25T17:00:00Z",
    updatedAt: "2026-04-22T14:30:00Z",
  },
  {
    id: "tsk_002",
    title: "Migrate session store from Redis to Postgres",
    description: "Two-phase rollout: dual-write, verify, cut reads, drop Redis.",
    status: "todo",
    priority: "medium",
    projectId: "proj_platform",
    assigneeId: "usr_morgan",
    createdAt: "2026-04-10T09:00:00Z",
    dueDate: "2026-05-15T17:00:00Z",
    updatedAt: "2026-04-10T09:00:00Z",
  },
  {
    id: "tsk_003",
    title: "Onboarding email sequence: 7 days",
    description: "Replace the existing 3-email flow with a behavior-triggered 7-day sequence.",
    status: "in_review",
    priority: "high",
    projectId: "proj_growth",
    assigneeId: "usr_devon",
    createdAt: "2026-04-05T11:00:00Z",
    dueDate: "2026-04-26T17:00:00Z",
    updatedAt: "2026-04-23T16:00:00Z",
  },
  {
    id: "tsk_004",
    title: "Landing page A/B: hero copy",
    description: "Test data-led headline against value-led headline. Need 3,000 sessions per arm.",
    status: "in_progress",
    priority: "medium",
    projectId: "proj_growth",
    assigneeId: "usr_devon",
    createdAt: "2026-04-12T09:00:00Z",
    dueDate: "2026-05-02T17:00:00Z",
    updatedAt: "2026-04-22T11:00:00Z",
  },
  {
    id: "tsk_005",
    title: "Offline sync conflict resolution",
    description: "Spec the conflict resolution strategy (last-write-wins vs CRDT-lite).",
    status: "todo",
    priority: "urgent",
    projectId: "proj_mobile",
    assigneeId: "usr_jamie",
    createdAt: "2026-04-18T09:00:00Z",
    dueDate: "2026-04-30T17:00:00Z",
    updatedAt: "2026-04-18T09:00:00Z",
  },
  {
    id: "tsk_006",
    title: "Replace toast notifications with system sheet",
    description: "Mobile-first redesign of all transient feedback. Toast pattern doesn't scale.",
    status: "in_progress",
    priority: "low",
    projectId: "proj_mobile",
    assigneeId: "usr_jamie",
    createdAt: "2026-04-08T09:00:00Z",
    dueDate: "2026-05-10T17:00:00Z",
    updatedAt: "2026-04-20T13:00:00Z",
  },
  {
    id: "tsk_007",
    title: "Database query timeout investigation",
    description: "P99 query latency spiked 4x on Tuesday. Trace to slow query log.",
    status: "blocked",
    priority: "urgent",
    projectId: "proj_platform",
    assigneeId: "usr_sarah",
    createdAt: "2026-04-22T09:00:00Z",
    dueDate: "2026-04-24T17:00:00Z",
    updatedAt: "2026-04-23T10:00:00Z",
  },
  {
    id: "tsk_008",
    title: "Quarterly board deck: engineering section",
    description: "10 slides max. Lead with the reliability win, frame the mobile rewrite as the bet.",
    status: "todo",
    priority: "high",
    projectId: "proj_platform",
    assigneeId: "usr_sarah",
    createdAt: "2026-04-20T09:00:00Z",
    dueDate: "2026-04-28T17:00:00Z",
    updatedAt: "2026-04-20T09:00:00Z",
  },
  {
    id: "tsk_009",
    title: "Pricing page redesign",
    description: "Three tiers, anchored on the middle. Remove the comparison table experiment.",
    status: "in_progress",
    priority: "medium",
    projectId: "proj_growth",
    assigneeId: "usr_alex",
    createdAt: "2026-04-14T09:00:00Z",
    dueDate: "2026-05-05T17:00:00Z",
    updatedAt: "2026-04-22T15:00:00Z",
  },
  {
    id: "tsk_010",
    title: "Customer interview synthesis: March cohort",
    description: "12 interviews, pull the 3 strongest objection patterns and 5 quotable wins.",
    status: "done",
    priority: "medium",
    projectId: "proj_growth",
    assigneeId: "usr_alex",
    createdAt: "2026-03-28T09:00:00Z",
    dueDate: "2026-04-15T17:00:00Z",
    updatedAt: "2026-04-14T16:00:00Z",
  },
  {
    id: "tsk_011",
    title: "iOS push notification permission flow",
    description: "Soft-ask before the system prompt. Measure permission grant rate uplift.",
    status: "todo",
    priority: "medium",
    projectId: "proj_mobile",
    assigneeId: "usr_morgan",
    createdAt: "2026-04-21T09:00:00Z",
    dueDate: "2026-05-08T17:00:00Z",
    updatedAt: "2026-04-21T09:00:00Z",
  },
  {
    id: "tsk_012",
    title: "Error budget dashboard",
    description: "Single dashboard per service: SLO, error budget remaining, burn rate.",
    status: "in_progress",
    priority: "high",
    projectId: "proj_platform",
    assigneeId: "usr_morgan",
    createdAt: "2026-04-16T09:00:00Z",
    dueDate: "2026-05-01T17:00:00Z",
    updatedAt: "2026-04-23T09:00:00Z",
  },
];

let taskCounter = tasks.length;
const newId = (): string => `tsk_${String(++taskCounter).padStart(3, "0")}`;

export const db = {
  users: {
    list: (): User[] => structuredClone(users),
    get: (id: string): User | null => {
      const found = users.find((u) => u.id === id);
      return found ? structuredClone(found) : null;
    },
    findByName: (name: string): User | null => {
      const lower = name.toLowerCase();
      const found = users.find(
        (u) => u.name.toLowerCase().includes(lower) || u.email.toLowerCase().includes(lower),
      );
      return found ? structuredClone(found) : null;
    },
  },
  projects: {
    list: (): Project[] => structuredClone(projects),
    get: (id: string): Project | null => {
      const found = projects.find((p) => p.id === id);
      return found ? structuredClone(found) : null;
    },
    findByName: (name: string): Project | null => {
      const lower = name.toLowerCase();
      const found = projects.find((p) => p.name.toLowerCase().includes(lower));
      return found ? structuredClone(found) : null;
    },
  },
  tasks: {
    list: (filter?: {
      assigneeId?: string;
      projectId?: string;
      status?: TaskStatus;
      priority?: Priority;
    }): Task[] => {
      let result = tasks;
      if (filter?.assigneeId) result = result.filter((t) => t.assigneeId === filter.assigneeId);
      if (filter?.projectId) result = result.filter((t) => t.projectId === filter.projectId);
      if (filter?.status) result = result.filter((t) => t.status === filter.status);
      if (filter?.priority) result = result.filter((t) => t.priority === filter.priority);
      return structuredClone(result);
    },
    get: (id: string): Task | null => {
      const found = tasks.find((t) => t.id === id);
      return found ? structuredClone(found) : null;
    },
    create: (input: Omit<Task, "id" | "createdAt" | "updatedAt">): Task => {
      const now = new Date().toISOString();
      const task: Task = { ...input, id: newId(), createdAt: now, updatedAt: now };
      tasks.push(task);
      return structuredClone(task);
    },
    update: (id: string, patch: Partial<Omit<Task, "id" | "createdAt">>): Task | null => {
      const idx = tasks.findIndex((t) => t.id === id);
      if (idx === -1) return null;
      const existing = tasks[idx]!;
      const updated: Task = { ...existing, ...patch, updatedAt: new Date().toISOString() };
      tasks[idx] = updated;
      return structuredClone(updated);
    },
  },
} as const;
