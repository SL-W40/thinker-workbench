/**
 * 渲染进程终端 API 薄封装（preload `window.thinker.terminal`）。
 */
import type {
  ShellProfile,
  TerminalEvent,
  TerminalSession,
} from "@thinker-workbench/shared";

/** 时间线「跳转终端」自定义事件名。 */
export const OPEN_TERMINAL_EVENT = "tw:open-terminal";

/** 跳转终端时的可选预览（无 sessionId 或会话尚未同步时用）。 */
export type OpenTerminalDetail = {
  sessionId?: string;
  /** 时间线已有的输出 / 错误，写入本地缓冲以便立刻展示。 */
  previewOutput?: string;
  title?: string;
};

/** 面板尚未挂载时暂存，mount 后由 TerminalPane 消费。 */
let pendingOpen: OpenTerminalDetail | null = null;

/** 取出并清空待打开详情（TerminalPane 挂载时调用）。 */
export function consumePendingOpenTerminal(): OpenTerminalDetail | null {
  const next = pendingOpen;
  pendingOpen = null;
  return next;
}

/** 请求打开右侧 Terminal 面板（可选聚焦某会话，并可带预览输出）。 */
export function requestOpenTerminal(detail?: string | OpenTerminalDetail): void {
  const payload: OpenTerminalDetail =
    typeof detail === "string"
      ? { sessionId: detail.trim() || undefined }
      : {
          sessionId: detail?.sessionId?.trim() || undefined,
          previewOutput: detail?.previewOutput,
          title: detail?.title,
        };
  pendingOpen = payload;
  window.dispatchEvent(new CustomEvent(OPEN_TERMINAL_EVENT, { detail: payload }));
}

function api() {
  return window.thinker?.terminal;
}

/** 列出当前 PTY 会话。 */
export function listTerminalSessions(): Promise<TerminalSession[]> {
  return api()?.listSessions() ?? Promise.resolve([]);
}

/** 列出本机可探测的 shell profiles。 */
export function listShellProfiles(): Promise<ShellProfile[]> {
  return api()?.listShellProfiles() ?? Promise.resolve([]);
}

/** 新建交互式终端。 */
export function createTerminal(options?: {
  cwd?: string;
  cols?: number;
  rows?: number;
  /** 指定 shell profile；缺省用 Settings 默认。 */
  profileId?: string;
}): Promise<TerminalSession | null> {
  const term = api();
  if (!term) return Promise.resolve(null);
  return term.create(options);
}

/** 向 PTY 写入。 */
export function writeTerminal(sessionId: string, data: string): Promise<void> {
  return api()?.write(sessionId, data) ?? Promise.resolve();
}

/** 调整 PTY 尺寸。 */
export function resizeTerminal(
  sessionId: string,
  cols: number,
  rows: number,
): Promise<void> {
  return api()?.resize(sessionId, cols, rows) ?? Promise.resolve();
}

/** 杀掉会话。 */
export function killTerminal(sessionId: string): Promise<void> {
  return api()?.kill(sessionId) ?? Promise.resolve();
}

/** 从主进程拉取会话缓冲（打开 / 切换时回放）。 */
export function getTerminalOutput(sessionId: string): Promise<string> {
  return api()?.getOutput?.(sessionId) ?? Promise.resolve("");
}

/** 订阅终端事件；无 bridge 时返回空函数。 */
export function onTerminalEvent(cb: (event: TerminalEvent) => void): () => void {
  return api()?.onEvent(cb) ?? (() => undefined);
}
