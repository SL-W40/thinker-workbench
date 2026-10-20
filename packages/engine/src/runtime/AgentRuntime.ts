/**
 * Agent 运行时：StateGraph + checkpointer，stream / resume / cancel。
 * 节点事件经 EventBus 出桥；会话列表仍由桌面 SQLite 管理。
 */

import { type BaseCheckpointSaver, MemorySaver } from "@langchain/langgraph";
import {
  type AgentDoneEvent,
  type AgentErrorEvent,
  type AgentEvent,
  type AgentResumeCommand,
  createRunId,
  createThreadId,
  type TraceSettings,
} from "@thinker-workbench/shared";
import { createSqliteCheckpointer } from "../checkpoint/sqlite";
import { lookupRunKey, registerRunKey, runKeyFor } from "../checkpoint/threadsIndex";
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
import { clearThreadCheckpoints, releaseCheckpoint } from "./checkpoints";
import { EventBus } from "./EventBus";
import { RunController } from "./RunController";
import { createRunClock, type RunClock } from "./runClock";
import { type RunContext, runWithContext } from "./runContext";
import { bindRuntimeEmitter } from "./runEmit";
import { registerRun, unregisterRun } from "./runRegistry";
import { streamLoop } from "./streamLoop";
import { emitTerminal } from "./terminal";
import { classifyTerminalError, shouldKeepCheckpoint } from "./terminalOutcome";
import type { AgentRuntimeOptions, RunRequest } from "./types";
import type { RunUsageLedger } from "./usageLedger";

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
      /** 主进程排队时长（毫秒）；目前 resume 不走排队，预留透传。 */
      queuedMs?: number;
    },
  ): Promise<void> {
    const graph = await this.ensureGraph();
    const threadId = command.threadId.trim();
    const runId = command.runId?.trim() || createRunId();
    // 线程键为 run 级：从登记表找回被中断 run 的 runKey
    const threadKey = lookupRunKey(this.checkpointDir, threadId);
    if (!threadKey) throw new Error("No checkpoint to resume.");
    const config = { configurable: { thread_id: threadKey } };

    const snapshot = await graph.getState(config);
    if (!snapshot || snapshot.values == null) {
      throw new Error("No checkpoint to resume.");
    }

    const state = normalizeGraphState(snapshot.values as GraphState);
    const sessionId = command.sessionId?.trim() || undefined;

    // 无可执行 next → 直接 done（未执行任何工作，耗时未知，不下发 durationMs）。
    // 但若状态本身也是空的（如 MemorySaver 回退后进程重启 / checkpoint 丢失），
    // 说明根本没有可恢复的内容——必须报错而非下发空文本的 done（曾表现为「继续」按钮空转）。
    if (!snapshot.next?.length) {
      const hasContent = state.messages.length > 0 || !!state.reply || !!state.message;
      if (!hasContent) {
        throw new Error("No checkpoint to resume.");
      }
      const text = state.reply || state.message;
      this.emitTerminal(
        {
          type: "done",
          threadId,
          runId,
          ts: Date.now(),
          text,
          ...(sessionId ? { chatSessionId: sessionId } : {}),
        },
        null,
      );
      return;
    }

    const clock = createRunClock(command.queuedMs);
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
      this.emitTerminal(
        {
          type: "error",
          threadId,
          runId,
          ts: Date.now(),
          error: "No workspace root configured. Open a workspace before chatting.",
          code: "failed",
          ...(sessionId ? { chatSessionId: sessionId } : {}),
        },
        clock,
      );
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
          runKey: threadKey,
          controller,
          resume: true,
        });
      });

      this.emitTerminal(
        {
          type: "done",
          threadId,
          runId,
          ts: Date.now(),
          text,
          ...(sessionId ? { chatSessionId: sessionId } : {}),
        },
        clock,
        runCtx.usage,
      );
      // 恢复成功即收尾：清掉断点 checkpoint 与登记，不留可恢复残页
      this.releaseCheckpoint(threadKey, threadId);
    } catch (err) {
      const { code, error } = classifyTerminalError(err);
      this.emitTerminal(
        {
          type: "error",
          threadId,
          runId,
          ts: Date.now(),
          error,
          code,
          ...(sessionId ? { chatSessionId: sessionId } : {}),
        },
        clock,
        runCtx.usage,
      );
      // 取消 / 崩溃保留 checkpoint 供再次 resume；其余终态释放
      if (!shouldKeepCheckpoint(code)) this.releaseCheckpoint(threadKey, threadId);
      cancelBackgroundTasksByRunId(runId, "Parent run ended.");
    } finally {
      this.active.delete(runId);
      unregisterRun(runId);
    }
  }

  /**
   * run 结束后的 checkpoint 释放：deleteThread + 清登记。
   * best-effort：任何失败只记日志，不影响 run 终态。
   */
  private releaseCheckpoint(threadKey: string, threadId: string): void {
    releaseCheckpoint(this.checkpointer, this.checkpointDir, threadKey, threadId);
  }

  /**
   * 清理会话线程的全部 checkpoint（删会话时由 desktop 经 host 通道调用）。
   * 覆盖登记表中的 runKey；best-effort。
   */
  async clearThreadCheckpoints(threadId: string): Promise<void> {
    await clearThreadCheckpoints(this.checkpointer, this.checkpointDir, threadId);
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

    // 准入校验失败：run 从未进入执行阶段，耗时未知 → 不下发 durationMs（UI 展示「—」）
    if (!command.workspaceRoot?.trim()) {
      this.emitTerminal(
        {
          type: "error",
          threadId,
          runId,
          ts: Date.now(),
          error: "No workspace root configured. Open a workspace before chatting.",
          code: "failed",
          ...(command.sessionId ? { chatSessionId: command.sessionId } : {}),
        },
        null,
      );
      return;
    }
    try {
      setWorkspaceRoot(command.workspaceRoot, { name: command.workspaceName });
    } catch (err) {
      const error = err instanceof Error ? err.message : String(err);
      this.emitTerminal(
        {
          type: "error",
          threadId,
          runId,
          ts: Date.now(),
          error,
          code: "failed",
          ...(command.sessionId ? { chatSessionId: command.sessionId } : {}),
        },
        null,
      );
      return;
    }

    if (!message && !hasImages) {
      this.emitTerminal(
        {
          type: "error",
          threadId,
          runId,
          ts: Date.now(),
          error: "Message is empty.",
          code: "failed",
          ...(command.sessionId ? { chatSessionId: command.sessionId } : {}),
        },
        null,
      );
      return;
    }

    // 准入通过：起算本次 run 的墙钟（排队时长由主进程账本下发）
    const clock = createRunClock(command.queuedMs);

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
    // 本 run 由新用户消息发起：会话记忆注入走话题切换防护
    runCtx.freshUserTurn = true;
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
        const state = initialState(message, history, command.contextPaths, images, command.attachments);
        // 线程键为 run 级：历史以本 run 的 initialState（chat.db history）为单一来源，
        // append reducer 不再跨 run 累积；开工先登记，覆盖崩溃后 resume 定位
        const runKey = runKeyFor(threadId, runId);
        registerRunKey(this.checkpointDir, threadId, runKey);
        return this.streamLoop(graph, state, {
          threadId,
          runId,
          runKey,
          controller,
          resume: false,
        });
      });

      this.emitTerminal(
        {
          type: "done",
          threadId,
          runId,
          ts: Date.now(),
          text,
          ...(sessionId ? { chatSessionId: sessionId } : {}),
        },
        clock,
        runCtx.usage,
      );
      // 成功即收尾：清掉本 run checkpoint 与登记
      this.releaseCheckpoint(runKeyFor(threadId, runId), threadId);
    } catch (err) {
      const { code, error } = classifyTerminalError(err);
      // 取消 / 崩溃保留 checkpoint 供 resume；其余终态释放
      if (!shouldKeepCheckpoint(code)) {
        this.releaseCheckpoint(runKeyFor(threadId, runId), threadId);
      }
      this.emitTerminal(
        {
          type: "error",
          threadId,
          runId,
          ts: Date.now(),
          error,
          code,
          ...(sessionId ? { chatSessionId: sessionId } : {}),
        },
        clock,
        runCtx.usage,
      );
      cancelBackgroundTasksByRunId(runId, "Parent run ended.");
    } finally {
      this.active.delete(runId);
      unregisterRun(runId);
    }
  }

  /**
   * 驱动 StateGraph stream：updates 取 reply，custom 转发产品事件到 EventBus。
   * 执行步数预算 = 本 run 的 limits.maxAgentSteps，1:1 映射 LangGraph recursionLimit。
   */
  private streamLoop(
    graph: CompiledAgentGraph,
    input: GraphState | null,
    ctx: {
      threadId: string;
      runId: string;
      /** LangGraph 线程键（run 级 `threadId::run:runId`）；resume 时为被中断 run 的键。 */
      runKey: string;
      controller: RunController;
      resume: boolean;
    },
  ): Promise<string> {
    return streamLoop((e) => this.emit(e), graph, input, ctx);
  }

  /**
   * 终态事件（done / error）的唯一出口：耗时与用量在此统一结算并下发。
   */
  private emitTerminal(
    event: Omit<AgentDoneEvent, "durationMs" | "usage" | "usageEstimated">,
    clock: RunClock | null,
    ledger?: RunUsageLedger,
  ): void;
  private emitTerminal(
    event: Omit<AgentErrorEvent, "durationMs" | "usage" | "usageEstimated">,
    clock: RunClock | null,
    ledger?: RunUsageLedger,
  ): void;
  private emitTerminal(
    event: Record<string, unknown>,
    clock: RunClock | null,
    ledger?: RunUsageLedger,
  ): void {
    emitTerminal(
      (e) => this.emit(e),
      event as Omit<AgentDoneEvent, "durationMs" | "usage" | "usageEstimated">,
      clock,
      ledger,
    );
  }

  private emit(event: AgentEvent): void {
    this.events.emit(event);
  }
}

export function createAgentRuntime(options?: AgentRuntimeOptions): AgentRuntime {
  return new AgentRuntime(options);
}
