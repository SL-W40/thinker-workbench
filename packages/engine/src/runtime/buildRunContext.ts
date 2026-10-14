/**
 * 从 UtilityRun / UtilityResume 字段组装 RunContext（状态由 Handle 拥有）。
 */
import {
  type ChatMode,
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
  normalizeWorkspaceAccess,
  type ShellApprovalMode,
  type ShellProfile,
  shellAllowlistWithoutBlocked,
  type WorkspaceAccess,
} from "@thinker-workbench/shared";
import type { RunContext } from "./runContext";
import type { RunEmitter } from "./runEmit";

export type BuildRunContextInput = {
  runId: string;
  threadId: string;
  sessionId?: string;
  workspaceRoot: string;
  workspaceName?: string;
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
  route?: { userText?: string; contextPaths?: string[]; hasImages?: boolean };
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
    emit: input.emit,
    catalog,
    selection,
    routeContext: {
      userText: input.route?.userText ?? "",
      contextPaths: input.route?.contextPaths,
      ...(input.route?.hasImages ? { hasImages: true as const } : {}),
    },
    hitlIds: new Set(),
    taskIds: new Set(),
  };
}
