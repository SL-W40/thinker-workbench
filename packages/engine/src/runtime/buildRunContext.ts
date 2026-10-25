/**
 * 从 UtilityRun / UtilityResume 字段组装 RunContext（状态由 Handle 拥有）。
 */
import {
  type ChatMode,
  type ChatTodo,
  DEFAULT_CHAT_MODE,
  DEFAULT_SHELL_ALLOWLIST,
  DEFAULT_SHELL_APPROVAL_MODE,
  DEFAULT_WORKSPACE_ACCESS,
  type ModelCatalog,
  type ModelSelection,
  normalizeChatMode,
  normalizeShellAllowlist,
  normalizeShellApprovalMode,
  normalizeShellBlocklist,
  normalizeTodos,
  normalizeWorkspaceAccess,
  type ShellApprovalMode,
  type ShellProfile,
  shellAllowlistWithoutBlocked,
  type WorkspaceAccess,
} from "@thinker-workbench/shared";
import { type RuntimeLimits, resolveRuntimeLimits } from "../config/runtimeLimits";
import type { MemoryRepository } from "../memory/repository";
import type { RunContext } from "./runContext";
import { createUsageLedger } from "./runContext";
import type { RunEmitter } from "./runEmit";

export type BuildRunContextInput = {
  runId: string;
  threadId: string;
  sessionId?: string;
  workspaceRoot: string;
  workspaceName?: string;
  /** 本 run 数据目录（记忆等落盘）。 */
  dataDir?: string;
  /** 本 run 工作空间 id（记忆库按工作区落盘）。 */
  workspaceId?: string;
  /** 记忆仓库；省略则记忆仅运行时（不持久化）。 */
  memoryRepository?: MemoryRepository;
  chatMode?: ChatMode;
  workspaceAccess?: WorkspaceAccess;
  allowAiDeleteFiles?: boolean;
  allowAiShell?: boolean;
  allowAiBrowser?: boolean;
  shellApprovalMode?: ShellApprovalMode;
  shellAllowlist?: string[];
  shellBlocklist?: string[];
  shell?: ShellProfile | null;
  catalog?: ModelCatalog | null;
  selection?: ModelSelection | null;
  /** 本 run 限额快照（桌面随 UtilityRun 下发；省略时取进程默认）。 */
  limits?: RuntimeLimits;
  route?: { userText?: string; contextPaths?: string[]; hasImages?: boolean };
  /** 会话既有待办（run 开始时的会话状态），播种进本轮镜像。 */
  todos?: ChatTodo[];
  emit: RunEmitter;
};

/** 白名单与硬拒绝名单：重叠时黑名单优先。缺省黑名单为空。 */
function shellListsFromInput(input: BuildRunContextInput): {
  shellAllowlist: string[];
  shellBlocklist: string[];
} {
  const shellBlocklist = normalizeShellBlocklist(input.shellBlocklist);
  const shellAllowlist = shellAllowlistWithoutBlocked(
    input.shellAllowlist
      ? normalizeShellAllowlist(input.shellAllowlist)
      : [...DEFAULT_SHELL_ALLOWLIST],
    shellBlocklist,
  );
  return { shellAllowlist, shellBlocklist };
}

/** 组装本轮 RunContext。 */
export function buildRunContext(input: BuildRunContextInput): RunContext {
  const catalog = input.catalog
    ? {
        providers: input.catalog.providers.map((p) => ({ ...p })),
        models: input.catalog.models.map((m) => ({ ...m, tags: [...m.tags] })),
        selection: input.catalog.selection,
        allowEmoji: input.catalog.allowEmoji,
      }
    : null;
  const selection = input.selection ?? catalog?.selection ?? ({ mode: "auto" } as ModelSelection);

  return {
    runId: input.runId,
    threadId: input.threadId,
    sessionId: input.sessionId?.trim() || undefined,
    workspaceRoot: input.workspaceRoot,
    workspaceName: input.workspaceName?.trim() || undefined,
    dataDir: input.dataDir,
    workspaceId: input.workspaceId?.trim() || undefined,
    memoryRepository: input.memoryRepository,
    chatMode: normalizeChatMode(input.chatMode ?? DEFAULT_CHAT_MODE),
    workspaceAccess: normalizeWorkspaceAccess(input.workspaceAccess, DEFAULT_WORKSPACE_ACCESS),
    allowAiDeleteFiles: input.allowAiDeleteFiles !== false,
    allowAiShell: input.allowAiShell !== false,
    allowAiBrowser: input.allowAiBrowser !== false,
    shellApprovalMode: normalizeShellApprovalMode(
      input.shellApprovalMode,
      DEFAULT_SHELL_APPROVAL_MODE,
    ),
    ...shellListsFromInput(input),
    shellProfile: input.shell ?? null,
    limits: input.limits ?? resolveRuntimeLimits(),
    emit: input.emit,
    catalog,
    selection,
    routeContext: {
      userText: input.route?.userText ?? "",
      contextPaths: input.route?.contextPaths,
      ...(input.route?.hasImages ? { hasImages: true as const } : {}),
    },
    // 本 run 用量账本；子代理派生帧共享同一引用，故在此一次性创建
    usage: createUsageLedger(),
    hitlIds: new Set(),
    taskIds: new Set(),
    loadedToolNames: new Set(),
    // 会话待办本轮镜像：由会话记录播种，工具写入后靠 todo 事件回传落库
    todos: normalizeTodos(input.todos),
    // 默认计划拥有会话待办（create_plan 选「保留独立」时才置 false）
    planOwnsTodos: true,
    // 缺省视为历史延续（resume / 子代理派生）；run() 入口会显式改写为 true
    freshUserTurn: false,
  };
}
