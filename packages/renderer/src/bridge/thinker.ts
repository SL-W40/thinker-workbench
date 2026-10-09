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
  DataDirChangePreview,
  DataDirChangeRequest,
  DataDirChangeResult,
  DataDirMigrateProgress,
  GeneralSettings,
  LogRecord,
  ModelSettingsPatch,
  ModelSettingsPublic,
  ShortcutsMap,
  ThinkerApi,
  ThreadMeta,
  RunResult,
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

  const message = typeof command === "string" ? command : command.message;
  await new Promise((r) => setTimeout(r, 420));
  return {
    ok: true,
    text: `(browser preview echo) ${message}\n\nRun npm run dev to use Electron + utilityProcess.`,
    runId: "preview",
    threadId: "preview",
  };
}

/** 取消指定（或当前）Agent 运行；无 API 时为 no-op。 */
export function cancelAgent(runId?: string): Promise<void> {
  return api()?.cancel(runId ?? "") ?? Promise.resolve();
}

/** 从中断点恢复（审批 / checkpoint Resume）。 */
export async function resumeAgent(command: AgentResumeCommand): Promise<RunResult> {
  const thinker = api();
  if (!thinker?.resume) {
    return { ok: false, error: "Resume API unavailable.", runId: "", threadId: command.threadId };
  }
  return thinker.resume(command);
}

/** 估算当前会话上下文占用（与 assembleContext 同源）。 */
export async function getContextUsage(
  request?: ContextUsageRequest,
): Promise<ContextUsageSnapshot> {
  const thinker = api();
  if (!thinker?.getContextUsage) return emptyContextUsageSnapshot();
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

/** 读取模型相关公开设置（不含完整 API Key）。 */
export function getModelSettings(): Promise<ModelSettingsPublic> {
  const settings = api()?.settings;
  if (!settings) return Promise.reject(new Error("Settings API unavailable."));
  return settings.getModel();
}

/** 部分更新模型设置并返回最新公开快照。 */
export function setModelSettings(patch: ModelSettingsPatch): Promise<ModelSettingsPublic> {
  const settings = api()?.settings;
  if (!settings) return Promise.reject(new Error("Settings API unavailable."));
  return settings.setModel(patch);
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
export async function setShortcutsSettings(
  patch: Partial<ShortcutsMap>,
): Promise<ShortcutsMap> {
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
