/**
 * 窗口控制 API（自定义标题栏 / 无边框窗体用）。
 * 由 preload 桥接到主进程 `window:*` IPC 通道。
 */

/** 可独立开辅助窗口的页面 id（不含 chat）。 */
export type AuxPageId = "settings" | "tools";

/** 全部辅助页 id（校验 / 遍历用）。 */
export const AUX_PAGE_IDS: readonly AuxPageId[] = ["settings", "tools"];

/** 是否为合法辅助页 id。 */
export function isAuxPageId(value: unknown): value is AuxPageId {
  return typeof value === "string" && (AUX_PAGE_IDS as readonly string[]).includes(value);
}

/** 当前 BrowserWindow 在主进程中的角色。 */
export type WindowRole = { kind: "main" } | { kind: "aux"; page: AuxPageId };

/** Preload 暴露的窗口操作面。 */
export type ThinkerWindowApi = {
  /** 最小化。 */
  minimize(): Promise<void>;
  /**
   * 切换最大化 / 还原。
   * @returns 操作后是否处于最大化。
   */
  maximize(): Promise<boolean>;
  /** 关闭窗口（托盘开启时可能仅隐藏）。 */
  close(): Promise<void>;
  /** 查询当前是否最大化。 */
  isMaximized(): Promise<boolean>;
  /**
   * 订阅最大化状态变化。
   * @returns 取消订阅函数。
   */
  onMaximized(cb: (maximized: boolean) => void): () => void;
  /** 打开或聚焦产品工具窗（Logs / Components，无 Lanes）。 */
  toggleDevTools(): Promise<void>;
  /**
   * 打开或聚焦某页的辅助窗口；已存在则聚焦，不存在则新建。
   */
  openOrFocusPage(page: AuxPageId): Promise<void>;
  /**
   * 若该页辅助窗口已打开则聚焦并返回 true；否则返回 false（调用方可在主窗内导航）。
   */
  focusPageIfOpen(page: AuxPageId): Promise<boolean>;
  /** 聚焦主窗口（辅助窗口标题栏点品牌时用）。 */
  focusMain(): Promise<void>;
  /** 同步读取本窗口角色（首帧决定精简标题栏 / 固定页面）。 */
  getRoleSync(): WindowRole;
};
