/**
 * 内置浏览器：渲染层 <webview> 里的页面 + 主进程自动化。
 *
 * 设计要点：
 * - 页面本身是渲染层的 <webview> 标签（DOM 合成，应用内浮层能压住它），
 *   主进程不建 WebContentsView，只借 webContents id 接管它做自动化
 * - 挂载：面板挂载时渲染层上报 webContents id；切 tab / 关面板即上报卸载
 * - 自动化需要面板真的打开：未挂载时先 broadcast reveal 并等一会儿挂载，
 *   等不到才报错（离屏截图在 <webview> 下没有意义）
 * - 同 URL 且已落定则跳过 loadURL
 * - 导航中再次 navigate 则 stop 后换目标；动作前等待加载落定
 * - 切 tab 会销毁 guest：记住最后地址，重新挂载且空白时自动还原
 */
import fs from "node:fs";
import path from "node:path";
import {
  BROWSER_ABOUT_BLANK,
  type BrowserState,
  type BrowserViewport,
  browserUrlsEqual,
  normalizeBrowserUrl,
  type UtilityBrowserRequest,
} from "@thinker-workbench/shared";
import { type WebContents, webContents } from "electron";
import { getCacheDir } from "../config/paths";
import { desktopLog } from "../log/setup";
import {
  ATTACH_WAIT_MS,
  CAPTURE_TIMEOUT_MS,
  FALLBACK_VIEWPORT_H,
  FALLBACK_VIEWPORT_W,
  LOAD_SETTLE_TIMEOUT_MS,
} from "./browserConstants";
import { broadcast } from "./browserEvents";
import { waitForLoadSettle } from "./loadSettle";
import { maybeOpenLocalLinkExternally } from "./localLinks";
import {
  clickScript,
  fillScript,
  getStylesScript,
  pressKeyScript,
  SNAPSHOT_SCRIPT,
  scrollScript,
  typeScript,
} from "./pageScripts";

/** <webview> 事件订阅句柄，卸载时逐个摘掉。 */
type WebContentsBinding = {
  wc: WebContents;
  off: Array<() => void>;
};

class BrowserSessionManager {
  private wc: WebContents | null = null;
  private binding: WebContentsBinding | null = null;
  private visible = false;
  private locked = false;
  private viewport: BrowserViewport = { width: 0, height: 0 };
  private viewportWidth = 0;
  private viewportHeight = 0;
  private loading = false;
  private deviceMetricsActive = false;
  /** 导航世代：并发 navigate 时旧 load 结果作废。 */
  private loadSeq = 0;
  /** 切 tab 后 guest 会销毁：记住最后地址，重新挂载时还原。 */
  private lastUrl = BROWSER_ABOUT_BLANK;
  /** 等待面板挂载的调用方（reveal 后等 attach）。 */
  private attachWaiters: Array<(wc: WebContents | null) => void> = [];
  private attachTimer: ReturnType<typeof setTimeout> | null = null;

  /** 当前状态快照。 */
  getState(): BrowserState {
    const wc = this.liveContents();
    const url = wc ? wc.getURL() : BROWSER_ABOUT_BLANK;
    return {
      url: url || BROWSER_ABOUT_BLANK,
      title: wc ? wc.getTitle() : "",
      loading: this.loading,
      canGoBack: Boolean(wc && wc.navigationHistory.canGoBack()),
      canGoForward: Boolean(wc && wc.navigationHistory.canGoForward()),
      locked: this.locked,
      visible: this.visible && Boolean(wc),
      viewportWidth: this.viewportWidth || this.viewport.width || FALLBACK_VIEWPORT_W,
      viewportHeight: this.viewportHeight || this.viewport.height || FALLBACK_VIEWPORT_H,
    };
  }

  private emitState(): void {
    broadcast({ type: "state", state: this.getState() });
  }

  /** 仍活着的 guest webContents；未挂载 / 已销毁返回 null。 */
  private liveContents(): WebContents | null {
    const wc = this.wc;
    if (!wc || wc.isDestroyed()) return null;
    return wc;
  }

  // ---------- 挂载 / 卸载 ----------

  /** 渲染层 <webview> 就绪：上报其 webContents id。 */
  attachWebview(webContentsId: number, viewport?: BrowserViewport): void {
    const wc = typeof webContentsId === "number" ? webContents.fromId(webContentsId) : undefined;
    if (!wc || wc.isDestroyed()) {
      desktopLog("browser").warn("attachWebview: bad webContents id", { webContentsId });
      return;
    }
    if (viewport) this.setViewport(viewport);
    // dom-ready 每次导航都会再触发：同一个 guest 不必重复订阅
    if (this.binding?.wc === wc) {
      this.emitState();
      this.flushAttachWaiters(wc);
      return;
    }
    this.unbind();
    this.wc = wc;
    this.binding = this.bind(wc);
    desktopLog("browser").info("webview attached", { webContentsId });
    // 面板刚挂载但页面空白：把切 tab 前的地址还回去（guest 已被销毁过）
    const url = wc.getURL();
    if ((!url || url === BROWSER_ABOUT_BLANK) && this.lastUrl !== BROWSER_ABOUT_BLANK) {
      const restore = this.lastUrl;
      void wc.loadURL(restore).catch(() => undefined);
    }
    this.emitState();
    this.flushAttachWaiters(wc);
  }

  /** 渲染层 <webview> 即将销毁。 */
  detachWebview(): void {
    const wc = this.liveContents();
    if (wc) {
      const url = wc.getURL();
      if (url && url !== BROWSER_ABOUT_BLANK) this.lastUrl = url;
    }
    this.unbind();
    this.wc = null;
    this.loading = false;
    desktopLog("browser").info("webview detached");
    this.flushAttachWaiters(null);
    this.emitState();
  }

  private bind(wc: WebContents): WebContentsBinding {
    const off: Array<() => void> = [];
    const on = <E extends keyof WebContentsEventMap>(event: E, handler: WebContentsEventMap[E]) => {
      wc.on(event as never, handler as never);
      off.push(() => wc.off(event as never, handler as never));
    };
    on("did-start-loading", () => {
      this.loading = true;
      this.emitState();
    });
    on("did-stop-loading", () => {
      this.loading = false;
      this.emitState();
    });
    on("page-title-updated", () => this.emitState());
    on("did-navigate", () => this.emitState());
    on("did-navigate-in-page", () => this.emitState());
    on("did-fail-load", (_e, code, desc, url, isMainFrame) => {
      if (!isMainFrame) return;
      this.loading = false;
      broadcast({
        type: "error",
        message: `Failed to load (${code}): ${desc} — ${url}`,
      });
      this.emitState();
    });
    // 页面里的 window.open / target=_blank 一律留在内置浏览器
    wc.setWindowOpenHandler(({ url }) => {
      void this.navigate(url, { reveal: true });
      return { action: "deny" };
    });
    return { wc, off };
  }

  private unbind(): void {
    const binding = this.binding;
    if (!binding) return;
    for (const off of binding.off) {
      try {
        off();
      } catch {
        /* wc 可能已销毁 */
      }
    }
    this.binding = null;
  }

  /**
   * 取可用的 guest；未挂载时请求渲染层开面板并等它挂载。
   * 等不到返回 null —— 调用方据此给出「先打开浏览器面板」的错误。
   */
  private async resolveContents(options?: { wait?: boolean }): Promise<WebContents | null> {
    const live = this.liveContents();
    if (live) return live;
    if (options?.wait === false) return null;
    return this.waitForAttach();
  }

  private waitForAttach(): Promise<WebContents | null> {
    broadcast({ type: "reveal" });
    return new Promise((resolve) => {
      this.attachWaiters.push(resolve);
      if (this.attachTimer) return;
      this.attachTimer = setTimeout(() => {
        this.attachTimer = null;
        this.flushAttachWaiters(this.liveContents());
      }, ATTACH_WAIT_MS);
    });
  }

  private flushAttachWaiters(wc: WebContents | null): void {
    if (this.attachTimer) {
      clearTimeout(this.attachTimer);
      this.attachTimer = null;
    }
    const waiters = this.attachWaiters;
    this.attachWaiters = [];
    for (const resolve of waiters) resolve(wc);
  }

  // ---------- 视口 / 可见性 ----------

  setViewport(viewport: BrowserViewport): void {
    this.viewport = {
      width: Math.max(0, Math.round(viewport.width ?? 0)),
      height: Math.max(0, Math.round(viewport.height ?? 0)),
    };
    if (!this.deviceMetricsActive) {
      this.viewportWidth = this.viewport.width || FALLBACK_VIEWPORT_W;
      this.viewportHeight = this.viewport.height || FALLBACK_VIEWPORT_H;
    }
    this.emitState();
  }

  setVisible(visible: boolean): void {
    this.visible = Boolean(visible);
    this.emitState();
  }

  // ---------- 导航 ----------

  /** 等待主文档加载落定（did-stop-loading / fail / 超时）。 */
  private waitForLoadSettle(wc: WebContents, timeoutMs = LOAD_SETTLE_TIMEOUT_MS): Promise<void> {
    return waitForLoadSettle(wc, timeoutMs);
  }

  /**
   * 导航并可选要求 UI 打开面板。
   * `preferBuiltin: true` 时忽略「本地链接走系统浏览器」设置（供 AI 自动化）。
   */
  async navigate(
    url: string,
    options?: { reveal?: boolean; preferBuiltin?: boolean },
  ): Promise<BrowserState> {
    const target = normalizeBrowserUrl(url);
    if (!options?.preferBuiltin && maybeOpenLocalLinkExternally(target)) {
      return this.getState();
    }
    if (options?.reveal !== false) broadcast({ type: "reveal" });
    // reveal:false 是「后台导航」：<webview> 没挂载就没页面可载，不去请求开面板
    const wc = await this.resolveContents(options?.reveal === false ? { wait: false } : {});
    if (!wc) {
      throw new Error(
        "The built-in browser panel is not open. Open the Browser panel (or ask the user to) and retry.",
      );
    }

    // 已在目标页且不在加载：只 reveal，勿再 load（防 UI pendingUrl / 重复工具调用）
    if (browserUrlsEqual(wc.getURL(), target) && !wc.isLoading()) {
      this.emitState();
      return this.getState();
    }

    const seq = ++this.loadSeq;
    if (wc.isLoading()) {
      try {
        wc.stop();
      } catch {
        /* ignore */
      }
      await this.waitForLoadSettle(wc, 2_000);
      if (seq !== this.loadSeq) return this.getState();
    }

    this.lastUrl = target;
    try {
      await wc.loadURL(target);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      // 被后续 navigate stop 掉时常见 ERR_ABORTED
      if (seq !== this.loadSeq || /ERR_ABORTED|\(-3\)/i.test(msg)) {
        return this.getState();
      }
      throw err;
    }
    if (seq !== this.loadSeq) return this.getState();
    await this.waitForLoadSettle(wc);
    this.emitState();
    return this.getState();
  }

  async goBack(): Promise<BrowserState> {
    const wc = await this.resolveContents({ wait: false });
    if (!wc) return this.getState();
    const history = wc.navigationHistory;
    if (history.canGoBack()) {
      const seq = ++this.loadSeq;
      history.goBack();
      await this.waitForLoadSettle(wc);
      if (seq !== this.loadSeq) return this.getState();
      this.syncLastUrl(wc);
    }
    this.emitState();
    return this.getState();
  }

  async goForward(): Promise<BrowserState> {
    const wc = await this.resolveContents({ wait: false });
    if (!wc) return this.getState();
    const history = wc.navigationHistory;
    if (history.canGoForward()) {
      const seq = ++this.loadSeq;
      history.goForward();
      await this.waitForLoadSettle(wc);
      if (seq !== this.loadSeq) return this.getState();
      this.syncLastUrl(wc);
    }
    this.emitState();
    return this.getState();
  }

  async reload(): Promise<BrowserState> {
    const wc = await this.resolveContents({ wait: false });
    if (!wc) return this.getState();
    const seq = ++this.loadSeq;
    wc.reload();
    await this.waitForLoadSettle(wc);
    if (seq !== this.loadSeq) return this.getState();
    this.emitState();
    return this.getState();
  }

  private syncLastUrl(wc: WebContents): void {
    const url = wc.getURL();
    if (url && url !== BROWSER_ABOUT_BLANK) this.lastUrl = url;
  }

  // ---------- AI 锁定 ----------

  async setLocked(locked: boolean): Promise<BrowserState> {
    this.locked = locked;
    // 蒙层现在是渲染层的 DOM（<webview> 之上），主进程只需广播状态 + 请求开面板
    if (locked) broadcast({ type: "reveal" });
    this.emitState();
    return this.getState();
  }

  async takeControl(): Promise<BrowserState> {
    return this.setLocked(false);
  }

  /**
   * 任务结束时交还控制权。
   *
   * 蒙层上没有「接管」按钮（那太像一个必须回答的弹窗），所以必须由 run 结束
   * 兜底解锁 —— 否则模型 lock 之后忘了 unlock，用户就被永久挡在页面外。
   */
  async releaseLock(): Promise<void> {
    if (!this.locked) return;
    await this.setLocked(false);
  }

  // ---------- 自动化 ----------

  /**
   * 自动化动作的前置检查。
   *
   * 面板没开（guest 未挂载）或还停在 about:blank 时立刻报错：对着空白页做快照
   * 没有意义，而 capturePage 在未绘制的页面上可能一直不返回 —— 表现为工具行
   * 一直「进行中」，整个 run 卡死。
   */
  private async requireReady(): Promise<WebContents> {
    const wc = await this.resolveContents({ wait: false });
    if (!wc) {
      throw new Error(
        "The built-in browser panel is not open. Open the Browser panel and call browser_navigate first, then retry.",
      );
    }
    const url = wc.getURL();
    if (!url || url === BROWSER_ABOUT_BLANK) {
      throw new Error(
        "No page is loaded in the built-in browser. Call browser_navigate with a URL first, then retry.",
      );
    }
    return wc;
  }

  private async evalPage<T>(script: string): Promise<T> {
    const wc = await this.requireReady();
    await this.waitForLoadSettle(wc);
    return (await wc.executeJavaScript(script, true)) as T;
  }

  /**
   * 抓一张 PNG；超时 / 空图返回 null。
   * 交互动作里的截图是附赠品，不能因为它失败就让整次调用失败。
   */
  private async capturePng(): Promise<Buffer | null> {
    const wc = await this.requireReady();
    await this.waitForLoadSettle(wc);
    const shot = await Promise.race([
      wc
        .capturePage()
        .then((img) => (img.isEmpty() ? null : img.toPNG()))
        .catch(() => null),
      new Promise<null>((resolve) => setTimeout(() => resolve(null), CAPTURE_TIMEOUT_MS)),
    ]);
    if (!shot) desktopLog("browser").warn("capturePage timed out or empty");
    return shot;
  }

  /** 截图落盘，返回路径。 */
  private writeShot(png: Buffer): string {
    const dir = getCacheDir("browser-screenshots");
    fs.mkdirSync(dir, { recursive: true });
    const file = path.join(dir, `shot-${Date.now()}.png`);
    fs.writeFileSync(file, png);
    return file;
  }

  private async maybeScreenshot(take: boolean | undefined): Promise<string | undefined> {
    if (!take) return undefined;
    const png = await this.capturePng();
    return png ? this.writeShot(png) : undefined;
  }

  async screenshot(): Promise<string> {
    const png = await this.capturePng();
    if (!png) {
      throw new Error(
        "Screenshot failed: the page did not render in time. Open the Browser panel and retry.",
      );
    }
    return this.writeShot(png);
  }

  async resize(width: number, height: number): Promise<BrowserState> {
    const w = Math.max(1, Math.floor(width));
    const h = Math.max(1, Math.floor(height));
    this.viewportWidth = w;
    this.viewportHeight = h;
    this.deviceMetricsActive = true;
    const wc = await this.requireReady();
    try {
      const dbg = wc.debugger;
      if (!dbg.isAttached()) dbg.attach("1.3");
      await dbg.sendCommand("Emulation.setDeviceMetricsOverride", {
        width: w,
        height: h,
        deviceScaleFactor: 1,
        mobile: false,
      });
    } catch {
      // debugger 不可用时仅记录逻辑尺寸
    }
    this.emitState();
    return this.getState();
  }

  /** 处理 agent utility browserRequest。 */
  async handleRequest(req: UtilityBrowserRequest): Promise<{
    output: string;
    screenshotPath?: string;
  }> {
    switch (req.action) {
      case "navigate": {
        if (!req.url?.trim()) throw new Error("url is required");
        const state = await this.navigate(req.url, {
          reveal: req.reveal !== false,
          preferBuiltin: true,
        });
        const shot = await this.maybeScreenshot(req.takeScreenshotAfterwards);
        return {
          output: JSON.stringify({ state }, null, 2),
          screenshotPath: shot,
        };
      }
      case "lock": {
        const state = await this.setLocked(true);
        return { output: JSON.stringify({ state }, null, 2) };
      }
      case "unlock": {
        const state = await this.setLocked(false);
        return { output: JSON.stringify({ state }, null, 2) };
      }
      case "snapshot": {
        const snap = await this.evalPage<{
          url: string;
          title: string;
          yaml: string;
          count: number;
        }>(SNAPSHOT_SCRIPT);
        const shot = await this.maybeScreenshot(req.takeScreenshotAfterwards);
        return {
          output: [
            `url: ${snap.url}`,
            `title: ${snap.title}`,
            `interactive: ${snap.count}`,
            "",
            snap.yaml,
          ].join("\n"),
          screenshotPath: shot,
        };
      }
      case "click": {
        if (!req.ref?.trim()) throw new Error("ref is required");
        const result = await this.evalPage(
          clickScript({
            ref: req.ref,
            doubleClick: req.doubleClick,
            button: req.button,
          }),
        );
        const shot = await this.maybeScreenshot(req.takeScreenshotAfterwards);
        return { output: JSON.stringify(result), screenshotPath: shot };
      }
      case "type": {
        if (!req.ref?.trim()) throw new Error("ref is required");
        if (typeof req.text !== "string") throw new Error("text is required");
        const result = await this.evalPage(typeScript({ ref: req.ref, text: req.text }));
        const shot = await this.maybeScreenshot(req.takeScreenshotAfterwards);
        return { output: JSON.stringify(result), screenshotPath: shot };
      }
      case "fill": {
        if (!req.ref?.trim()) throw new Error("ref is required");
        if (typeof req.value !== "string") throw new Error("value is required");
        const result = await this.evalPage(fillScript({ ref: req.ref, value: req.value }));
        const shot = await this.maybeScreenshot(req.takeScreenshotAfterwards);
        return { output: JSON.stringify(result), screenshotPath: shot };
      }
      case "pressKey": {
        if (!req.key?.trim()) throw new Error("key is required");
        const result = await this.evalPage(pressKeyScript({ key: req.key, ref: req.ref }));
        const shot = await this.maybeScreenshot(req.takeScreenshotAfterwards);
        return { output: JSON.stringify(result), screenshotPath: shot };
      }
      case "scroll": {
        const result = await this.evalPage(
          scrollScript({
            ref: req.ref,
            direction: req.direction,
            amount: req.amount,
            scrollIntoView: req.scrollIntoView,
          }),
        );
        const shot = await this.maybeScreenshot(req.takeScreenshotAfterwards);
        return { output: JSON.stringify(result), screenshotPath: shot };
      }
      case "evaluate": {
        if (!req.script?.trim()) throw new Error("script is required");
        const result = await this.evalPage(req.script);
        let output: string;
        try {
          output = JSON.stringify(result, null, 2);
        } catch {
          output = String(result);
        }
        const shot = await this.maybeScreenshot(req.takeScreenshotAfterwards);
        return { output, screenshotPath: shot };
      }
      case "resize": {
        if (typeof req.width !== "number" || typeof req.height !== "number") {
          throw new Error("width and height are required");
        }
        const state = await this.resize(req.width, req.height);
        return { output: JSON.stringify({ state }, null, 2) };
      }
      case "getStyles": {
        const result = await this.evalPage(
          getStylesScript({
            ref: req.ref,
            selector: req.selector,
            properties: req.properties,
          }),
        );
        return { output: JSON.stringify(result, null, 2) };
      }
      case "screenshot": {
        const screenshotPath = await this.screenshot();
        return {
          output: `screenshotPath: ${screenshotPath}`,
          screenshotPath,
        };
      }
      default:
        throw new Error(`Unknown browser action: ${(req as { action: string }).action}`);
    }
  }

  /** 主窗销毁时清理。 */
  dispose(): void {
    this.unbind();
    this.wc = null;
    this.visible = false;
    this.locked = false;
    this.loadSeq = 0;
    this.lastUrl = BROWSER_ABOUT_BLANK;
    this.flushAttachWaiters(null);
  }
}

/** WebContents 事件名 → 处理器参数类型（仅取用得到的几个）。 */
type WebContentsEventMap = {
  "did-start-loading": () => void;
  "did-stop-loading": () => void;
  "page-title-updated": () => void;
  "did-navigate": () => void;
  "did-navigate-in-page": () => void;
  "did-fail-load": (
    _e: unknown,
    code: number,
    desc: string,
    url: string,
    isMainFrame: boolean,
  ) => void;
};

export const browserSessionManager = new BrowserSessionManager();
