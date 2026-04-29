import { Workspace } from "@/components/workspace";
import { db } from "@/lib/db/mock";

export default function Home(): React.ReactElement {
  // Server component pre-loads the workspace state. The agent mutates this
  // state through tools; the client polls or re-renders on completion.
  const initialState = {
    users: db.users.list(),
    projects: db.projects.list(),
    tasks: db.tasks.list(),
  };
  return <Workspace initial={initialState} />;
}
