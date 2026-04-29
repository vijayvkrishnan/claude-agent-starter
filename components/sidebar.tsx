import type { Project } from "@/lib/db/mock";
import type { ViewKey } from "@/components/workspace";
import { CheckSquareIcon, FolderIcon, InboxIcon, SparkIcon } from "@/components/icons";

interface Props {
  readonly projects: Project[];
  readonly activeView: ViewKey;
  readonly onSelectView: (view: ViewKey) => void;
  readonly inboxCount: number;
  readonly myTasksCount: number;
  readonly onOpenPalette: () => void;
}

export function Sidebar({
  projects,
  activeView,
  onSelectView,
  inboxCount,
  myTasksCount,
  onOpenPalette,
}: Props): React.ReactElement {
  return (
    <aside className="w-60 shrink-0 border-r border-border-subtle bg-bg-surface flex flex-col">
      {/* Brand mark */}
      <div className="px-5 py-5 border-b border-border-subtle">
        <div className="flex items-center gap-2.5">
          <div className="w-7 h-7 rounded-md bg-accent flex items-center justify-center shadow-md shadow-accent/30">
            <span className="font-mono text-accent-fg font-bold text-sm">S</span>
          </div>
          <div className="flex flex-col">
            <span className="font-mono text-text-primary text-sm tracking-tight font-medium leading-tight">
              STRATUS
            </span>
            <span className="text-2xs text-text-tertiary tracking-widest uppercase leading-tight">
              workspace
            </span>
          </div>
        </div>
      </div>

      {/* Top nav */}
      <nav className="px-3 py-3 space-y-0.5">
        <NavRow
          icon={<InboxIcon size={14} />}
          label="Inbox"
          badge={inboxCount}
          active={activeView === "inbox"}
          onClick={() => onSelectView("inbox")}
        />
        <NavRow
          icon={<CheckSquareIcon size={14} />}
          label="My tasks"
          badge={myTasksCount}
          active={activeView === "my-tasks"}
          onClick={() => onSelectView("my-tasks")}
        />
      </nav>

      {/* Projects */}
      <div className="px-3 mt-2">
        <div className="flex items-center justify-between px-2 py-1.5">
          <span className="text-2xs uppercase tracking-widest text-text-tertiary font-medium">
            Projects
          </span>
        </div>
        <div className="space-y-0.5">
          <NavRow
            icon={<FolderIcon size={14} />}
            label="All tasks"
            active={activeView === "all"}
            onClick={() => onSelectView("all")}
          />
          {projects.map((project) => (
            <NavRow
              key={project.id}
              icon={<FolderIcon size={14} />}
              label={project.name}
              active={activeView === project.id}
              onClick={() => onSelectView(project.id)}
            />
          ))}
        </div>
      </div>

      {/* Spacer + Agent CTA */}
      <div className="flex-1" />

      <div className="p-3 border-t border-border-subtle">
        <button
          onClick={onOpenPalette}
          className="w-full group flex items-center gap-2.5 px-3 py-2.5 rounded-md border border-border-default hover:border-accent/40 bg-bg-elevated hover:bg-bg-overlay transition-all text-left"
        >
          <div className="w-7 h-7 rounded-md bg-bg-overlay flex items-center justify-center border border-border-default group-hover:border-accent/40 transition-colors">
            <SparkIcon className="text-accent" size={12} />
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-text-primary text-xs font-medium leading-tight">Ask Stratus</div>
            <div className="text-text-tertiary text-2xs leading-tight mt-0.5">
              ⌘K · powered by Claude
            </div>
          </div>
        </button>
      </div>
    </aside>
  );
}

interface NavRowProps {
  readonly icon: React.ReactNode;
  readonly label: string;
  readonly badge?: number;
  readonly active: boolean;
  readonly onClick: () => void;
}

function NavRow({ icon, label, badge, active, onClick }: NavRowProps): React.ReactElement {
  return (
    <button
      onClick={onClick}
      className={`w-full group flex items-center gap-2.5 px-2.5 py-1.5 rounded text-sm transition-colors text-left ${
        active
          ? "bg-bg-elevated text-text-primary"
          : "text-text-secondary hover:text-text-primary hover:bg-bg-elevated/60"
      }`}
    >
      <span className={active ? "text-accent" : "text-text-tertiary group-hover:text-text-secondary"}>
        {icon}
      </span>
      <span className="flex-1 truncate">{label}</span>
      {badge !== undefined && badge > 0 && (
        <span
          className={`text-2xs tabular ${active ? "text-text-secondary" : "text-text-tertiary"}`}
        >
          {badge}
        </span>
      )}
    </button>
  );
}
