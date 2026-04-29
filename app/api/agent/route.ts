import type Anthropic from "@anthropic-ai/sdk";
import { runAgent, type RunEvent } from "@/lib/agent/runner";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface RequestBody {
  messages: Anthropic.MessageParam[];
}

/**
 * Streaming agent endpoint. Server-Sent Events; one JSON-encoded RunEvent
 * per `data:` line. The browser-side EventSource (or fetch + ReadableStream
 * reader) parses each line into a RunEvent and updates the UI.
 *
 * SSE was chosen over WebSocket because:
 *   - one-way server → client is all we need (no client-to-server messaging
 *     mid-stream; the next user message starts a new HTTP request)
 *   - SSE rides plain HTTP/1.1, works through every proxy and CDN, and
 *     requires zero infra beyond what Next.js gives you
 *   - if you eventually need bidirectional, swap to WebSocket. The
 *     RunEvent shape stays the same
 */
export async function POST(req: Request): Promise<Response> {
  let body: RequestBody;
  try {
    body = (await req.json()) as RequestBody;
  } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON body" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  if (!Array.isArray(body.messages) || body.messages.length === 0) {
    return new Response(JSON.stringify({ error: "Field 'messages' must be a non-empty array" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (event: RunEvent): void => {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
      };

      try {
        for await (const event of runAgent({ messages: body.messages })) {
          send(event);
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        send({ type: "error", message });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      // Disable buffering on Vercel + Nginx so tokens flush immediately.
      "X-Accel-Buffering": "no",
    },
  });
}
