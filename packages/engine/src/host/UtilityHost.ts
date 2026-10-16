/**
 * Agent 侧 IPC 宿主：监听主进程 `utility` 通道，驱动 AgentRuntime。
 * runtime 事件以 `kind: "event"` 回推主进程；Trace span 经 `kind: "span"` 上报。
 */
import {
  type AiLocale,
  emptyContextUsageSnapshot,
  type McpServerConfig,
  type ModelCatalog,
  type ModelSelection,
  type TraceSettings,
  type UtilityCancel,
  type UtilityCancelTask,
  type UtilityContextUsage,
  type UtilityHello,
  type UtilityResume,
  type UtilityRun,
  type UtilityToChild,
  type WorkspaceAccess,
} from "@thinker-workbench/shared";
import { setChatMode } from "../chatMode";
import { setDataDir } from "../config/dataDir";
import { configureRuntimeLimits } from "../config/runtimeLimits";
import { assembleContext } from "../context/assembleContext";
import { rejectHitlByRunId, resolveHitl } from "../hitl/requestHitl";
import { getMcpManager } from "../mcp/McpManager";
import { configureModelCatalog } from "../model/catalog";
import { configureHttpCompatibilityMode } from "../model/httpFetch";
import { configureAiLocale, getAiLocale, getAllowEmoji, getContextWindow } from "../model/openai";
import type { ChatMessage } from "../model/types";
import { type AgentRuntime, createAgentRuntime } from "../runtime/AgentRuntime";
import { buildRunContext } from "../runtime/buildRunContext";
import { bindRuntimeEmitter } from "../runtime/runEmit";
import { setSubagentDefinitions } from "../subagents/registry";
import { cancelBackgroundTasksByRunId, cancelOneBackgroundTask } from "../tools/task/execute";
import { configureAgentTrace } from "../trace/emit";
import { setAllowAiDeleteFiles, setWorkspaceAccess, setWorkspaceRoot } from "../workspace";
import { handleBrowserEvent } from "./browserClient";
import { getParentPort, postToParent } from "./port";
import { handlePtyEvent } from "./ptyClient";
import { applyShellConfig } from "./shellConfig";

export class UtilityHost {
  private runtime: AgentRuntime | null = null;

  /** 绑定 parentPort，并通知主进程本进程已就绪。 */
  start(): void {
    const port = getParentPort();
    if (!port) {
      throw new Error("Agent entry must run inside Electron utilityProcess.");
    }

    getMcpManager().setStatusListener((status) => {
      postToParent({ channel: "utility", kind: "mcpStatus", status });
    });

    port.on("message", (event) => {
      void this.onMessage(event.data as UtilityToChild);
    });

    process.once("exit", () => {
      void getMcpManager().stopAll();
    });

    postToParent({ channel: "utility", kind: "ready" });
  }

  /**
   * 懒创建唯一 AgentRuntime，并把事件总线接到 parentPort。
   * checkpointDir 仅在首次创建时生效。
   */
  private ensureRuntime(checkpointDir?: string): AgentRuntime {
    if (!this.runtime) {
      this.runtime = createAgentRuntime({ checkpointDir });
      this.runtime.events.subscribe((event) => {
        postToParent({ channel: "utility", kind: "event", event });
      });
    }
    return this.runtime;
  }

  /**
   * 应用本轮模型目录 / 选用，以及 AI 语言。
   * chatWithFailover 依赖 catalog；仅 configureChatModel 不够。
   */
  private applyConfig(options: {
    catalog?: ModelCatalog | null;
    selection?: ModelSelection | null;
    aiLocale?: AiLocale;
    route?: { userText?: string; contextPaths?: string[]; hasImages?: boolean };
  }): void {
    if (options.catalog || options.selection || options.route) {
      configureModelCatalog(options.catalog, options.selection, options.route);
    }
    if (options.aiLocale) configureAiLocale(options.aiLocale);
  }

  /** 应用工作区外访问档位（有字段才覆盖）。 */
  private applyWorkspaceAccess(access?: WorkspaceAccess): void {
    if (access) setWorkspaceAccess(access);
  }

  /** 应用是否允许 AI 删除文件（有布尔字段才覆盖）。 */
  private applyAllowAiDeleteFiles(value?: boolean): void {
    setAllowAiDeleteFiles(value);
  }

  /** 同步 Trace 采集开关。 */
  private applyTrace(raw?: TraceSettings): void {
    const enabled = raw?.enabled !== false;
    configureAgentTrace({ enabled });
    this.ensureRuntime().applyTrace({ enabled });
  }

  private async onMessage(message: UtilityToChild): Promise<void> {
    if (message?.channel !== "utility") return;

    switch (message.kind) {
      case "hello":
        return this.onHello(message);
      case "run":
        return this.onRun(message);
      case "cancel":
        return this.onCancel(message);
      case "cancelTask":
        return this.onCancelTask(message);
      case "resume":
        return this.onResume(message);
      case "contextUsage":
        return this.onContextUsage(message);
      case "ptyEvent":
        handlePtyEvent(message);
        return;
      case "browserEvent":
        handleBrowserEvent(message);
        return;
      case "hitlResult":
        resolveHitl(message.response);
        return;
      case "mcpReload":
        return this.applyMcpServers(message.mcpServers);
      default: {
        const _exhaustive: never = message;
        void _exhaustive;
        return;
      }
    }
  }

  /** 热更新 MCP 配置快照。 */
  private async applyMcpServers(servers?: McpServerConfig[]): Promise<void> {
    await getMcpManager().reload(servers ?? []);
  }

  /** 应用数据根（rules / skills）。 */
  private applyDataDir(dir?: string): void {
    if (typeof dir === "string") setDataDir(dir);
  }

  private onHello(message: UtilityHello): void {
    this.ensureRuntime(message.checkpointDir);
    this.applyTrace(message.trace);
    this.applyConfig({
      catalog: message.catalog,
      selection: message.selection,
      aiLocale: message.aiLocale,
    });
    this.applyWorkspaceAccess(message.workspaceAccess);
    this.applyAllowAiDeleteFiles(message.allowAiDeleteFiles);
    applyShellConfig(message);
    configureHttpCompatibilityMode(message.httpCompatibilityMode);
    configureRuntimeLimits(message);
    this.applyDataDir(message.dataDir);
    void this.applyMcpServers(message.mcpServers);
    if (message.subagents) setSubagentDefinitions(message.subagents);
    if (message.workspaceRoot) {
      try {
        setWorkspaceRoot(message.workspaceRoot);
      } catch {
        /* 无效根：等 run 时再报错给 UI */
      }
    }
  }

  private async onRun(message: UtilityRun): Promise<void> {
    const traceId = message.traceId || message.command.traceId;
    const text = typeof message.command.message === "string" ? message.command.message : "";
    const workspaceRoot = message.workspaceRoot ?? message.command.workspaceRoot;
    const workspaceName = message.command.workspaceName;
    const runImages = Array.isArray(message.command.images)
      ? message.command.images.filter((i) => i && typeof i.path === "string" && i.path.trim())
      : [];
    const historyHasImages = (message.command.history ?? []).some(
      (m) => m.role === "user" && Array.isArray(m.images) && m.images.length > 0,
    );
    this.applyConfig({
      catalog: message.catalog,
      selection: message.selection,
      aiLocale: message.aiLocale,
      route: {
        userText: text,
        contextPaths: message.command.contextPaths,
        hasImages: runImages.length > 0 || historyHasImages,
      },
    });
    setChatMode(message.chatMode);
    if (message.subagents) setSubagentDefinitions(message.subagents);
    this.applyWorkspaceAccess(message.workspaceAccess);
    this.applyAllowAiDeleteFiles(message.allowAiDeleteFiles);
    applyShellConfig(message);
    configureHttpCompatibilityMode(message.httpCompatibilityMode);
    configureRuntimeLimits(message);
    this.applyDataDir(message.dataDir);
    this.applyTrace(message.trace);
    configureAgentTrace({
      sessionId: message.sessionId,
      workspaceId: message.workspaceId,
      runId: message.runId,
      traceId: message.traceId,
      threadId: message.threadId,
      title: message.sessionTitle,
    });
    if (!workspaceRoot?.trim()) {
      postToParent({
        channel: "utility",
        kind: "event",
        event: {
          type: "error",
          threadId: message.threadId,
          runId: message.runId,
          ts: Date.now(),
          error: "No workspace root configured. Open a workspace before chatting.",
          code: "failed",
        },
      });
      return;
    }
    try {
      // 进程默认（无 ALS 路径）；本 run 以下方 RunContext 为准
      setWorkspaceRoot(workspaceRoot, { name: workspaceName });
    } catch (err) {
      const error = err instanceof Error ? err.message : String(err);
      postToParent({
        channel: "utility",
        kind: "event",
        event: {
          type: "error",
          threadId: message.threadId,
          runId: message.runId,
          ts: Date.now(),
          error,
          code: "failed",
          ...(message.sessionId ? { chatSessionId: message.sessionId } : {}),
        },
      });
      return;
    }
    const runtime = this.ensureRuntime();
    const emit = bindRuntimeEmitter(
      (e) => runtime.events.emit(e),
      message.threadId,
      message.runId,
      message.sessionId,
    );
    const runContext = buildRunContext({
      runId: message.runId,
      threadId: message.threadId,
      sessionId: message.sessionId,
      workspaceRoot,
      workspaceName,
      chatMode: message.chatMode,
      workspaceAccess: message.workspaceAccess,
      allowAiDeleteFiles: message.allowAiDeleteFiles,
      allowAiShell: message.allowAiShell,
      allowAiBrowser: message.allowAiBrowser,
      shellApprovalMode: message.shellApprovalMode,
      shellAllowlist: message.shellAllowlist,
      shellBlocklist: message.shellBlocklist,
      shell: message.shell,
      catalog: message.catalog,
      selection: message.selection,
      route: {
        userText: text,
        contextPaths: message.command.contextPaths,
        hasImages: runImages.length > 0 || historyHasImages,
      },
      emit,
    });
    await runtime.run({
      runId: message.runId,
      threadId: message.threadId,
      sessionId: message.sessionId,
      traceId,
      message: text,
      images: runImages.length > 0 ? runImages : undefined,
      history: message.command.history,
      contextPaths: message.command.contextPaths,
      workspaceRoot,
      workspaceName,
      runContext,
    });
  }

  private onCancel(message: UtilityCancel): void {
    const runId = message.command.runId?.trim() ?? "";
    if (!runId) return;
    // 仅作用本 run：勿 rejectAll / cancel 全部 Task
    rejectHitlByRunId(runId, "Run cancelled.");
    cancelBackgroundTasksByRunId(runId, "Cancelled.");
    this.runtime?.cancel(runId);
  }

  /** 取消单个后台 Task；不 abort 父 run。 */
  private onCancelTask(message: UtilityCancelTask): void {
    const taskId = message.command.taskId?.trim() ?? "";
    const runId = message.command.runId?.trim() || undefined;
    if (!taskId) return;
    cancelOneBackgroundTask(taskId, "Cancelled.", {
      expectedParentRunId: runId,
    });
  }

  private async onResume(message: UtilityResume): Promise<void> {
    const { runId } = message;
    const { threadId } = message.command;
    try {
      this.applyConfig({
        catalog: message.catalog,
        selection: message.selection,
        aiLocale: message.aiLocale,
      });
      setChatMode(message.chatMode);
      if (message.subagents) setSubagentDefinitions(message.subagents);
      this.applyWorkspaceAccess(message.workspaceAccess);
      this.applyAllowAiDeleteFiles(message.allowAiDeleteFiles);
      applyShellConfig(message);
      configureHttpCompatibilityMode(message.httpCompatibilityMode);
      configureRuntimeLimits(message);
      this.applyDataDir(message.dataDir);
      this.applyTrace(message.trace);
      configureAgentTrace({
        sessionId: message.sessionId,
        workspaceId: message.workspaceId,
        runId: message.runId,
        traceId: message.command.traceId,
        threadId: message.command.threadId,
        title: message.sessionTitle,
      });
      if (message.workspaceRoot) {
        setWorkspaceRoot(message.workspaceRoot, { name: message.command.workspaceName });
      }
      const runtime = this.ensureRuntime();
      const root = message.workspaceRoot?.trim() || "";
      const emit = bindRuntimeEmitter(
        (e) => runtime.events.emit(e),
        threadId,
        message.runId,
        message.sessionId,
      );
      const runContext = root
        ? buildRunContext({
            runId: message.runId,
            threadId,
            sessionId: message.sessionId,
            workspaceRoot: root,
            workspaceName: message.command.workspaceName,
            chatMode: message.chatMode,
            workspaceAccess: message.workspaceAccess,
            allowAiDeleteFiles: message.allowAiDeleteFiles,
            allowAiShell: message.allowAiShell,
            allowAiBrowser: message.allowAiBrowser,
            shellApprovalMode: message.shellApprovalMode,
            shellAllowlist: message.shellAllowlist,
            shellBlocklist: message.shellBlocklist,
            shell: message.shell,
            catalog: message.catalog,
            selection: message.selection,
            emit,
          })
        : undefined;
      await runtime.resume({
        ...message.command,
        sessionId: message.sessionId,
        runId: message.runId,
        ...(runContext ? { runContext } : {}),
      });
    } catch (err) {
      const error = err instanceof Error ? err.message : String(err);
      postToParent({
        channel: "utility",
        kind: "event",
        event: {
          type: "error",
          threadId,
          runId,
          ts: Date.now(),
          error,
          code: "failed",
          ...(message.sessionId ? { chatSessionId: message.sessionId } : {}),
        },
      });
    }
  }

  /** 与 assembleContext 同源估算上下文占用。 */
  private onContextUsage(message: UtilityContextUsage): void {
    this.applyConfig({
      catalog: message.catalog,
      selection: message.selection,
      aiLocale: message.aiLocale,
    });
    this.applyWorkspaceAccess(message.workspaceAccess);
    this.applyAllowAiDeleteFiles(message.allowAiDeleteFiles);
    this.applyDataDir(message.dataDir);
    const workspaceRoot = message.workspaceRoot ?? message.request.workspaceRoot;
    if (workspaceRoot?.trim()) {
      try {
        setWorkspaceRoot(workspaceRoot);
      } catch {
        /* 预览时根无效则继续用已配置根 */
      }
    }

    const messages: ChatMessage[] = (message.request.messages ?? []).map((m) => ({
      role: m.role,
      content: m.content,
    }));

    try {
      const ctx = assembleContext({
        messages,
        aiLocale: message.aiLocale ?? getAiLocale(),
        allowEmoji: getAllowEmoji(),
        contextWindow: getContextWindow(),
        dataDir: message.dataDir,
        workspaceRoot: workspaceRoot ?? undefined,
        contextPaths: message.request.contextPaths,
      });
      postToParent({
        channel: "utility",
        kind: "contextUsageResult",
        requestId: message.requestId,
        usage: ctx.usage,
      });
    } catch {
      postToParent({
        channel: "utility",
        kind: "contextUsageResult",
        requestId: message.requestId,
        usage: emptyContextUsageSnapshot(getContextWindow()),
      });
    }
  }
}
