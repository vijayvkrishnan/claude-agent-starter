import { NextResponse } from "next/server";
import { db } from "@/lib/db/mock";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Returns the current workspace state. The client refetches this after the
 * agent completes a request so the UI reflects any mutations the agent made.
 *
 * In a real deployment, your data layer (Postgres, Supabase, etc.) is the
 * source of truth. The UI either subscribes to it (Realtime/LiveQuery) or
 * polls. Either way, the agent and the UI read from the same store.
 */
export function GET(): NextResponse {
  return NextResponse.json({
    users: db.users.list(),
    projects: db.projects.list(),
    tasks: db.tasks.list(),
  });
}
