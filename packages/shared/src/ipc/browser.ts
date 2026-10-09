/**
 * 内置浏览器契约（renderer ↔ main；agent 经 utility browserRequest）。
 */

/** 视口矩形（相对主窗口 content，DIP）。 */
export type BrowserBounds = {
  x: number;
  y: number;
  width: number;
  height: number;
};

/** 内置浏览器会话状态。 */
export type BrowserState = {
  url: string;
  title: string;
  loading: boolean;
  canGoBack: boolean;
  canGoForward: boolean;
  /** AI 锁定中（用户悬停见蒙层）。 */
  locked: boolean;
  /** 视口是否挂到主窗（非激活时为 false）。 */
  visible: boolean;
  /** 当前 viewport 宽高（CSS px；resize 工具可改）。 */
  viewportWidth: number;
  viewportHeight: number;
};

/** 推送给 renderer 的浏览器事件。 */
export type BrowserEvent =
  | { type: "state"; state: BrowserState }
  | { type: "reveal"; url?: string }
  | { type: "error"; message: string };

/** Preload 暴露的浏览器 API。 */
export type ThinkerBrowserApi = {
  getState(): Promise<BrowserState>;
  navigate(url: string): Promise<BrowserState>;
  goBack(): Promise<BrowserState>;
  goForward(): Promise<BrowserState>;
  reload(): Promise<BrowserState>;
  setBounds(bounds: BrowserBounds): Promise<void>;
  setVisible(visible: boolean): Promise<void>;
  /** 用户点击「接管」解除 AI 锁定。 */
  takeControl(): Promise<BrowserState>;
  onEvent(cb: (event: BrowserEvent) => void): () => void;
};
