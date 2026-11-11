/**
 * 一次 run / resume / contextUsage 要交给子进程的领域载荷。
 * 桥只负责就绪、requestId 和转发；选模型、解锁密钥、拼运行时设置在这里完成。
 */
import {
  buildRuntimeSettings,
  type ChatMode,
  DEFAULT_CHAT_MODE,
  DEFAULT_CONTEXT_WINDOW,
  type ModelCatalog,
  type ModelSelection,
  normalizeChatMode,
} from "@thinker-workbench/shared";
import { getDataDir } from "../config/paths";
import {
  getGeneralSettings,
  getModelCatalog,
  getModelCatalogSnapshot,
  resolvePrimaryModelMeta,
  unlockModelSecretsForRun,
} from "../config/settingsStore";
import { listAgents } from "../customize/agentsStore";
import {
  getActiveSessionId,
  getSession,
  getSessionByThreadId,
  getSessionChatMode,
  getSessionModelSelection,
} from "../db/workspacesStore";
import { shellFactsForAgent } from "../terminal/detectShellProfiles";

export type ContextUsageMeta = {
  limit: number;
  allowEmoji: boolean;
  threadId?: string;
};

/** 发 run 前确认密钥已解锁。IPC 层应已弹过窗；这里是派发前的最后一道。 */
export function assertModelSecretsUnlocked(): void {
  const result = unlockModelSecretsForRun();
  if (result.ok) return;
  const code =
    result.reason === "denied" ? "MODEL_API_KEY_UNLOCK_DENIED" : "MODEL_API_KEY_MISSING";
  throw new Error(code);
}

/** 会话覆盖优先的选用。不碰钥匙串。 */
export function resolveSelection(catalog: ModelCatalog, threadId?: string): ModelSelection {
  let selection = catalog.selection;
  if (threadId) {
    const session = getSessionByThreadId(threadId);
    if (session) {
      const override = getSessionModelSelection(session.id);
      if (override) selection = override;
    }
  }
  return selection;
}

/** 模型目录快照。不解锁密文，给用量估算用。 */
export function modelPayloadSnapshot(threadId?: string): {
  catalog: ModelCatalog;
  selection: ModelSelection;
} {
  const catalog = getModelCatalogSnapshot();
  return { catalog, selection: resolveSelection(catalog, threadId) };
}

/** 本轮模型目录与生效选用。会解锁钥匙串。 */
export function modelPayload(threadId?: string): {
  catalog: ModelCatalog;
  selection: ModelSelection;
} {
  assertModelSecretsUnlocked();
  const catalog = getModelCatalog();
  return { catalog, selection: resolveSelection(catalog, threadId) };
}

/** 本轮会话 ChatMode，缺省 agent。 */
export function chatModePayload(threadId?: string): { chatMode: ChatMode } {
  let chatMode = DEFAULT_CHAT_MODE;
  if (threadId) {
    const session = getSessionByThreadId(threadId);
    if (session) {
      const stored = getSessionChatMode(session.id);
      if (stored) chatMode = normalizeChatMode(stored);
    }
  }
  return { chatMode };
}

/** 当前工作区可见的子代理。 */
export function subagentsPayload(workspaceRoot?: string | null): {
  subagents: ReturnType<typeof listAgents>["agents"];
} {
  return { subagents: listAgents(workspaceRoot).agents };
}

/**
 * run 与 resume 共用的后半段：模型、模式、子代理、运行时设置、数据目录。
 * 调用会解锁钥匙串。
 */
export function runEnvelope(threadId: string | undefined, workspaceRoot?: string | null) {
  const general = getGeneralSettings();
  return {
    ...modelPayload(threadId),
    ...chatModePayload(threadId),
    ...subagentsPayload(workspaceRoot),
    ...buildRuntimeSettings(general, shellFactsForAgent(general.shellProfileId)),
    dataDir: getDataDir(),
  };
}

/** 用量估算的窗口。读当前前台会话，不解锁。 */
export function contextUsageMeta(): ContextUsageMeta {
  const activeId = getActiveSessionId();
  const activeSession = activeId ? getSession(activeId) : null;
  const { catalog, selection } = modelPayloadSnapshot(activeSession?.threadId);
  const meta = resolvePrimaryModelMeta(catalog, selection);
  return {
    limit:
      typeof meta.contextWindow === "number" && meta.contextWindow > 0
        ? meta.contextWindow
        : DEFAULT_CONTEXT_WINDOW,
    allowEmoji: meta.allowEmoji ?? false,
    threadId: activeSession?.threadId,
  };
}

/** contextUsage 消息里与请求无关的字段。不解锁。 */
export function contextUsageFields(meta: ContextUsageMeta) {
  const general = getGeneralSettings();
  const { catalog, selection } = modelPayloadSnapshot(meta.threadId);
  return {
    catalog,
    selection,
    aiLocale: general.aiLocale,
    workspaceAccess: general.workspaceAccess,
    allowAiDeleteFiles: general.allowAiDeleteFiles,
    dataDir: getDataDir(),
    contextWindow: meta.limit,
    allowEmoji: meta.allowEmoji,
    chatMode: chatModePayload(meta.threadId).chatMode,
  };
}
