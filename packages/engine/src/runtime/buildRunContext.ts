/**
 * 从 UtilityRun / UtilityResume 字段组装 RunContext（状态由 Handle 拥有）。
 */
import {
  DEFAULT_CHAT_MODE,
  DEFAULT_SHELL_ALLOWLIST,
  DEFAULT_SHELL_APPROVAL_MODE,
  DEFAULT_WORKSPACE_ACCESS,
  normalizeChatMode,
  normalizeShellAllowlist,
  normalizeShellApprovalMode,
  normalizeWorkspaceAccess,
  type ChatMode,
  type ModelCatalog,
  type ModelSelection,
  type ShellApprovalMode,
  type ShellProfile,
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
  shell?: ShellProfile | null;
  catalog?: ModelCatalog | null;
  selection?: ModelSelection | null;
  route?: { userText?: string; contextPaths?: string[] };
  emit: RunEmitter;
};

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
  const selection =
    input.selection ?? catalog?.selection ?? ({ mode: "auto" } as ModelSelection);

  return {
    runId: input.runId,
    threadId: input.threadId,
    sessionId: input.sessionId?.trim() || undefined,
    workspaceRoot: input.workspaceRoot,
    workspaceName: input.workspaceName?.trim() || undefined,
    chatMode: normalizeChatMode(input.chatMode ?? DEFAULT_CHAT_MODE),
    workspaceAccess: normalizeWorkspaceAccess(
      input.workspaceAccess,
      DEFAULT_WORKSPACE_ACCESS,
    ),
    allowAiDeleteFiles: input.allowAiDeleteFiles !== false,
    allowAiShell: input.allowAiShell !== false,
    allowAiBrowser: input.allowAiBrowser !== false,
    shellApprovalMode: normalizeShellApprovalMode(
      input.shellApprovalMode,
      DEFAULT_SHELL_APPROVAL_MODE,
    ),
    shellAllowlist: input.shellAllowlist
      ? normalizeShellAllowlist(input.shellAllowlist)
      : [...DEFAULT_SHELL_ALLOWLIST],
    shellProfile: input.shell ?? null,
    emit: input.emit,
    catalog,
    selection,
    routeContext: {
      userText: input.route?.userText ?? "",
      contextPaths: input.route?.contextPaths,
    },
    hitlIds: new Set(),
    taskIds: new Set(),
  };
}
