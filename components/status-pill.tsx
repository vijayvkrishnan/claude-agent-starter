import type { Priority, TaskStatus } from "@/lib/db/mock";

const STATUS_STYLE: Record<TaskStatus, { label: string; dot: string; text: string }> = {
  todo: { label: "Todo", dot: "bg-text-tertiary", text: "text-text-secondary" },
  in_progress: { label: "In Progress", dot: "bg-accent", text: "text-accent" },
  in_review: { label: "In Review", dot: "bg-signal-blue", text: "text-signal-blue" },
  done: { label: "Done", dot: "bg-signal-green", text: "text-signal-green" },
  blocked: { label: "Blocked", dot: "bg-signal-red", text: "text-signal-red" },
};

const PRIORITY_STYLE: Record<Priority, { label: string; bars: number; color: string }> = {
  low: { label: "Low", bars: 1, color: "bg-text-tertiary" },
  medium: { label: "Med", bars: 2, color: "bg-text-secondary" },
  high: { label: "High", bars: 3, color: "bg-text-primary" },
  urgent: { label: "Urgent", bars: 3, color: "bg-accent" },
};

export function StatusPill({ status }: { readonly status: TaskStatus }): React.ReactElement {
  const s = STATUS_STYLE[status];
  return (
    <span className={`inline-flex items-center gap-1.5 text-2xs uppercase tracking-wider ${s.text}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${s.dot}`} />
      {s.label}
    </span>
  );
}

export function PriorityPill({ priority }: { readonly priority: Priority }): React.ReactElement {
  const p = PRIORITY_STYLE[priority];
  return (
    <span className="inline-flex items-end gap-[2px] h-3" title={p.label}>
      {[1, 2, 3].map((bar) => (
        <span
          key={bar}
          className={`w-[3px] rounded-sm ${bar <= p.bars ? p.color : "bg-border-default"}`}
          style={{ height: `${bar * 4}px` }}
        />
      ))}
    </span>
  );
}
