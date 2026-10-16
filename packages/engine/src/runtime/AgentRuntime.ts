/**
 * Agent 运行时：StateGraph + checkpointer，stream / resume / cancel。
 * 节点事件经 EventBus 出桥；会话列表仍由桌面 SQLite 管理。
 */

import { type BaseCheckpointSaver, MemorySaver } from "@langchain/langgraph";
import {
  type AgentEvent,
  type AgentResumeCommand,
  createRunId,
  createThreadId,
  type TraceSettings,
} from "@thinker-workbench/shared";
import { createSqliteCheckpointer } from "../checkpoint/sqlite";
import { buildGraph, type CompiledAgentGraph } from "../graph/buildGraph";
import { initialState, normalizeGraphState } from "../graph/state";
import type { GraphState } from "../graph/types";
import {
  cancelBackgroundTasksByRunId,
  seedFailedOrphanTasksFromState,
} from "../tools/task/execute";
import { configureAgentTrace } from "../trace/emit";
import { getWorkspaceRootOrNull, setWorkspaceRoot } from "../workspace";
import { buildRunContext } from "./buildRunContext";
import { EventBus } from "./EventBus";
import { RunController } from "./RunController";
import { getRunContext, type RunContext, runWithContext } from "./runContext";
import { bindRuntimeEmitter } from "./runEmit";
import { registerRun, unregisterRun } from "./runRegistry";
import { classifyTerminalError, shouldKeepCheckpoint } from "./terminalOutcome";
import type { AgentRuntimeOptions, RunRequest } from "./types";

export class AgentRuntime {
  readonly events = new EventBus();
  private graph: CompiledAgentGraph | null = null;
  private checkpointer: BaseCheckpointSaver = new MemorySaver();
  private readonly checkpointDir?: string;
  private ready: Promise<void>;
  private readonly active = new Map<string, RunController>();
  constructor(options: AgentRuntimeOptions = {}) {
    this.checkpointDir = options.checkpointDir;
    if (options.checkpointer) {
      this.checkpointer = options.checkpointer;
      this.graph = options.graph ?? buildGraph(this.checkpointer);
      this.ready = Promise.resolve();
    } else if (options.checkpointDir) {
      this.ready = createSqliteCheckpointer(options.checkpointDir).then((cp) => {
        this.checkpointer = cp;
        this.graph = buildGraph(cp);
      });
    } else {
      this.graph = options.graph ?? buildGraph(this.checkpointer);
      this.ready = Promise.resolve();
    }
  }

  private async ensureGraph(): Promise<CompiledAgentGraph> {
    await this.ready;
    if (!this.graph) this.graph = buildGraph(this.checkpointer);
    return this.graph;
  }

  /** 应用 Trace 采集开关（hello / run 时由 UtilityHost 调用）。 */
  applyTrace(settings: TraceSettings | null): void {
    configureAgentTrace({ enabled: settings?.enabled !== false });
  }

  cancel(runId: string): void {
    this.active.get(runId)?.cancel();
  }

  async resume(
    command: AgentResumeCommand & {
      runId?: string;
      traceId?: string;
      runContext?: RunContext;
    },
  ): Promise<void> {
    const graph = await this.ensureGraph();
    const threadId = command.threadId.trim();
    const runId = command.runId?.trim() || createRunId();
    const config = { configurable: { thread_id: threadId } };

    const snapshot = await graph.getState(config);
    if (!snapshot || snapshot.values == null) {
      throw new Error("No checkpoint to resume.");
    }

    const state = normalizeGraphState(snapshot.values as GraphState);
    const sessionId = command.sessionId?.trim() || undefined;

    // 无可执行 next → 直接 done
    if (!snapshot.next?.length) {
      const text = state.reply || state.message;
      this.emit({
        type: "done",
        threadId,
        runId,
        ts: Date.now(),
        text,
        ...(sessionId ? { chatSessionId: sessionId } : {}),
      });
      return;
    }

    const controller = new RunController(runId, threadId);
    this.active.set(runId, controller);
    const emit = bindRuntimeEmitter((e) => this.emit(e), threadId, runId, sessionId);
    const runCtx =
      command.runContext ??
      buildRunContext({
        runId,
        threadId,
        sessionId,
        workspaceRoot: getWorkspaceRootOrNull() ?? "",
        emit,
      });
    if (!runCtx.workspaceRoot.trim()) {
      this.emit({
        type: "error",
        threadId,
        runId,
        ts: Date.now(),
        error: "No workspace root configured. Open a workspace before chatting.",
        code: "failed",
        ...(sessionId ? { chatSessionId: sessionId } : {}),
      });
      this.active.delete(runId);
      return;
    }
    runCtx.emit = emit;
    registerRun({ context: runCtx, controller });
    seedFailedOrphanTasksFromState(state, runId);

    try {
      const text = await runWithContext(runCtx, async () => {
        return this.streamLoop(graph, null, {
          threadId,
          runId,
          controller,
          resume: true,
        });
      });

      this.emit({
        type: "done",
        threadId,
        runId,
        ts: Date.now(),
        text,
        ...(sessionId ? { chatSessionId: sessionId } : {}),
      });
    } catch (err) {
      const { code, error } = classifyTerminalError(err);
      this.emit({
        type: "error",
        threadId,
        runId,
        ts: Date.now(),
        error,
        code,
        ...(sessionId ? { chatSessionId: sessionId } : {}),
      });
      cancelBackgroundTasksByRunId(runId, "Parent run ended.");
    } finally {
      this.active.delete(runId);
      unregisterRun(runId);
    }
  }

  async run(command: RunRequest): Promise<void> {
    const graph = await this.ensureGraph();
    const message = command.message.trim();
    const images = Array.isArray(command.images)
      ? command.images.filter((i) => i && typeof i.path === "string" && i.path.trim())
      : [];
    const hasImages = images.length > 0;
    const threadId = command.threadId?.trim() || createThreadId();
    const runId = command.runId?.trim() || createRunId();

    if (!command.workspaceRoot?.trim()) {
      this.emit({
        type: "error",
        threadId,
        runId,
        ts: Date.now(),
        error: "No workspace root configured. Open a workspace before chatting.",
        code: "failed",
      });
      return;
    }
    try {
      setWorkspaceRoot(command.workspaceRoot, { name: command.workspaceName });
    } catch (err) {
      const error = err instanceof Error ? err.message : String(err);
      this.emit({
        type: "error",
        threadId,
        runId,
        ts: Date.now(),
        error,
        code: "failed",
        ...(command.sessionId ? { chatSessionId: command.sessionId } : {}),
      });
      return;
    }

    if (!message && !hasImages) {
      this.emit({
        type: "error",
        threadId,
        runId,
        ts: Date.now(),
        error: "Message is empty.",
        code: "failed",
        ...(command.sessionId ? { chatSessionId: command.sessionId } : {}),
      });
      return;
    }

    const historyHasImages = (command.history ?? []).some(
      (m) => m.role === "user" && Array.isArray(m.images) && m.images.length > 0,
    );
    const routeHasImages = hasImages || historyHasImages;

    const controller = new RunController(runId, threadId);
    this.active.set(runId, controller);
    const sessionId = command.sessionId?.trim() || undefined;
    const emit = bindRuntimeEmitter((e) => this.emit(e), threadId, runId, sessionId);
    const runCtx =
      command.runContext ??
      buildRunContext({
        runId,
        threadId,
        sessionId,
        workspaceRoot: command.workspaceRoot.trim(),
        workspaceName: command.workspaceName,
        emit,
        route: {
          userText: message,
          contextPaths: command.contextPaths,
          hasImages: routeHasImages,
        },
      });
    if (routeHasImages) runCtx.routeContext.hasImages = true;
    runCtx.emit = emit;
    registerRun({ context: runCtx, controller });

    try {
      const text = await runWithContext(runCtx, async () => {
        const history = (command.history ?? [])
          .filter((m) => m.role === "user" || m.role === "assistant")
          .map((m) => ({
            role: m.role,
            content: m.content,
            ...(m.role === "user" && Array.isArray(m.images) && m.images.length
              ? { images: m.images }
              : {}),
          }));
        const state = initialState(message, history, command.contextPaths, images);
        return this.streamLoop(graph, state, {
          threadId,
          runId,
          controller,
          resume: false,
        });
      });

      this.emit({
        type: "done",
        threadId,
        runId,
        ts: Date.now(),
        text,
        ...(sessionId ? { chatSessionId: sessionId } : {}),
      });
    } catch (err) {
      const { code, error } = classifyTerminalError(err);
      if (!shouldKeepCheckpoint(code)) {
        // LangGraph：用空 update 无法 clear；留给下次同 thread 覆盖
        void code;
      }
      this.emit({
        type: "error",
        threadId,
        runId,
        ts: Date.now(),
        error,
        code,
        ...(sessionId ? { chatSessionId: sessionId } : {}),
      });
      cancelBackgroundTasksByRunId(runId, "Parent run ended.");
    } finally {
      this.active.delete(runId);
      unregisterRun(runId);
    }
  }

  /**
   * 驱动 StateGraph stream：updates 取 reply，custom 转发产品事件到 EventBus。
   */
  private async streamLoop(
    graph: CompiledAgentGraph,
    input: GraphState | null,
    ctx: {
      threadId: string;
      runId: string;
      controller: RunController;
      resume: boolean;
    },
  ): Promise<string> {
    const { threadId, controller, resume } = ctx;
    const runCtx = getRunContext();
    const config = {
      configurable: { thread_id: threadId },
      signal: controller.signal,
      streamMode: ["updates", "custom"] as Array<"updates" | "custom">,
    };

    // 进入前挂 markToolCallStarted：用 updateState 合并 startedToolCallIds
    if (runCtx) {
      runCtx.markToolCallStarted = async (callId: string) => {
        const id = callId.trim();
        if (!id) return;
        const snap = await graph.getState({ configurable: { thread_id: threadId } });
        const cur = normalizeGraphState((snap?.values ?? {}) as GraphState);
        if (cur.startedToolCallIds.includes(id)) return;
        await graph.updateState(
          { configurable: { thread_id: threadId } },
          { startedToolCallIds: [id] },
        );
      };
    }

    const stream = resume
      ? await graph.stream(null, config)
      : await graph.stream(input as GraphState, config);

    let lastReply = input?.reply ?? "";

    try {
      for await (const chunk of stream) {
        if (controller.aborted) throw new Error("Run cancelled.");
        if (!Array.isArray(chunk) || chunk.length < 2) continue;
        const [mode, data] = chunk as [string, unknown];
        if (mode === "custom") {
          if (data && typeof data === "object" && "type" in data) {
            this.emit(data as AgentEvent);
          }
          continue;
        }
        if (mode !== "updates" || !data || typeof data !== "object") continue;
        const nodes = data as Record<string, Partial<GraphState>>;
        for (const patch of Object.values(nodes)) {
          if (patch && typeof patch.reply === "string") lastReply = patch.reply;
        }
      }
    } finally {
      if (runCtx) runCtx.markToolCallStarted = undefined;
    }

    const finalSnap = await graph.getState({ configurable: { thread_id: threadId } });
    const finalState = normalizeGraphState(
      (finalSnap?.values ?? { reply: lastReply }) as GraphState,
    );
    return finalState.reply || finalState.message || lastReply;
  }

  private emit(event: AgentEvent): void {
    this.events.emit(event);
  }
}

export function createAgentRuntime(options?: AgentRuntimeOptions): AgentRuntime {
  return new AgentRuntime(options);
}
