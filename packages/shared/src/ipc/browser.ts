/**
 * 内置浏览器契约（renderer ↔ main；agent 经 utility browserRequest）。
 */

/**
 * <webview> 的会话分区：与主窗口隔离，cookie 持久。
 * 渲染层用它给标签打 partition，主进程不再自建 session。
 */
export const BROWSER_PARTITION = "persist:thinker-browser";

/** 视口尺寸（CSS px）。 */
export type BrowserViewport = {
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
/** 时间线展开用的截图预览。 */
export type BrowserScreenshotPreview = {
  dataUrl: string;
  size: number;
};

export type ThinkerBrowserApi = {
  getState(): Promise<BrowserState>;
  navigate(url: string): Promise<BrowserState>;
  goBack(): Promise<BrowserState>;
  goForward(): Promise<BrowserState>;
  reload(): Promise<BrowserState>;
  /** 面板挂载后上报 webview 的 webContents id（主进程据此接管自动化）。 */
  attachWebview(webContentsId: number, viewport: BrowserViewport): Promise<void>;
  /** 面板卸载：webview 即将销毁。 */
  detachWebview(): Promise<void>;
  /** webview 尺寸变化。 */
  setViewport(viewport: BrowserViewport): Promise<void>;
  setVisible(visible: boolean): Promise<void>;
  /** 用户点击「接管」解除 AI 锁定。 */
  takeControl(): Promise<BrowserState>;
  /**
   * 读取 dataDir/browser-screenshots 下的 PNG 为 data URL。
   * 路径越界或不存在时返回 null。
   */
  readScreenshot?(absolutePath: string): Promise<BrowserScreenshotPreview | null>;
  onEvent(cb: (event: BrowserEvent) => void): () => void;
};
