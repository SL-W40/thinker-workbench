/**
 * 核心导出：id / 校验 / 文本工具 / 预览截断，以及 ThinkerApi 这一内联 API 面。
 * 由 shared/src/index.ts 拆分而来：导出面与拆分前完全一致。
 */

import type { ThinkerAgentsApi } from "../ipc/agents";

import type { ThinkerBrowserApi } from "../ipc/browser";
import type { ThinkerCheckpointsApi } from "../ipc/checkpoints";
import type {
  AgentCancelCommand,
  AgentCancelTaskCommand,
  AgentResumeCommand,
  AgentRunCommand,
} from "../ipc/commands";
import type { ContextUsageRequest, ContextUsageSnapshot } from "../ipc/contextUsage";
import type { AgentEvent } from "../ipc/events";
import type { ThinkerGitApi } from "../ipc/git";
import type { HitlResponse } from "../ipc/hitl";
import type { LogRecord } from "../ipc/log";
import type { ThinkerMcpApi } from "../ipc/mcp";
import type { ThinkerRulesApi } from "../ipc/rules";
import type { ThinkerSessionApi } from "../ipc/session";
import type { ThinkerSettingsApi } from "../ipc/settings";
import type { ThinkerSkillsApi } from "../ipc/skills";
import type { ThinkerTerminalApi } from "../ipc/terminal";
import type { ThinkerToolsApi } from "../ipc/tools";
import type { ThinkerTraceApi } from "../ipc/trace";
import type { ThinkerUpdateApi } from "../ipc/update";
import type { ThinkerWindowApi } from "../ipc/window";
import type { ThinkerWorkspaceFsApi } from "../ipc/workspaceFs";

import type { ThinkerWorkspacesApi, ThreadMeta } from "../ipc/workspaces";

import type { RunResult } from "../protocol/result";

export { escapeHtml } from "../escapeHtml";
export { estimateTokens } from "../estimateTokens";
export { parseYamlFrontmatter, parseYamlObject, type YamlFrontmatter } from "../frontmatter";
export {
  createId,
  createRunId,
  createSessionId,
  createSpanId,
  createThreadId,
  createTraceId,
  createWorkspaceId,
} from "../ids";
export {
  PREVIEW_BODY_CHARS,
  PREVIEW_TOOL_CHARS,
  withJsonPreview,
  withTextPreview,
} from "../preview";
export {
  isCancelErrorMessage,
  isRetryableHttpStatus,
  isTransientNetworkError,
  NETWORK_ERROR_PATTERN,
  OPENAI_AUTH_HTTP_PATTERN,
  OPENAI_TRANSIENT_HTTP_PATTERN,
  RETRYABLE_HTTP_STATUSES,
} from "../runErrors";
export { stripAnsi } from "../stripAnsi";

export {
  asArray,
  asBoolean,
  asNumber,
  asRecord,
  asString,
  asStringArray,
  isRecord,
  parseJsonObject,
} from "../validate";

export type ThinkerApi = {
  /** 发起运行；可传完整命令或仅用户消息字符串。 */
  run(command: AgentRunCommand | string): Promise<RunResult>;
  /**
   * 取消运行。
   * 可传 runId 字符串，或 `{ runId?, sessionId? }`（至少一个）；由主进程账本解析。
   */
  cancel(
    command?: string | AgentCancelCommand,
  ): Promise<{ ok: boolean; error?: string } | undefined>;
  /** 取消单个后台 Task（不停止父 run）。 */
  cancelTask?(command: AgentCancelTaskCommand): Promise<{ ok: boolean; error?: string }>;
  /** 从 checkpoint 恢复（崩溃后续跑）。 */
  resume?(command: AgentResumeCommand): Promise<RunResult>;
  /** 估算当前会话上下文占用（与模型请求同源组装）。 */
  getContextUsage?(request?: ContextUsageRequest): Promise<ContextUsageSnapshot>;
  /** 列出侧栏会话（SQLite `ThreadMeta`）。 */
  listThreads?(): Promise<ThreadMeta[]>;
  /**
   * 订阅 AgentEvent 推送。
   * @returns 取消订阅函数。
   */
  onEvent(cb: (event: AgentEvent) => void): () => void;
  /**
   * 订阅跨进程日志（可选）。
   * @returns 取消订阅函数。
   */
  onLog?(cb: (record: LogRecord) => void): () => void;
  /** 将 renderer 侧 LogRecord 交给主进程写入 `app.log`（fire-and-forget）。 */
  reportLog?(record: LogRecord): void;
  /** 模型 / 通用 / 快捷键设置（可选）。 */
  settings?: ThinkerSettingsApi;
  /** UI 会话快照（可选）。 */
  session?: ThinkerSessionApi;
  /** 窗口控制（可选）。 */
  window?: ThinkerWindowApi;
  /** Logs 数据面（产品工具窗）。 */
  tools?: ThinkerToolsApi;
  /** 工作空间 / 聊天会话持久化。 */
  workspaces?: ThinkerWorkspacesApi;
  /** 工作空间文件树 / 读写 / Git（右侧栏）。 */
  workspaceFs?: ThinkerWorkspaceFsApi;
  /** 终端 PTY（右侧栏 Terminal）。 */
  terminal?: ThinkerTerminalApi;
  /** 内置浏览器（右侧栏 Browser）。 */
  browser?: ThinkerBrowserApi;
  /** Skills 目录列表（Composer `/` + Customize）。 */
  skills?: ThinkerSkillsApi;
  /** Rules Customize。 */
  rules?: ThinkerRulesApi;
  /** Subagents Customize。 */
  agents?: ThinkerAgentsApi;
  /** 会话 Trace 数据面。 */
  trace?: ThinkerTraceApi;
  /** MCP 服务端管理。 */
  mcp?: ThinkerMcpApi;
  /** 答复 HITL（审批 / 澄清等）。 */
  respondHitl?(response: HitlResponse): Promise<void>;
  /** Git 写操作（只读检视在 `workspaceFs`）。 */
  git?: ThinkerGitApi;
  /** Checkpoint 保留策略与变更处置。 */
  checkpoints?: ThinkerCheckpointsApi;
  /** 桌面自动更新（dev 构建不可用）。 */
  update?: ThinkerUpdateApi;
};
export type { DataKind, DataLayoutKey } from "../dataLayout";
export { chatImageAllowed, DEFAULT_WORKSPACE_ID, dataPath, listDataEntries } from "../dataLayout";
