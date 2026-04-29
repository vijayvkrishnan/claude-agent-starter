import type { Project, Task, User } from "@/lib/db/mock";
import { PriorityPill, StatusPill } from "@/components/status-pill";

interface Props {
  readonly tasks: Task[];
  readonly users: User[];
  readonly projects: Project[];
}

export function TaskTable({ tasks, users, projects }: Props): React.ReactElement {
  if (tasks.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full hatch text-text-tertiary py-32">
        <p className="text-sm">No tasks here yet.</p>
        <p className="text-2xs mt-1.5">Press ⌘K to delegate one to the agent.</p>
      </div>
    );
  }

  return (
    <div className="px-6 py-4">
      <div className="border border-border-subtle rounded-lg overflow-hidden bg-bg-surface">
        <div className="grid grid-cols-[28px_minmax(0,1fr)_140px_120px_120px_140px] gap-3 px-4 py-2.5 border-b border-border-subtle bg-bg-elevated text-2xs uppercase tracking-wider text-text-tertiary">
          <span></span>
          <span>Title</span>
          <span>Project</span>
          <span>Assignee</span>
          <span>Status</span>
          <span className="text-right">Due</span>
        </div>

        {tasks.map((task) => {
          const assignee = users.find((u) => u.id === task.assigneeId) ?? null;
          const project = projects.find((p) => p.id === task.projectId) ?? null;
          return (
            <div
              key={task.id}
              className="grid grid-cols-[28px_minmax(0,1fr)_140px_120px_120px_140px] gap-3 px-4 py-3 border-b border-border-subtle last:border-b-0 hover:bg-bg-elevated/50 transition-colors items-center group"
            >
              <PriorityPill priority={task.priority} />
              <div className="min-w-0">
                <div className="text-text-primary text-sm truncate">{task.title}</div>
                <div className="text-text-tertiary text-2xs font-mono mt-0.5 tabular">
                  {task.id}
                </div>
              </div>
              <div className="text-text-secondary text-xs truncate">{project?.name ?? "·"}</div>
              <div className="flex items-center gap-2 text-xs">
                {assignee ? (
                  <>
                    <Avatar name={assignee.name} />
                    <span className="text-text-secondary truncate">{firstName(assignee.name)}</span>
                  </>
                ) : (
                  <span className="text-text-tertiary text-2xs italic">Unassigned</span>
                )}
              </div>
              <StatusPill status={task.status} />
              <div className="text-right text-text-tertiary text-xs tabular">
                {task.dueDate ? formatDate(task.dueDate) : "·"}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function firstName(fullName: string): string {
  const parts = fullName.split(" ");
  return parts[0] ?? fullName;
}

function Avatar({ name }: { readonly name: string }): React.ReactElement {
  const initials = name
    .split(" ")
    .map((n) => n.charAt(0))
    .join("")
    .slice(0, 2)
    .toUpperCase();
  // Deterministic color from the name. Same person always same hue.
  const hue = (name.charCodeAt(0) * 31 + (name.charCodeAt(1) || 0)) % 360;
  return (
    <div
      className="w-5 h-5 rounded-full flex items-center justify-center text-2xs font-medium tabular shrink-0"
      style={{
        background: `hsl(${hue}deg 30% 25%)`,
        color: `hsl(${hue}deg 60% 80%)`,
      }}
    >
      {initials}
    </div>
  );
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}
