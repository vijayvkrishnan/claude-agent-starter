"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { RunEvent } from "@/lib/agent/runner";
import { ArrowReturnIcon, CloseIcon, SparkIcon, ToolIcon } from "@/components/icons";

interface Props {
  readonly open: boolean;
  readonly onClose: () => void;
  readonly onAgentComplete: () => void;
}

interface ToolCall {
  id: string;
  name: string;
  input: unknown;
  result?: { isError: boolean; content: string; latencyMs: number };
}

type AgentMessage = {
  role: "user" | "assistant";
  text: string;
  thinking?: string;
  toolCalls?: ToolCall[];
};

type Status = "idle" | "thinking" | "streaming" | "done" | "blocked" | "error";

interface RunMeta {
  model?: string;
  iterations: number;
  totalCostUsd: number;
  totalLatencyMs: number;
  blockedReason?: string;
  errorMessage?: string;
}

const SUGGESTIONS = [
  "What's blocked on the platform team?",
  "Reassign all of Sarah's overdue tasks to Alex",
  "Which project is most at risk and why?",
  "Create a high-priority task for Devon to audit our pricing page conversion",
] as const;

export function CommandPalette({ open, onClose, onAgentComplete }: Props): React.ReactElement | null {
  const [input, setInput] = useState("");
  const [history, setHistory] = useState<AgentMessage[]>([]);
  const [status, setStatus] = useState<Status>("idle");
  const [meta, setMeta] = useState<RunMeta>({ iterations: 0, totalCostUsd: 0, totalLatencyMs: 0 });
  const inputRef = useRef<HTMLTextAreaElement | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  // Focus the input when the palette opens; abort any in-flight request when it closes.
  useEffect(() => {
    if (open) {
      requestAnimationFrame(() => inputRef.current?.focus());
    } else {
      abortRef.current?.abort();
    }
  }, [open]);

  // Auto-scroll to the bottom as new tokens / tool calls land.
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [history, status]);

  const send = useCallback(
    async (userMessage: string): Promise<void> => {
      if (!userMessage.trim() || status === "thinking" || status === "streaming") return;

      // The API receives the prior conversation plus the new user turn.
      // The empty assistant placeholder we add to UI state below is
      // intentionally NOT sent to the API; it's purely a render target for
      // streaming token deltas as they arrive.
      const apiMessages = [
        ...history.map((m) => ({ role: m.role, content: m.text })),
        { role: "user" as const, content: userMessage },
      ];

      setHistory((prev) => [
        ...prev,
        { role: "user", text: userMessage },
        { role: "assistant", text: "", thinking: "", toolCalls: [] },
      ]);
      setInput("");
      setStatus("thinking");
      setMeta({ iterations: 0, totalCostUsd: 0, totalLatencyMs: 0 });

      const controller = new AbortController();
      abortRef.current = controller;

      try {
        const response = await fetch("/api/agent", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ messages: apiMessages }),
          signal: controller.signal,
        });

        if (!response.body) {
          setStatus("error");
          return;
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";

        // SSE parsing: each event ends with a blank line. Buffer partial reads.
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const events = buffer.split("\n\n");
          buffer = events.pop() ?? "";
          for (const raw of events) {
            const line = raw.split("\n").find((l) => l.startsWith("data: "));
            if (!line) continue;
            const payload = JSON.parse(line.slice(6)) as RunEvent;
            handleEvent(payload, setHistory, setStatus, setMeta);
          }
        }
      } catch (err) {
        if (err instanceof Error && err.name !== "AbortError") {
          setStatus("error");
          setMeta((m) => ({ ...m, errorMessage: err.message }));
        }
      } finally {
        abortRef.current = null;
        onAgentComplete();
      }
    },
    [history, status, onAgentComplete],
  );

  const onKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>): void => {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
        return;
      }
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        void send(input);
      }
    },
    [input, send, onClose],
  );

  const isBusy = status === "thinking" || status === "streaming";

  if (!open) return null;

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-40 bg-black/70 backdrop-blur-sm animate-fade-in"
        onClick={onClose}
        aria-hidden
      />

      {/* Panel */}
      <div className="fixed inset-x-0 top-[10vh] z-50 flex justify-center px-4 pointer-events-none">
        <div className="w-full max-w-2xl pointer-events-auto bg-bg-surface border border-border-default rounded-xl shadow-2xl shadow-black/60 overflow-hidden ring-inner animate-slide-up">
          {/* Top: agent header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-border-subtle">
            <div className="flex items-center gap-2.5">
              <div className="w-6 h-6 rounded bg-accent/15 border border-accent/30 flex items-center justify-center">
                <SparkIcon className="text-accent" size={11} />
              </div>
              <div className="flex flex-col leading-tight">
                <span className="text-text-primary text-sm font-medium">Stratus</span>
                <span className="text-text-tertiary text-2xs font-mono tabular">
                  claude-opus-4-7 · adaptive thinking · effort: high
                </span>
              </div>
            </div>
            <button
              onClick={onClose}
              className="text-text-tertiary hover:text-text-primary transition-colors p-1"
              aria-label="Close"
            >
              <CloseIcon size={16} />
            </button>
          </div>

          {/* Conversation */}
          <div ref={scrollRef} className="max-h-[55vh] overflow-y-auto">
            {history.length === 0 ? (
              <EmptyState onPick={(s) => void send(s)} />
            ) : (
              <div className="px-4 py-3 space-y-4">
                {history.map((msg, i) => (
                  <MessageBlock key={i} message={msg} isLast={i === history.length - 1} status={status} />
                ))}
              </div>
            )}
          </div>

          {/* Input */}
          <div className="border-t border-border-subtle px-4 py-3 bg-bg-elevated/30">
            <div className="flex items-end gap-2">
              <textarea
                ref={inputRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={onKeyDown}
                placeholder={isBusy ? "Agent is working…" : "Ask Stratus to do anything in your workspace"}
                disabled={isBusy}
                rows={1}
                className="flex-1 bg-transparent text-text-primary placeholder:text-text-tertiary text-sm resize-none focus:outline-none disabled:opacity-50 leading-relaxed py-1"
              />
              <button
                onClick={() => void send(input)}
                disabled={!input.trim() || isBusy}
                className="shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-accent text-accent-fg text-xs font-medium disabled:bg-border-default disabled:text-text-tertiary disabled:cursor-not-allowed hover:bg-accent-hover transition-colors"
              >
                <span>Send</span>
                <ArrowReturnIcon size={11} />
              </button>
            </div>

            {/* Footer meta */}
            <Footer status={status} meta={meta} />
          </div>
        </div>
      </div>
    </>
  );
}

function handleEvent(
  event: RunEvent,
  setHistory: React.Dispatch<React.SetStateAction<AgentMessage[]>>,
  setStatus: React.Dispatch<React.SetStateAction<Status>>,
  setMeta: React.Dispatch<React.SetStateAction<RunMeta>>,
): void {
  switch (event.type) {
    case "request_start":
      setMeta((m) => ({ ...m, model: event.model }));
      setStatus("thinking");
      return;
    case "thinking_delta":
      setHistory((h) => mutateLast(h, (msg) => ({ ...msg, thinking: (msg.thinking ?? "") + event.delta })));
      setStatus("thinking");
      return;
    case "text_delta":
      setHistory((h) => mutateLast(h, (msg) => ({ ...msg, text: msg.text + event.delta })));
      setStatus("streaming");
      return;
    case "tool_call_start":
      setHistory((h) =>
        mutateLast(h, (msg) => ({
          ...msg,
          toolCalls: [...(msg.toolCalls ?? []), { id: event.id, name: event.name, input: event.input }],
        })),
      );
      setStatus("thinking");
      return;
    case "tool_call_result":
      setHistory((h) =>
        mutateLast(h, (msg) => ({
          ...msg,
          toolCalls: (msg.toolCalls ?? []).map((c) =>
            c.id === event.id
              ? { ...c, result: { isError: event.isError, content: event.content, latencyMs: event.latencyMs } }
              : c,
          ),
        })),
      );
      return;
    case "iteration_complete":
      setMeta((m) => ({ ...m, iterations: event.iteration, totalCostUsd: event.cumulativeCostUsd }));
      return;
    case "done":
      setMeta((m) => ({
        ...m,
        iterations: event.iterations,
        totalCostUsd: event.totalCostUsd,
        totalLatencyMs: event.totalLatencyMs,
      }));
      setStatus("done");
      return;
    case "blocked":
      setMeta((m) => ({ ...m, blockedReason: event.reason }));
      setStatus("blocked");
      return;
    case "error":
      setMeta((m) => ({ ...m, errorMessage: event.message }));
      setStatus("error");
      return;
  }
}

function mutateLast(history: AgentMessage[], mutator: (m: AgentMessage) => AgentMessage): AgentMessage[] {
  if (history.length === 0) return history;
  const next = history.slice();
  const last = next[next.length - 1]!;
  next[next.length - 1] = mutator(last);
  return next;
}

interface MessageBlockProps {
  readonly message: AgentMessage;
  readonly isLast: boolean;
  readonly status: Status;
}

function MessageBlock({ message, isLast, status }: MessageBlockProps): React.ReactElement {
  if (message.role === "user") {
    return (
      <div className="flex gap-3">
        <div className="w-6 h-6 rounded-full bg-bg-overlay border border-border-default flex items-center justify-center text-text-secondary text-2xs font-medium shrink-0">
          You
        </div>
        <div className="text-text-primary text-sm leading-relaxed pt-0.5">{message.text}</div>
      </div>
    );
  }

  const isStreaming = isLast && (status === "streaming" || status === "thinking");
  const showCursor = isLast && status === "streaming" && message.text.length > 0;

  return (
    <div className="flex gap-3">
      <div className="w-6 h-6 rounded bg-accent/15 border border-accent/30 flex items-center justify-center shrink-0">
        <SparkIcon className="text-accent" size={11} />
      </div>
      <div className="flex-1 min-w-0 space-y-2.5 pt-0.5">
        {message.toolCalls && message.toolCalls.length > 0 && (
          <div className="space-y-1.5">
            {message.toolCalls.map((tc) => (
              <ToolCallChip key={tc.id} call={tc} />
            ))}
          </div>
        )}

        {isStreaming && message.text.length === 0 && message.toolCalls?.length === 0 && (
          <ThinkingIndicator />
        )}

        {message.text.length > 0 && (
          <div className="text-text-primary text-sm leading-relaxed whitespace-pre-wrap">
            {renderInlineCode(message.text)}
            {showCursor && <span className="cursor-blink" aria-hidden />}
          </div>
        )}
      </div>
    </div>
  );
}

function ThinkingIndicator(): React.ReactElement {
  return (
    <div className="flex items-center gap-2 text-text-tertiary text-xs">
      <span className="thinking-dot" />
      <span>Thinking…</span>
    </div>
  );
}

function ToolCallChip({ call }: { readonly call: ToolCall }): React.ReactElement {
  const inputPreview = useMemo(() => formatToolInput(call.input), [call.input]);
  const isPending = !call.result;
  const isError = call.result?.isError ?? false;

  return (
    <div
      className={`border rounded-md text-2xs font-mono tabular overflow-hidden ${
        isError
          ? "border-signal-red/30 bg-signal-red/5"
          : isPending
          ? "border-accent/30 bg-accent/5"
          : "border-border-subtle bg-bg-elevated/50"
      }`}
    >
      <div className="flex items-center gap-2 px-2.5 py-1.5">
        <ToolIcon className={isError ? "text-signal-red" : isPending ? "text-accent" : "text-text-tertiary"} size={11} />
        <span className={isError ? "text-signal-red" : isPending ? "text-accent" : "text-text-secondary"}>
          {call.name}
        </span>
        {inputPreview && (
          <>
            <span className="text-text-dim">·</span>
            <span className="text-text-tertiary truncate">{inputPreview}</span>
          </>
        )}
        <span className="ml-auto text-text-dim">
          {isPending ? "…" : isError ? "✗" : `${call.result?.latencyMs}ms`}
        </span>
      </div>
    </div>
  );
}

function formatToolInput(input: unknown): string {
  if (input === null || input === undefined) return "";
  if (typeof input !== "object") return String(input);
  const entries = Object.entries(input as Record<string, unknown>);
  if (entries.length === 0) return "";
  return entries
    .map(([k, v]) => `${k}=${typeof v === "string" ? `"${v}"` : JSON.stringify(v)}`)
    .join(", ");
}

/**
 * Light-touch inline code rendering: anything in backticks gets monospace
 * styling. Avoids pulling in a full markdown renderer.
 */
function renderInlineCode(text: string): React.ReactNode[] {
  const parts: React.ReactNode[] = [];
  const regex = /`([^`]+)`/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIndex) parts.push(text.slice(lastIndex, match.index));
    parts.push(
      <code key={match.index} className="font-mono text-2xs px-1 py-0.5 rounded bg-bg-overlay text-accent border border-border-subtle tabular">
        {match[1]}
      </code>,
    );
    lastIndex = regex.lastIndex;
  }
  if (lastIndex < text.length) parts.push(text.slice(lastIndex));
  return parts;
}

function EmptyState({ onPick }: { readonly onPick: (s: string) => void }): React.ReactElement {
  return (
    <div className="px-4 py-6 space-y-4">
      <div className="text-text-tertiary text-xs uppercase tracking-widest">Try one of these</div>
      <div className="space-y-1.5">
        {SUGGESTIONS.map((s) => (
          <button
            key={s}
            onClick={() => onPick(s)}
            className="w-full text-left px-3 py-2 rounded-md border border-border-subtle hover:border-accent/40 bg-bg-elevated/30 hover:bg-bg-elevated transition-colors text-text-secondary hover:text-text-primary text-sm flex items-center gap-2 group"
          >
            <ArrowReturnIcon className="text-text-dim group-hover:text-accent rotate-180" size={11} />
            <span className="flex-1">{s}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

function Footer({ status, meta }: { readonly status: Status; readonly meta: RunMeta }): React.ReactElement {
  return (
    <div className="mt-2 flex items-center justify-between text-2xs text-text-tertiary font-mono tabular">
      <div className="flex items-center gap-3">
        <StatusIndicator status={status} />
        {meta.blockedReason && (
          <span className="text-signal-red">blocked: {meta.blockedReason.slice(0, 80)}</span>
        )}
        {meta.errorMessage && (
          <span className="text-signal-red">error: {meta.errorMessage.slice(0, 80)}</span>
        )}
      </div>
      <div className="flex items-center gap-2.5">
        <span
          className="px-1.5 py-0.5 rounded border border-border-default text-text-dim uppercase tracking-widest leading-none"
          style={{ fontSize: "9px" }}
          title="Dev overlay: visible in this demo only. In production, hide this and consume the server-side structured telemetry (lib/agent/telemetry.ts) via your monitoring pipe."
        >
          dev
        </span>
        {meta.iterations > 0 && (
          <span>
            <span className="text-text-dim">iter</span> {meta.iterations}
          </span>
        )}
        {meta.totalCostUsd > 0 && (
          <span>
            <span className="text-text-dim">$</span>
            {meta.totalCostUsd.toFixed(4)}
          </span>
        )}
        {meta.totalLatencyMs > 0 && (
          <span>
            <span className="text-text-dim">latency</span> {meta.totalLatencyMs}ms
          </span>
        )}
      </div>
    </div>
  );
}

function StatusIndicator({ status }: { readonly status: Status }): React.ReactElement {
  const { dot, label } = {
    idle: { dot: "bg-text-dim", label: "ready" },
    thinking: { dot: "bg-accent animate-pulse-soft", label: "thinking" },
    streaming: { dot: "bg-accent animate-pulse-soft", label: "streaming" },
    done: { dot: "bg-signal-green", label: "done" },
    blocked: { dot: "bg-signal-red", label: "blocked" },
    error: { dot: "bg-signal-red", label: "error" },
  }[status];
  return (
    <span className="flex items-center gap-1.5">
      <span className={`w-1.5 h-1.5 rounded-full ${dot}`} />
      <span>{label}</span>
    </span>
  );
}
