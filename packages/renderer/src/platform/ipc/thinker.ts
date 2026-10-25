/**
 * 渲染进程侧对 `window.thinker`（preload 注入的 ThinkerApi）的薄封装。
 *
 * - Electron 环境：转发到主进程 / utilityProcess
 * - 纯浏览器预览：`runAgent` 回退为本地 echo，便于 Vite 单独调试 UI
 * - 设置相关 API 在不可用时 reject，由表单层展示“需 `pnpm run dev`”提示
 */
import type {
  AgentEvent,
  AgentResumeCommand,
  AgentRunCommand,
  AttentionPreviewKind,
  ContextUsageRequest,
  ContextUsageSnapshot,
  CustomizeScope,
  DataDirChangePreview,
  DataDirChangeRequest,
  DataDirChangeResult,
  DataDirMigrateProgress,
  DataDirPaths,
  GeneralSettings,
  HitlResponse,
  LogRecord,
  McpImportConflict,
  McpListResult,
  McpServerConfig,
  McpServerRuntimeStatus,
  McpServerUpsertInput,
  ModelCatalogPatch,
  ModelCatalogPublic,
  ModelProbeRequest,
  ModelProbeResult,
  ModelSelection,
  RunResult,
  ShortcutsMap,
  SkillListItem,
  ThinkerApi,
  ThreadMeta,
  UnlockModelSecretsRequest,
  UnlockModelSecretsResult,
} from "@thinker-workbench/shared";
import { emptyContextUsageSnapshot } from "@thinker-workbench/shared";

declare global {
  interface Window {
    /** Electron preload 注入；纯浏览器预览时不存在。 */
    thinker?: ThinkerApi;
  }
}

/** 读取 preload 注入的 API；浏览器预览下可能为 undefined。 */
function api(): ThinkerApi | undefined {
  return window.thinker;
}

/**
 * 发起一次 Agent 运行。
 * 无 bridge 时模拟延迟并回显消息（浏览器预览）。
 */
export async function runAgent(command: AgentRunCommand | string): Promise<RunResult> {
  const thinker = api();
  if (thinker?.run) return thinker.run(command);

  await new Promise((r) => setTimeout(r, 420));
  return {
    ok: true,
    accepted: true,
    runId: "preview",
    threadId: "preview",
  };
}

/** 取消指定 run 或会话上的活动 run；无 API 时为 no-op。 */
export function cancelAgent(
  command?: string | { runId?: string; sessionId?: string },
): Promise<{ ok: boolean; error?: string } | undefined> {
  return api()?.cancel(command ?? "") ?? Promise.resolve({ ok: true });
}

/** 取消单个后台 Task（不停止父 run）。 */
export function cancelAgentTask(
  taskId: string,
  runId?: string,
): Promise<{ ok: boolean; error?: string }> {
  const id = taskId.trim();
  if (!id) return Promise.resolve({ ok: false, error: "taskId is required." });
  const thinker = api();
  if (!thinker?.cancelTask) {
    return Promise.resolve({ ok: false, error: "cancelTask API unavailable." });
  }
  return thinker.cancelTask({ taskId: id, ...(runId?.trim() ? { runId: runId.trim() } : {}) });
}

/** 从中断点恢复（审批 / checkpoint Resume）。 */
export async function resumeAgent(command: AgentResumeCommand): Promise<RunResult> {
  const thinker = api();
  if (!thinker?.resume) {
    return { ok: false, error: "Resume API unavailable.", runId: "", threadId: command.threadId };
  }
  const result = await thinker.resume(command);
  return result;
}

/**
 * 估算当前会话上下文占用（与 assembleContext 同源）。
 * 无 bridge（浏览器预览 / preload 未注入）时返回带 error 的快照：
 * 那时 0 不是「没占用」而是「没算出来」，UI 必须显示「不可用」。
 */
export async function getContextUsage(
  request?: ContextUsageRequest,
): Promise<ContextUsageSnapshot> {
  const thinker = api();
  if (!thinker?.getContextUsage) return emptyContextUsageSnapshot(undefined, "bridge_missing");
  return thinker.getContextUsage(request ?? {});
}

/** 列出侧栏会话（SQLite）。 */
export async function listAgentThreads(): Promise<ThreadMeta[]> {
  return api()?.listThreads?.() ?? [];
}

/**
 * 订阅 Agent 事件流（token / done / error 等）。
 * 返回取消订阅函数；无 API 时返回空函数。
 */
export function onAgentEvent(cb: (event: AgentEvent) => void): () => void {
  return api()?.onEvent(cb) ?? (() => undefined);
}

/** 订阅跨进程 LogRecord（desktop / agent）。 */
export function onLog(cb: (record: LogRecord) => void): () => void {
  return api()?.onLog?.(cb) ?? (() => undefined);
}

/** 将 renderer LogRecord 交给主进程写入 app.log。 */
export function reportLog(record: LogRecord): void {
  api()?.reportLog?.(record);
}

/** 窗口控制 API（最小化 / 最大化 / 关闭 / DevTools 等）。 */
export function windowApi() {
  return api()?.window;
}

/** 读取模型目录公开视图（不含完整 API Key）。 */
export function getModelSettings(): Promise<ModelCatalogPublic> {
  const settings = api()?.settings;
  if (!settings) return Promise.reject(new Error("Settings API unavailable."));
  return settings.getModel();
}

/**
 * `setModel` / `probeModel` 成功后在 `window` 上派发的自定义事件名。
 * `detail` 为最新 `ModelCatalogPublic`（供对话里的模型选择器同步）。
 */
export const MODEL_SETTINGS_CHANGED = "tw:model-settings";

/** 通知同窗口的模型选择器：目录已变。 */
function publishModelSettings(catalog: ModelCatalogPublic): void {
  window.dispatchEvent(new CustomEvent(MODEL_SETTINGS_CHANGED, { detail: catalog }));
}

/** 部分更新模型目录并返回最新公开快照。 */
export async function setModelSettings(patch: ModelCatalogPatch): Promise<ModelCatalogPublic> {
  const settings = api()?.settings;
  if (!settings) return Promise.reject(new Error("Settings API unavailable."));
  const saved = await settings.setModel(patch);
  publishModelSettings(saved);
  return saved;
}

/** 对指定模型做连通性测试。 */
export async function probeModel(request: ModelProbeRequest): Promise<ModelProbeResult> {
  const settings = api()?.settings;
  if (!settings?.probeModel) return Promise.reject(new Error("Settings API unavailable."));
  const result = await settings.probeModel(request);
  publishModelSettings(result.catalog);
  return result;
}

/** 发消息前解锁已存 API key（会触发 OS 钥匙串）。 */
export async function unlockModelSecrets(
  request?: UnlockModelSecretsRequest,
): Promise<UnlockModelSecretsResult> {
  const settings = api()?.settings;
  if (!settings?.unlockModelSecrets) {
    // 浏览器预览：无钥匙串，视为已就绪
    return { ok: true };
  }
  return settings.unlockModelSecrets(request);
}

/** 读取会话级模型选用覆盖。 */
export function getSessionModelSelection(sessionId: string): Promise<ModelSelection | null> {
  const settings = api()?.settings;
  if (!settings?.getSessionModelSelection) {
    return Promise.reject(new Error("Settings API unavailable."));
  }
  return settings.getSessionModelSelection(sessionId);
}

/** 写入会话级模型选用覆盖。 */
export function setSessionModelSelection(
  sessionId: string,
  selection: ModelSelection,
): Promise<ModelSelection | null> {
  const settings = api()?.settings;
  if (!settings?.setSessionModelSelection) {
    return Promise.reject(new Error("Settings API unavailable."));
  }
  return settings.setSessionModelSelection(sessionId, selection);
}

/** 读取会话级 ChatMode。 */
export function getSessionChatMode(
  sessionId: string,
): Promise<import("@thinker-workbench/shared").ChatMode | null> {
  const settings = api()?.settings;
  if (!settings?.getSessionChatMode) {
    return Promise.reject(new Error("Settings API unavailable."));
  }
  return settings.getSessionChatMode(sessionId);
}

/**
 * `setSessionChatMode` 成功后在 `window` 上派发的事件名。
 * `detail` 为 `{ sessionId, chatMode }`（供同一窗口内的多个模式选择器同步）。
 */
export const SESSION_CHAT_MODE_CHANGED = "tw:session-chat-mode";

/** 会话 ChatMode 变更载荷。 */
export type SessionChatModeChange = {
  sessionId: string;
  chatMode: import("@thinker-workbench/shared").ChatMode;
};

/** 写入会话级 ChatMode；成功后派发 `SESSION_CHAT_MODE_CHANGED`。 */
export async function setSessionChatMode(
  sessionId: string,
  chatMode: import("@thinker-workbench/shared").ChatMode,
): Promise<import("@thinker-workbench/shared").ChatMode> {
  const settings = api()?.settings;
  if (!settings?.setSessionChatMode) {
    throw new Error("Settings API unavailable.");
  }
  const saved = await settings.setSessionChatMode(sessionId, chatMode);
  window.dispatchEvent(
    new CustomEvent<SessionChatModeChange>(SESSION_CHAT_MODE_CHANGED, {
      detail: { sessionId, chatMode: saved },
    }),
  );
  return saved;
}

/**
 * 订阅会话 ChatMode 变更：本窗口写入走 window 事件，
 * 其它窗口（含工具请求切换后主进程落盘）走 IPC 广播。
 */
export function onSessionChatModeChanged(cb: (change: SessionChatModeChange) => void): () => void {
  const onLocal = (event: Event) => {
    const detail = (event as CustomEvent<SessionChatModeChange>).detail;
    if (detail?.sessionId) cb(detail);
  };
  window.addEventListener(SESSION_CHAT_MODE_CHANGED, onLocal);
  const offIpc = api()?.settings?.onSessionChatModeChanged?.(cb);
  return () => {
    window.removeEventListener(SESSION_CHAT_MODE_CHANGED, onLocal);
    offIpc?.();
  };
}

/** 读取快捷键映射。 */
export function getShortcutsSettings(): Promise<ShortcutsMap> {
  const settings = api()?.settings;
  if (!settings?.getShortcuts) return Promise.reject(new Error("Settings API unavailable."));
  return settings.getShortcuts();
}

/**
 * `setShortcuts` 成功后在 `window` 上派发的自定义事件名。
 * `detail` 为已保存的 `ShortcutsMap`（供全局快捷键 hook 同步）。
 */
export const SHORTCUTS_SETTINGS_CHANGED = "tw:shortcuts-settings";

/** 部分更新快捷键映射；成功后派发 `SHORTCUTS_SETTINGS_CHANGED`。 */
export async function setShortcutsSettings(patch: Partial<ShortcutsMap>): Promise<ShortcutsMap> {
  const settings = api()?.settings;
  if (!settings?.setShortcuts) return Promise.reject(new Error("Settings API unavailable."));
  const saved = await settings.setShortcuts(patch);
  window.dispatchEvent(new CustomEvent(SHORTCUTS_SETTINGS_CHANGED, { detail: saved }));
  return saved;
}

/**
 * `setGeneral` 成功后在 `window` 上派发的自定义事件名。
 * `detail` 为已保存的 `GeneralSettings`（供设置页 / 其它面板同步）。
 */
export const GENERAL_SETTINGS_CHANGED = "tw:general-settings";

/** 读取通用设置（主题、语言、通知等）。 */
export function getGeneralSettings(): Promise<GeneralSettings> {
  const settings = api()?.settings;
  if (!settings?.getGeneral) return Promise.reject(new Error("Settings API unavailable."));
  return settings.getGeneral();
}

/**
 * 部分更新通用设置；成功后派发 `GENERAL_SETTINGS_CHANGED`。
 */
export async function setGeneralSettings(
  patch: Partial<GeneralSettings>,
): Promise<GeneralSettings> {
  const settings = api()?.settings;
  if (!settings?.setGeneral) return Promise.reject(new Error("Settings API unavailable."));
  const saved = await settings.setGeneral(patch);
  window.dispatchEvent(new CustomEvent(GENERAL_SETTINGS_CHANGED, { detail: saved }));
  return saved;
}

/** 预览系统通知或完成音效（设置页「试听 / 试一下」）。 */
export function previewAttention(kind: AttentionPreviewKind): Promise<void> {
  const settings = api()?.settings;
  if (!settings?.previewAttention) return Promise.reject(new Error("Settings API unavailable."));
  return settings.previewAttention(kind);
}

/** 打开系统目录选择框；取消或不支持时返回 `null`。 */
export function pickDirectory(options?: {
  title?: string;
  defaultPath?: string;
}): Promise<string | null> {
  const settings = api()?.settings;
  if (!settings?.pickDirectory) return Promise.resolve(null);
  return settings.pickDirectory(options);
}

/** 解析数据根与 settings 路径；省略参数时用当前已生效配置。 */
export function resolveDataDir(configured?: string): Promise<DataDirPaths> {
  const settings = api()?.settings;
  if (!settings?.resolveDataDir) {
    return Promise.reject(new Error("Data directory API unavailable."));
  }
  return settings.resolveDataDir(configured);
}

/** 预览数据目录变更（校验、迁移清单、运行中会话）。 */
export function previewDataDirChange(dataDir: string): Promise<DataDirChangePreview> {
  const settings = api()?.settings;
  if (!settings?.previewDataDirChange) {
    return Promise.reject(new Error("Data directory API unavailable."));
  }
  return settings.previewDataDirChange(dataDir);
}

/** 应用数据目录变更（可选迁移历史数据）。 */
export async function applyDataDirChange(
  request: DataDirChangeRequest,
): Promise<DataDirChangeResult> {
  const settings = api()?.settings;
  if (!settings?.applyDataDirChange) {
    return Promise.reject(new Error("Data directory API unavailable."));
  }
  const result = await settings.applyDataDirChange(request);
  if (result.ok && result.general) {
    window.dispatchEvent(new CustomEvent(GENERAL_SETTINGS_CHANGED, { detail: result.general }));
  }
  return result;
}

/** 订阅数据目录迁移进度。 */
export function onDataDirMigrateProgress(
  cb: (progress: DataDirMigrateProgress) => void,
): () => void {
  const settings = api()?.settings;
  if (!settings?.onDataDirMigrateProgress) return () => {};
  return settings.onDataDirMigrateProgress(cb);
}

/** 答复 HITL（审批 / 澄清等）；无 bridge 时为 no-op。 */
export function respondHitl(response: HitlResponse): Promise<void> {
  return api()?.respondHitl?.(response) ?? Promise.resolve();
}

/** 列出 skills 摘要（Composer `/`）。 */
export async function listSkills(workspaceRoot?: string | null): Promise<SkillListItem[]> {
  return api()?.skills?.list(workspaceRoot) ?? [];
}

/** MCP 列表（可带工作区根以合并 workspace 作用域）。 */
export async function mcpList(workspaceRoot?: string | null): Promise<McpListResult> {
  return api()?.mcp?.list(workspaceRoot) ?? { servers: [], statuses: [] };
}

/** 新建 / 更新 MCP。 */
export async function mcpUpsert(input: McpServerUpsertInput): Promise<McpServerConfig> {
  const mcp = api()?.mcp;
  if (!mcp) throw new Error("MCP API unavailable.");
  return mcp.upsert(input);
}

/** 删除 MCP。 */
export async function mcpRemove(id: string, scope?: CustomizeScope): Promise<void> {
  await api()?.mcp?.remove(id, scope);
}

/** 启用 / 禁用 MCP。 */
export async function mcpSetEnabled(
  id: string,
  enabled: boolean,
  scope?: CustomizeScope,
): Promise<McpServerConfig> {
  const mcp = api()?.mcp;
  if (!mcp) throw new Error("MCP API unavailable.");
  return mcp.setEnabled(id, enabled, scope);
}

/** 测试 MCP 连接。 */
export async function mcpTest(input: McpServerUpsertInput): Promise<McpServerRuntimeStatus> {
  const mcp = api()?.mcp;
  if (!mcp) throw new Error("MCP API unavailable.");
  return mcp.test(input);
}

/** 导入 mcp.json。 */
export async function mcpImportFile(
  conflict?: McpImportConflict,
  scope?: CustomizeScope,
): Promise<{
  imported: string[];
  skipped: string[];
}> {
  const mcp = api()?.mcp;
  if (!mcp?.importFile) return { imported: [], skipped: [] };
  return mcp.importFile(conflict, scope);
}

/** 导出 mcp.json。 */
export async function mcpExportFile(
  scope?: CustomizeScope,
): Promise<{ ok: boolean; path?: string }> {
  const mcp = api()?.mcp;
  if (!mcp?.exportFile) return { ok: false };
  return mcp.exportFile(scope);
}

/** 订阅 MCP 状态。 */
export function onMcpStatus(cb: (status: McpServerRuntimeStatus) => void): () => void {
  return api()?.mcp?.onStatus(cb) ?? (() => undefined);
}
