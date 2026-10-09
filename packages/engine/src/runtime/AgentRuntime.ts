/**
 * Agent 运行时：持有图、线程库、checkpoint，并驱动「节点 → 边 → 下一节点」循环。
 *
 * 支持进程崩溃后从 checkpoint resume 续跑；checkpoint 优先 FileCheckpointer。
 */
import { PREVIEW_BODY_CHARS, withTextPreview } from "@thinker-workbench/logger";
import { withLogContextAsync } from "@thinker-workbench/logger/node";
import {
  type AgentEvent,
  type AgentResumeCommand,
  createRunId,
  createThreadId,
  createTraceId,
} from "@thinker-workbench/shared";
import { FileCheckpointer } from "../checkpoint/file";
import { MemoryCheckpointer } from "../checkpoint/memory";
import type { Checkpointer } from "../checkpoint/types";
import { buildGraph } from "../graph/buildGraph";
import { initialState } from "../graph/state";
import type { CompiledGraph, GraphState } from "../graph/types";
import { agentLog } from "../log/setup";
import { formatErrorMessage } from "../model/retry";
import { ThreadStore } from "../session/ThreadStore";
import { setWorkspaceRoot } from "../workspace";
import { EventBus } from "./EventBus";
import { RunController } from "./RunController";
import { bindRuntimeEmitter, withRunEmitter } from "./runEmit";
import type { AgentRuntimeOptions, RunRequest } from "./types";

export class AgentRuntime {
  /** 对外可订阅的 AgentEvent 总线。 */
  readonly events = new EventBus();
  /** 内存中的线程列表（桌面侧栏以 SQLite 为准；此处仅兼容）。 */
  readonly threads = new ThreadStore();
  private readonly checkpointer: Checkpointer;
  private readonly graph: CompiledGraph<GraphState>;
  /** 进行中的 run：runId → 取消控制器。 */
  private readonly active = new Map<string, RunController>();

  constructor(options: AgentRuntimeOptions = {}) {
    if (options.checkpointer) {
      this.checkpointer = options.checkpointer;
    } else if (options.checkpointDir) {
      this.checkpointer = new FileCheckpointer(options.checkpointDir);
    } else {
      this.checkpointer = new MemoryCheckpointer();
    }
    this.graph = options.graph ?? buildGraph();
  }

  /** 按更新时间倒序列出线程元数据。 */
  listThreads() {
    return this.threads.list();
  }

  /** 取消指定 run（若仍在 active 表中）。 */
  cancel(runId: string): void {
    this.active.get(runId)?.cancel();
  }

  /**
   * 解析 resume 应从哪个节点继续：
   * - tools 仍有 pending：进程可能死在 tools 执行中，重进 tools
   * - 否则：上一节点已完整落盘，沿边走到下一节点
   */
  private resolveResumeNodeId(checkpoint: {
    nodeId: string;
    state: GraphState;
  }): string | null {
    const state = checkpoint.state;
    if (checkpoint.nodeId === "tools" && state.pendingToolCalls.length > 0) {
      return "tools";
    }
    const edge = this.graph.edges[checkpoint.nodeId] as
      | string
      | ((s: GraphState) => string | null)
      | undefined;
    if (edge === undefined) {
      throw new Error(`Missing edge for node: ${checkpoint.nodeId}`);
    }
    return typeof edge === "string" ? edge : edge(state);
  }

  /** 从 checkpoint 恢复：进程崩溃留下的中途快照沿边续跑。 */
  async resume(command: AgentResumeCommand & { runId?: string; traceId?: string }): Promise<void> {
    const threadId = command.threadId.trim();
    const runId = command.runId?.trim() || createRunId();
    const traceId = command.traceId?.trim() || createTraceId();
    const log = agentLog("runtime.resume");
    const ids = { traceId, runId, threadId };

    const checkpoint = await this.checkpointer.load(threadId);
    if (!checkpoint) {
      throw new Error("No checkpoint to resume.");
    }

    const state = checkpoint.state as GraphState;
    const startNodeId = this.resolveResumeNodeId({
      nodeId: checkpoint.nodeId,
      state,
    });
    if (!startNodeId) {
      const text = state.reply || state.message;
      await this.checkpointer.clear?.(threadId);
      this.emit({
        type: "done",
        threadId,
        runId,
        ts: Date.now(),
        text,
      });
      return;
    }

    const controller = new RunController(runId, threadId);
    this.active.set(runId, controller);

    try {
      const text = await withLogContextAsync({ source: "agent", traceId, threadId, runId }, () =>
        withRunEmitter(
          bindRuntimeEmitter((e) => this.emit(e), threadId, runId),
          async () => {
            log.info("start", {
              ...ids,
              meta: {
                fromNode: checkpoint.nodeId,
                startNode: startNodeId,
              },
            });
            return this.runLoop(state, startNodeId, {
              threadId,
              runId,
              controller,
              log,
              ids,
            });
          },
        ),
      );

      await this.checkpointer.clear?.(threadId);
      this.emit({
        type: "done",
        threadId,
        runId,
        ts: Date.now(),
        text,
      });
    } catch (err) {
      const error = formatErrorMessage(err);
      log.error("failed", { ...ids, meta: { error } });
      // 取消保留 checkpoint，供 UI「继续」/ Resume；其它失败仍清掉
      if (!/cancel/i.test(error)) {
        await this.checkpointer.clear?.(threadId);
      }
      this.emit({
        type: "error",
        threadId,
        runId,
        ts: Date.now(),
        error,
      });
    } finally {
      this.active.delete(runId);
    }
  }

  /**
   * 执行一轮用户消息：走完整图直到边返回 null。
   * 成功发 `done`；失败发 `error`。
   */
  async run(command: RunRequest): Promise<void> {
    const message = command.message.trim();
    const threadId = command.threadId?.trim() || createThreadId();
    const runId = command.runId?.trim() || createRunId();
    const traceId = command.traceId?.trim() || createTraceId();
    this.threads.ensure(threadId, message);
    const log = agentLog("runtime.run");
    const ids = { traceId, runId, threadId };

    if (!command.workspaceRoot?.trim()) {
      log.warn("missing workspaceRoot", ids);
      this.emit({
        type: "error",
        threadId,
        runId,
        ts: Date.now(),
        error: "No workspace root configured. Open a workspace before chatting.",
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
      });
      return;
    }

    if (!message) {
      log.warn("empty message", ids);
      this.emit({
        type: "error",
        threadId,
        runId,
        ts: Date.now(),
        error: "Message is empty.",
      });
      return;
    }

    // 新 send 前清旧 checkpoint
    await this.checkpointer.clear?.(threadId);

    const controller = new RunController(runId, threadId);
    this.active.set(runId, controller);

    try {
      const text = await withLogContextAsync({ source: "agent", traceId, threadId, runId }, () =>
        withRunEmitter(
          bindRuntimeEmitter((e) => this.emit(e), threadId, runId),
          async () => {
            const history = (command.history ?? [])
              .filter((m) => m.role === "user" || m.role === "assistant")
              .map((m) => ({ role: m.role, content: m.content }));
            log.info("start", {
              ...ids,
              meta: {
                ...withTextPreview(message, "message", PREVIEW_BODY_CHARS),
                historyTurns: history.length,
              },
            });
            const state = initialState(message, history, command.contextPaths);
            return this.runLoop(state, this.graph.start, {
              threadId,
              runId,
              controller,
              log,
              ids,
            });
          },
        ),
      );

      await this.checkpointer.clear?.(threadId);
      this.emit({
        type: "done",
        threadId,
        runId,
        ts: Date.now(),
        text,
      });
    } catch (err) {
      const error = formatErrorMessage(err);
      log.error("failed", { ...ids, meta: { error } });
      // 取消保留 checkpoint，供 UI「继续」/ Resume；其它失败仍清掉
      if (!/cancel/i.test(error)) {
        await this.checkpointer.clear?.(threadId);
      }
      this.emit({
        type: "error",
        threadId,
        runId,
        ts: Date.now(),
        error,
      });
    } finally {
      this.active.delete(runId);
    }
  }

  /** 从图节点循环执行直到结束。 */
  private async runLoop(
    initial: GraphState,
    startNodeId: string | null,
    ctx: {
      threadId: string;
      runId: string;
      controller: RunController;
      log: ReturnType<typeof agentLog>;
      ids: { traceId: string; runId: string; threadId: string };
    },
  ): Promise<string> {
    let state = initial;
    let nodeId: string | null = startNodeId;
    const { threadId, controller, log, ids } = ctx;

    while (nodeId) {
      if (controller.aborted) {
        throw new Error("Run cancelled.");
      }
      const node = this.graph.nodes[nodeId];
      if (!node) {
        throw new Error(`Unknown node: ${nodeId}`);
      }
      const current = nodeId;
      log.info("node enter", { ...ids, spanId: current, meta: { step: state.step } });
      const patch = await node(state, controller.signal);
      state = { ...state, ...patch };

      await this.checkpointer.save({
        threadId,
        nodeId: current,
        state,
        updatedAt: Date.now(),
      });

      const edge = this.graph.edges[current] as
        | string
        | ((s: GraphState) => string | null)
        | undefined;
      if (edge === undefined) {
        throw new Error(`Missing edge for node: ${current}`);
      }
      nodeId = typeof edge === "string" ? edge : edge(state);
      log.info("node exit", {
        ...ids,
        spanId: current,
        meta: { next: nodeId, pendingTools: state.pendingToolCalls.length },
      });
    }

    const reply = state.reply || state.message;
    log.info("complete", { ...ids, meta: withTextPreview(reply, "reply", PREVIEW_BODY_CHARS) });
    return reply;
  }

  private emit(event: AgentEvent): void {
    this.events.emit(event);
  }
}

/** 工厂：便于测试注入 options。 */
export function createAgentRuntime(options?: AgentRuntimeOptions): AgentRuntime {
  return new AgentRuntime(options);
}
