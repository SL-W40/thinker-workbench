/**
 * Agent 侧 IPC 宿主：监听主进程 `utility` 通道，驱动 AgentRuntime。
 * runtime 事件以 `kind: "event"`、日志以 `kind: "log"` 回推主进程。
 */
import {
  PREVIEW_BODY_CHARS,
  configureLog,
  configureLogPreview,
  withTextPreview,
} from "@thinker-workbench/logger";
import {
  emptyContextUsageSnapshot,
  type AiLocale,
  type McpServerConfig,
  type ModelCatalog,
  type ModelSelection,
  type ModelSettings,
  type UtilityCancel,
  type UtilityContextUsage,
  type UtilityHello,
  type UtilityResume,
  type UtilityRun,
  type UtilityToChild,
  type WorkspaceAccess,
} from "@thinker-workbench/shared";
import { setChatMode } from "../chatMode";
import { setDataDir } from "../config/dataDir";
import { assembleContext } from "../context/assembleContext";
import { rejectAllHitl, resolveHitl } from "../hitl/requestHitl";
import { agentLog, configureAgentLog } from "../log/setup";
import { getMcpManager } from "../mcp/McpManager";
import { configureAgentTrace } from "../trace/emit";
import {
  configureFromLegacyModel,
  configureModelCatalog,
} from "../model/catalog";
import {
  configureAiLocale,
  getAiLocale,
  getAllowEmoji,
  getContextWindow,
} from "../model/openai";
import type { ChatMessage } from "../model/types";
import { createAgentRuntime, type AgentRuntime } from "../runtime/AgentRuntime";
import { setSubagentDefinitions } from "../subagents/registry";
import { setAllowAiDeleteFiles, setWorkspaceAccess, setWorkspaceRoot } from "../workspace";
import { handleBrowserEvent } from "./browserClient";
import { handlePtyEvent } from "./ptyClient";
import { getParentPort, postToParent } from "./port";
import { applyShellConfig } from "./shellConfig";

export class UtilityHost {
  private runtime: AgentRuntime | null = null;
  private logReady = false;

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

  private ensureLog(enabled?: boolean): void {
    if (this.logReady) {
      if (typeof enabled === "boolean") configureLog({ enabled });
      return;
    }
    configureAgentLog({
      enabled,
      onRecord: (record) => {
        postToParent({ channel: "utility", kind: "log", record });
      },
    });
    this.logReady = true;
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
   * 应用本轮模型目录 / 选用 / 旧单字段回退，以及 AI 语言。
   * chatWithFailover 依赖 catalog；仅 configureChatModel 不够。
   */
  private applyConfig(options: {
    catalog?: ModelCatalog | null;
    selection?: ModelSelection | null;
    model?: ModelSettings | null;
    aiLocale?: AiLocale;
    route?: { userText?: string; contextPaths?: string[] };
  }): void {
    if (options.catalog || options.selection || options.route) {
      configureModelCatalog(options.catalog, options.selection, options.route);
    } else if (options.model) {
      configureFromLegacyModel(options.model);
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

  /** 同步桌面下发的日志策略（截断 + 总开关）。 */
  private applyLogPolicy(options: {
    truncateLongContent?: boolean;
    loggingEnabled?: boolean;
  }): void {
    if (typeof options.truncateLongContent === "boolean") {
      configureLogPreview({ truncateLongContent: options.truncateLongContent });
    }
    if (typeof options.loggingEnabled === "boolean") {
      configureLog({ enabled: options.loggingEnabled });
    }
  }

  private async onMessage(message: UtilityToChild): Promise<void> {
    if (!message || message.channel !== "utility") return;

    switch (message.kind) {
      case "hello":
        return this.onHello(message);
      case "run":
        return this.onRun(message);
      case "cancel":
        return this.onCancel(message);
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

  /** 同步 Trace 开关与本轮会话上下文。 */
  private applyTrace(message: {
    traceEnabled?: boolean;
    sessionId?: string;
    workspaceId?: string;
    sessionTitle?: string;
    runId?: string;
    threadId?: string;
    traceId?: string;
  }): void {
    configureAgentTrace({
      enabled: message.traceEnabled !== false,
      sessionId: message.sessionId?.trim() || undefined,
      workspaceId: message.workspaceId?.trim() || undefined,
      title: message.sessionTitle?.trim() || undefined,
      runId: message.runId?.trim() || undefined,
      threadId: message.threadId?.trim() || undefined,
      traceId: message.traceId?.trim() || undefined,
      nodeSpanId: undefined,
      parentSpanId: undefined,
    });
  }

  private onHello(message: UtilityHello): void {
    this.ensureLog(message.loggingEnabled);
    this.applyLogPolicy({
      truncateLongContent: message.logTruncateLongContent,
      loggingEnabled: message.loggingEnabled,
    });
    this.applyTrace({ traceEnabled: message.traceEnabled });
    agentLog("host").info("hello", {
      meta: {
        hasModel: Boolean(message.model?.apiKey),
        aiLocale: message.aiLocale ?? null,
        workspaceAccess: message.workspaceAccess ?? null,
        allowAiDeleteFiles: message.allowAiDeleteFiles ?? null,
        checkpointDir: message.checkpointDir ?? null,
        loggingEnabled: message.loggingEnabled ?? null,
        logTruncateLongContent: message.logTruncateLongContent ?? null,
        workspaceRoot: message.workspaceRoot ?? null,
        dataDir: message.dataDir ?? null,
        traceEnabled: message.traceEnabled ?? null,
      },
    });
    this.applyConfig({
      catalog: message.catalog,
      selection: message.selection,
      model: message.model,
      aiLocale: message.aiLocale,
    });
    this.applyWorkspaceAccess(message.workspaceAccess);
    this.applyAllowAiDeleteFiles(message.allowAiDeleteFiles);
    applyShellConfig(message);
    this.applyDataDir(message.dataDir);
    void this.applyMcpServers(message.mcpServers);
    if (message.subagents) setSubagentDefinitions(message.subagents);
    if (message.workspaceRoot) {
      try {
        setWorkspaceRoot(message.workspaceRoot);
      } catch (err) {
        agentLog("host").warn("workspaceRoot invalid", {
          meta: { error: err instanceof Error ? err.message : String(err) },
        });
      }
    }
    this.ensureRuntime(message.checkpointDir);
  }

  private async onRun(message: UtilityRun): Promise<void> {
    this.ensureLog(message.loggingEnabled);
    this.applyLogPolicy({
      truncateLongContent: message.logTruncateLongContent,
      loggingEnabled: message.loggingEnabled,
    });
    const traceId = message.traceId || message.command.traceId;
    const text = typeof message.command.message === "string" ? message.command.message : "";
    const workspaceRoot = message.workspaceRoot ?? message.command.workspaceRoot;
    const workspaceName = message.command.workspaceName;
    agentLog("host.run").info("accept", {
      traceId,
      runId: message.runId,
      threadId: message.threadId,
      meta: withTextPreview(text, "message", PREVIEW_BODY_CHARS),
    });
    this.applyConfig({
      catalog: message.catalog,
      selection: message.selection,
      model: message.model,
      aiLocale: message.aiLocale,
      route: {
        userText: text,
        contextPaths: message.command.contextPaths,
      },
    });
    setChatMode(message.chatMode);
    if (message.subagents) setSubagentDefinitions(message.subagents);
    this.applyWorkspaceAccess(message.workspaceAccess);
    this.applyAllowAiDeleteFiles(message.allowAiDeleteFiles);
    applyShellConfig(message);
    this.applyDataDir(message.dataDir);
    this.applyTrace({
      traceEnabled: message.traceEnabled,
      sessionId: message.sessionId,
      workspaceId: message.workspaceId,
      sessionTitle: message.sessionTitle,
      runId: message.runId,
      threadId: message.threadId,
      traceId,
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
        },
      });
      return;
    }
    try {
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
        },
      });
      return;
    }
    await this.ensureRuntime().run({
      runId: message.runId,
      threadId: message.threadId,
      traceId,
      message: text,
      history: message.command.history,
      workspaceRoot,
      workspaceName,
    });
  }

  private onCancel(message: UtilityCancel): void {
    agentLog("host").info("cancel", { runId: message.command.runId });
    rejectAllHitl("Run cancelled.");
    this.runtime?.cancel(message.command.runId);
  }

  private async onResume(message: UtilityResume): Promise<void> {
    this.ensureLog(message.loggingEnabled);
    this.applyLogPolicy({
      truncateLongContent: message.logTruncateLongContent,
      loggingEnabled: message.loggingEnabled,
    });
    const { runId } = message;
    const { threadId } = message.command;
    const traceId = message.command.traceId;
    agentLog("host").info("resume", { runId, threadId, traceId });
    try {
      this.applyConfig({
        catalog: message.catalog,
        selection: message.selection,
        model: message.model,
        aiLocale: message.aiLocale,
      });
      setChatMode(message.chatMode);
      if (message.subagents) setSubagentDefinitions(message.subagents);
      this.applyWorkspaceAccess(message.workspaceAccess);
      this.applyAllowAiDeleteFiles(message.allowAiDeleteFiles);
      applyShellConfig(message);
      this.applyDataDir(message.dataDir);
      this.applyTrace({
        traceEnabled: message.traceEnabled,
        sessionId: message.sessionId,
        workspaceId: message.workspaceId,
        sessionTitle: message.sessionTitle,
        runId: message.runId,
        threadId,
        traceId,
      });
      if (message.workspaceRoot) {
        setWorkspaceRoot(message.workspaceRoot, { name: message.command.workspaceName });
      }
      await this.ensureRuntime().resume({
        ...message.command,
        runId: message.runId,
      });
    } catch (err) {
      const error = err instanceof Error ? err.message : String(err);
      agentLog("host").error("resume failed", { runId, threadId, meta: { error } });
      postToParent({
        channel: "utility",
        kind: "event",
        event: { type: "error", threadId, runId, ts: Date.now(), error },
      });
    }
  }

  /** 与 assembleContext 同源估算上下文占用。 */
  private onContextUsage(message: UtilityContextUsage): void {
    this.applyConfig({
      catalog: message.catalog,
      selection: message.selection,
      model: message.model,
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
        contextWindow: message.model?.contextWindow ?? getContextWindow(),
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
    } catch (err) {
      agentLog("host").warn("contextUsage failed", {
        meta: { error: err instanceof Error ? err.message : String(err) },
      });
      postToParent({
        channel: "utility",
        kind: "contextUsageResult",
        requestId: message.requestId,
        usage: emptyContextUsageSnapshot(getContextWindow()),
      });
    }
  }
}
