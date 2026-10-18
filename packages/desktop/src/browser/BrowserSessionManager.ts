/**
 * 内置浏览器：主窗口 WebContentsView + AI 锁定蒙层 + 自动化动作。
 *
 * 设计要点（参考 Cursor WebviewBrowserManager，不照搬）：
 * - reveal 只“请求”渲染层开面板；可见性（visible）只由渲染层 setVisible 驱动
 * - 挂载不变式：attached ⇔ visible 且非空白页（锁定时例外）；
 *   不可见 / 空白时一律 removeChildView——0×0 或离屏占位都会吞掉该区域输入，
 *   曾导致切 tab / 切页面后那块区域点击滑动失灵
 * - 同 URL 且已落定则跳过 loadURL
 * - 导航中再次 navigate 则 stop 后换目标；动作前等待加载落定
 * - UI 尚未上报 bounds 时用离屏占位尺寸，保证截图可用
 */
import fs from "node:fs";
import path from "node:path";
import {
  BROWSER_ABOUT_BLANK,
  type BrowserBounds,
  type BrowserEvent,
  type BrowserState,
  browserUrlsEqual,
  IpcChannels,
  normalizeBrowserUrl,
  resolveVisualThemeId,
  type UtilityBrowserRequest,
} from "@thinker-workbench/shared";
import { BrowserWindow, nativeTheme, session, type WebContents, WebContentsView } from "electron";
import { getDataDir } from "../config/paths";
import { getGeneralSettings } from "../config/settingsStore";
import { desktopLog } from "../log/setup";
import { getMainWindow } from "../window/createWindow";
import { maybeOpenLocalLinkExternally } from "./localLinks";
import { buildOverlayDataUrl, overlayTokensForVisual } from "./overlayHtml";
import {
  clickScript,
  fillScript,
  getStylesScript,
  pressKeyScript,
  SNAPSHOT_SCRIPT,
  scrollScript,
  typeScript,
} from "./pageScripts";

const PARTITION = "persist:thinker-browser";
/** UI 未量洞前的离屏占位（CSS px）。 */
const FALLBACK_VIEWPORT_W = 1280;
const FALLBACK_VIEWPORT_H = 720;
/** 等待主文档加载落定的上限。 */
const LOAD_SETTLE_TIMEOUT_MS = 30_000;

function broadcast(event: BrowserEvent): void {
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed()) {
      win.webContents.send(IpcChannels.browserEvent, event);
    }
  }
}

class BrowserSessionManager {
  private view: WebContentsView | null = null;
  private overlay: WebContentsView | null = null;
  private attached = false;
  private overlayAttached = false;
  private visible = false;
  private locked = false;
  private bounds: BrowserBounds = { x: 0, y: 0, width: 0, height: 0 };
  private viewportWidth = 0;
  private viewportHeight = 0;
  private loading = false;
  private deviceMetricsActive = false;
  private overlayConsoleBound = false;
  /** 导航世代：并发 navigate 时旧 load 结果作废。 */
  private loadSeq = 0;

  /** 当前状态快照。 */
  getState(): BrowserState {
    const wc = this.view?.webContents;
    return {
      url: wc && !wc.isDestroyed() ? wc.getURL() : BROWSER_ABOUT_BLANK,
      title: wc && !wc.isDestroyed() ? wc.getTitle() : "",
      loading: this.loading,
      canGoBack: Boolean(wc && !wc.isDestroyed() && wc.navigationHistory.canGoBack()),
      canGoForward: Boolean(wc && !wc.isDestroyed() && wc.navigationHistory.canGoForward()),
      locked: this.locked,
      visible: this.visible && this.bounds.width > 0 && this.bounds.height > 0,
      viewportWidth: this.viewportWidth || this.bounds.width || FALLBACK_VIEWPORT_W,
      viewportHeight: this.viewportHeight || this.bounds.height || FALLBACK_VIEWPORT_H,
    };
  }

  private emitState(): void {
    broadcast({ type: "state", state: this.getState() });
  }

  private requireMainWindow(): NonNullable<ReturnType<typeof getMainWindow>> {
    const win = getMainWindow();
    if (!win || win.isDestroyed()) {
      throw new Error(
        "Built-in browser is unavailable (main window not ready). Open the app window and retry.",
      );
    }
    return win;
  }

  /** 确保页面 view 已创建；**仅可见时挂载**（不可见时挂载会吞掉该区域的输入）。 */
  private ensureView(): WebContentsView {
    const win = this.requireMainWindow();
    if (!this.view) {
      const ses = session.fromPartition(PARTITION);
      this.view = new WebContentsView({
        webPreferences: {
          session: ses,
          contextIsolation: true,
          nodeIntegration: false,
          sandbox: true,
          javascript: true,
        },
      });
      this.view.setBackgroundColor("#ffffff");
      const wc = this.view.webContents;
      wc.setWindowOpenHandler(({ url }) => {
        void this.navigate(url, { reveal: true });
        return { action: "deny" };
      });
      wc.on("did-start-loading", () => {
        this.loading = true;
        // URL 已切换：按新的空白/非空白状态决定挂载
        this.applyBounds();
        this.emitState();
      });
      wc.on("did-stop-loading", () => {
        this.loading = false;
        this.applyBounds();
        this.emitState();
      });
      wc.on("page-title-updated", () => this.emitState());
      wc.on("did-navigate", () => {
        this.applyBounds();
        this.emitState();
      });
      wc.on("did-navigate-in-page", () => {
        this.applyBounds();
        this.emitState();
      });
      wc.on("did-fail-load", (_e, code, desc, url, isMainFrame) => {
        if (!isMainFrame) return;
        this.loading = false;
        broadcast({
          type: "error",
          message: `Failed to load (${code}): ${desc} — ${url}`,
        });
        this.emitState();
      });
    }
    // 挂载严格跟随 visible：agent 的 snapshot / screenshot / navigate(reveal:false)
    // 在面板关闭时也必须保持摘除，否则会盖住当前 tab 吞掉点击与滚轮
    if (this.visible && !this.attached) {
      win.contentView.addChildView(this.view);
      this.attached = true;
      desktopLog("browser").info("view attached");
    }
    return this.view;
  }

  /**
   * 不可见时为截图 / 求值准备离屏绘制面：只设 bounds、不挂载。
   * （挂载的 view 即使离屏/0×0 也可能吞输入；capturePage 对未挂载 view 有效。）
   */
  private ensureCaptureSurface(): void {
    const view = this.view;
    if (!view) return;
    if (this.visible) {
      this.applyBounds();
      return;
    }
    const width = this.bounds.width >= 2 ? this.bounds.width : FALLBACK_VIEWPORT_W;
    const height = this.bounds.height >= 2 ? this.bounds.height : FALLBACK_VIEWPORT_H;
    view.setBounds({ x: -10_000, y: -10_000, width, height });
  }

  private overlayCopy(): { title: string; takeControl: string } {
    const locale = getGeneralSettings().uiLocale;
    if (locale === "zh") {
      return { title: "AI 控制中", takeControl: "接管" };
    }
    return { title: "AI is controlling", takeControl: "Take control" };
  }

  private ensureOverlay(): WebContentsView {
    const win = this.requireMainWindow();
    if (!this.overlay) {
      this.overlay = new WebContentsView({
        webPreferences: {
          contextIsolation: true,
          nodeIntegration: false,
          sandbox: true,
        },
      });
      this.overlay.setBackgroundColor("#00000000");
      this.overlay.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
    }
    // 蒙层同样只跟随 visible 挂载：透明蒙层挂在不可见面板上会成为“隐形点击黑洞”
    if (!this.visible) return this.overlay;
    if (!this.overlayAttached) {
      win.contentView.addChildView(this.overlay);
      this.overlayAttached = true;
    } else {
      // 重新置顶
      win.contentView.removeChildView(this.overlay);
      win.contentView.addChildView(this.overlay);
    }
    return this.overlay;
  }

  private async loadOverlayHtml(): Promise<void> {
    const overlay = this.ensureOverlay();
    const general = getGeneralSettings();
    const visual = resolveVisualThemeId(general.uiTheme, nativeTheme.shouldUseDarkColors);
    const tokens = overlayTokensForVisual(String(visual), general.customThemes);
    const copy = this.overlayCopy();
    const url = buildOverlayDataUrl({ tokens, ...copy });
    await overlay.webContents.loadURL(url);
    if (!this.overlayConsoleBound) {
      this.overlayConsoleBound = true;
      overlay.webContents.on("console-message", (_e, _level, message) => {
        if (String(message).includes("__TW_BROWSER_TAKE_CONTROL__")) {
          void this.takeControl();
        }
      });
    }
    await overlay.webContents.executeJavaScript(`
      window.takeControl = () => { console.log('__TW_BROWSER_TAKE_CONTROL__'); };
    `);
  }

  /** 当前是否空白页（无实际内容）：空白时不挂载，占位符区域保持可交互。 */
  private isBlankPage(): boolean {
    const wc = this.view?.webContents;
    if (!wc || wc.isDestroyed()) return true;
    const url = wc.getURL();
    return !url || url === BROWSER_ABOUT_BLANK;
  }

  private applyBounds(): void {
    // 不可见或空白页（未锁定时）= 必须摘除：0×0 / 离屏占位都不能可靠停止吞输入，
    // 这是“切 tab / 关面板后该区域点击滑动失灵”的根因。
    // 锁定时空白页也挂载：蒙层“AI 控制中”本就是模态盖层
    if (!this.visible || (this.isBlankPage() && !this.locked)) {
      this.detachViews();
      return;
    }
    const measured = this.bounds.width >= 2 && this.bounds.height >= 2;
    if (this.view) {
      if (measured) {
        this.view.setBounds({ ...this.bounds });
      } else {
        // AI 已 reveal 但洞尚未量到：离屏占位，避免 0×0 截图空白与布局抖动
        this.view.setBounds({
          x: -10_000,
          y: -10_000,
          width: FALLBACK_VIEWPORT_W,
          height: FALLBACK_VIEWPORT_H,
        });
      }
    }
    if (this.overlay) {
      if (this.locked && this.visible && measured) {
        this.overlay.setBounds({ ...this.bounds });
      } else {
        this.overlay.setBounds({ x: 0, y: 0, width: 0, height: 0 });
      }
    }
  }

  /** 同步视口洞 bounds（DIP）。 */
  setBounds(bounds: BrowserBounds): void {
    this.bounds = {
      x: Math.round(bounds.x),
      y: Math.round(bounds.y),
      width: Math.max(0, Math.round(bounds.width)),
      height: Math.max(0, Math.round(bounds.height)),
    };
    if (!this.deviceMetricsActive) {
      this.viewportWidth = this.bounds.width || FALLBACK_VIEWPORT_W;
      this.viewportHeight = this.bounds.height || FALLBACK_VIEWPORT_H;
    }
    if (this.visible) this.ensureView();
    this.applyBounds();
    this.emitState();
  }

  /** 显示 / 隐藏（切 tab 或关右侧栏）。 */
  setVisible(visible: boolean): void {
    this.visible = visible;
    if (visible) {
      this.ensureView();
    } else {
      // 必须真正摘除子 view：仅置 0×0 bounds 时，已加载内容的 view 仍会
      // 残留最后一帧绘制，关面板后盖住聊天内容
      this.detachViews();
    }
    this.applyBounds();
    this.emitState();
  }

  /** 摘除浏览器 view 与 AI 控制浮层（WebContents 保留，重新显示时原样恢复）。 */
  private detachViews(): void {
    const win = getMainWindow();
    if (!win || win.isDestroyed()) return;
    let removed = false;
    if (this.attached && this.view) {
      try {
        win.contentView.removeChildView(this.view);
        removed = true;
      } catch {
        /* view 可能已随窗口销毁 */
      }
      this.attached = false;
    }
    if (this.overlayAttached && this.overlay) {
      try {
        win.contentView.removeChildView(this.overlay);
        removed = true;
      } catch {
        /* overlay 可能已随窗口销毁 */
      }
      this.overlayAttached = false;
    }
    if (removed) desktopLog("browser").info("views detached");
  }

  /**
   * 等待主文档加载落定（did-stop-loading / fail / 超时）。
   * 已不在 loading 则立即返回。
   */
  private waitForLoadSettle(wc: WebContents, timeoutMs = LOAD_SETTLE_TIMEOUT_MS): Promise<void> {
    if (wc.isDestroyed() || !wc.isLoading()) return Promise.resolve();
    return new Promise((resolve) => {
      let settled = false;
      const finish = () => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        wc.removeListener("did-stop-loading", onStop);
        wc.removeListener("did-fail-load", onFail);
        resolve();
      };
      const onStop = () => finish();
      const onFail = (
        _e: Electron.Event,
        _code: number,
        _desc: string,
        _url: string,
        isMainFrame: boolean,
      ) => {
        if (isMainFrame) finish();
      };
      const timer = setTimeout(finish, timeoutMs);
      wc.once("did-stop-loading", onStop);
      wc.once("did-fail-load", onFail);
    });
  }

  /**
   * 导航并可选要求 UI 打开面板。
   * `preferBuiltin: true` 时忽略「本地链接走系统浏览器」设置（供 AI 自动化）。
   * reveal 不带 url：主进程已 load，renderer 只开 tab，避免再次 navigate 死循环。
   */
  async navigate(
    url: string,
    options?: { reveal?: boolean; preferBuiltin?: boolean },
  ): Promise<BrowserState> {
    const target = normalizeBrowserUrl(url);
    if (!options?.preferBuiltin && maybeOpenLocalLinkExternally(target)) {
      return this.getState();
    }
    const view = this.ensureView();
    const wc = view.webContents;

    if (options?.reveal !== false) {
      // 只“请求”渲染层开面板：可见性由渲染层 setVisible 驱动。
      // 主进程擅自置 visible=true 会在用户已切走（聊天页卸载）时把 view
      // 贴回窗口，盖住当前页面吞掉输入
      broadcast({ type: "reveal" });
    }
    this.applyBounds();

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
    const view = this.ensureView();
    const history = view.webContents.navigationHistory;
    if (history.canGoBack()) {
      const seq = ++this.loadSeq;
      history.goBack();
      await this.waitForLoadSettle(view.webContents);
      if (seq !== this.loadSeq) return this.getState();
    }
    this.emitState();
    return this.getState();
  }

  async goForward(): Promise<BrowserState> {
    const view = this.ensureView();
    const history = view.webContents.navigationHistory;
    if (history.canGoForward()) {
      const seq = ++this.loadSeq;
      history.goForward();
      await this.waitForLoadSettle(view.webContents);
      if (seq !== this.loadSeq) return this.getState();
    }
    this.emitState();
    return this.getState();
  }

  async reload(): Promise<BrowserState> {
    const view = this.ensureView();
    const seq = ++this.loadSeq;
    view.webContents.reload();
    await this.waitForLoadSettle(view.webContents);
    if (seq !== this.loadSeq) return this.getState();
    this.emitState();
    return this.getState();
  }

  async setLocked(locked: boolean): Promise<BrowserState> {
    this.locked = locked;
    if (locked) {
      // 同 navigate：只请求渲染层开面板，不擅自置 visible
      this.ensureView();
      await this.loadOverlayHtml();
    }
    this.applyBounds();
    if (locked) broadcast({ type: "reveal" });
    this.emitState();
    return this.getState();
  }

  async takeControl(): Promise<BrowserState> {
    return this.setLocked(false);
  }

  /** 主题变更时刷新蒙层配色。 */
  async refreshOverlayTheme(): Promise<void> {
    if (this.locked && this.overlay) {
      await this.loadOverlayHtml();
      this.applyBounds();
    }
  }

  private async evalPage<T>(script: string): Promise<T> {
    const view = this.ensureView();
    await this.waitForLoadSettle(view.webContents);
    // 离屏绘制面：不挂载也能执行 / 捕获，避免盖住当前界面
    this.ensureCaptureSurface();
    return (await view.webContents.executeJavaScript(script, true)) as T;
  }

  private async maybeScreenshot(take: boolean | undefined): Promise<string | undefined> {
    if (!take) return undefined;
    return this.screenshot();
  }

  async screenshot(): Promise<string> {
    const view = this.ensureView();
    await this.waitForLoadSettle(view.webContents);
    // 确保有非零绘制面（离屏，不挂载）
    this.ensureCaptureSurface();
    const img = await view.webContents.capturePage();
    const dir = path.join(getDataDir(), "browser-screenshots");
    fs.mkdirSync(dir, { recursive: true });
    const file = path.join(dir, `shot-${Date.now()}.png`);
    fs.writeFileSync(file, img.toPNG());
    return file;
  }

  async resize(width: number, height: number): Promise<BrowserState> {
    const w = Math.max(1, Math.floor(width));
    const h = Math.max(1, Math.floor(height));
    this.viewportWidth = w;
    this.viewportHeight = h;
    this.deviceMetricsActive = true;
    const view = this.ensureView();
    this.ensureCaptureSurface();
    try {
      const dbg = view.webContents.debugger;
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
    const win = getMainWindow();
    if (this.overlay) {
      try {
        if (win && !win.isDestroyed()) win.contentView.removeChildView(this.overlay);
      } catch {
        /* ignore */
      }
      try {
        this.overlay.webContents.close();
      } catch {
        /* ignore */
      }
      this.overlay = null;
    }
    if (this.view) {
      try {
        if (win && !win.isDestroyed()) win.contentView.removeChildView(this.view);
      } catch {
        /* ignore */
      }
      try {
        this.view.webContents.close();
      } catch {
        /* ignore */
      }
      this.view = null;
    }
    this.attached = false;
    this.overlayAttached = false;
    this.visible = false;
    this.locked = false;
    this.loadSeq = 0;
  }
}

export const browserSessionManager = new BrowserSessionManager();
