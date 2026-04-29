"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { Project, Task, User } from "@/lib/db/mock";
import { CommandPalette } from "@/components/command-palette";
import { Sidebar } from "@/components/sidebar";
import { TaskTable } from "@/components/task-table";
import { CommandIcon, SparkIcon } from "@/components/icons";

export interface WorkspaceState {
  users: User[];
  projects: Project[];
  tasks: Task[];
}

interface Props {
  readonly initial: WorkspaceState;
}

// In a real product this comes from your auth/session. Hardcoded for the demo.
const CURRENT_USER_ID = "usr_sarah";

// "all" / "inbox" / "my-tasks" / a project id
export type ViewKey = "all" | "inbox" | "my-tasks" | string;

export function Workspace({ initial }: Props): React.ReactElement {
  const [state, setState] = useState<WorkspaceState>(initial);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [activeView, setActiveView] = useState<ViewKey>("all");

  // ⌘K / Ctrl+K opens the palette. Escape closes it (handled inside the
  // palette component so it doesn't fire when the input is mid-IME).
  useEffect(() => {
    const handler = (e: KeyboardEvent): void => {
      if (e.key === "k" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setPaletteOpen((open) => !open);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  const refreshState = useCallback(async (): Promise<void> => {
    try {
      const res = await fetch("/api/state", { cache: "no-store" });
      if (!res.ok) return;
      const next = (await res.json()) as WorkspaceState;
      setState(next);
    } catch {
      // Network blip. Leave the UI as-is; user will see eventual consistency
      // on the next refresh. In production, surface a toast here.
    }
  }, []);

  const inboxCount = useMemo(
    () => state.tasks.filter((t) => t.assigneeId === CURRENT_USER_ID && t.status === "todo").length,
    [state.tasks],
  );
  const myTasksCount = useMemo(
    () => state.tasks.filter((t) => t.assigneeId === CURRENT_USER_ID).length,
    [state.tasks],
  );

  const visibleTasks = useMemo(() => {
    switch (activeView) {
      case "all":
        return state.tasks;
      case "inbox":
        return state.tasks.filter((t) => t.assigneeId === CURRENT_USER_ID && t.status === "todo");
      case "my-tasks":
        return state.tasks.filter((t) => t.assigneeId === CURRENT_USER_ID);
      default:
        return state.tasks.filter((t) => t.projectId === activeView);
    }
  }, [state.tasks, activeView]);

  const headerTitle = useMemo(() => {
    if (activeView === "all") return "All tasks";
    if (activeView === "inbox") return "Inbox";
    if (activeView === "my-tasks") return "My tasks";
    return state.projects.find((p) => p.id === activeView)?.name ?? "Workspace";
  }, [activeView, state.projects]);

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-bg-base">
      <Sidebar
        projects={state.projects}
        activeView={activeView}
        onSelectView={setActiveView}
        inboxCount={inboxCount}
        myTasksCount={myTasksCount}
        onOpenPalette={() => setPaletteOpen(true)}
      />

      <main className="flex-1 flex flex-col min-w-0 relative">
        <Header
          title={headerTitle}
          totalTaskCount={visibleTasks.length}
          onOpenPalette={() => setPaletteOpen(true)}
        />

        <div className="flex-1 overflow-y-auto">
          <TaskTable tasks={visibleTasks} users={state.users} projects={state.projects} />
        </div>

        <FloatingPaletteHint onClick={() => setPaletteOpen(true)} />
      </main>

      <CommandPalette
        open={paletteOpen}
        onClose={() => setPaletteOpen(false)}
        onAgentComplete={refreshState}
      />
    </div>
  );
}

interface HeaderProps {
  readonly title: string;
  readonly totalTaskCount: number;
  readonly onOpenPalette: () => void;
}

function Header({ title, totalTaskCount, onOpenPalette }: HeaderProps): React.ReactElement {
  return (
    <div className="border-b border-border-subtle px-6 py-4 flex items-center justify-between bg-bg-base/80 backdrop-blur-sm relative z-10">
      <div className="flex items-baseline gap-3">
        <span className="text-text-tertiary text-sm">Workspace</span>
        <span className="text-text-tertiary text-xs">/</span>
        <h1 className="text-text-primary font-medium tracking-tight">{title}</h1>
        <span className="ml-2 text-text-tertiary text-xs tabular">
          {totalTaskCount} {totalTaskCount === 1 ? "task" : "tasks"}
        </span>
      </div>

      <button
        onClick={onOpenPalette}
        className="group flex items-center gap-2 px-3 py-1.5 rounded-md border border-border-default hover:border-accent/40 bg-bg-surface hover:bg-bg-elevated transition-colors text-text-secondary hover:text-text-primary text-sm"
      >
        <SparkIcon className="text-accent" size={12} />
        <span>Ask Stratus</span>
        <kbd className="ml-2 px-1.5 py-0.5 text-2xs font-mono rounded border border-border-default text-text-tertiary group-hover:text-text-secondary tabular">
          ⌘K
        </kbd>
      </button>
    </div>
  );
}

function FloatingPaletteHint({ onClick }: { readonly onClick: () => void }): React.ReactElement {
  return (
    <button
      onClick={onClick}
      className="absolute bottom-6 right-6 group flex items-center gap-2 px-4 py-2.5 rounded-full bg-bg-elevated border border-border-default hover:border-accent/60 hover:bg-bg-overlay transition-all shadow-2xl shadow-black/40 ring-inner"
    >
      <CommandIcon className="text-accent" size={14} />
      <span className="text-text-secondary group-hover:text-text-primary text-sm">
        Press <kbd className="px-1 font-mono text-2xs tabular">⌘K</kbd> to delegate
      </span>
    </button>
  );
}
