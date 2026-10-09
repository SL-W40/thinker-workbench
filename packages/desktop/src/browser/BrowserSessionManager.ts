/**
 * 内置浏览器：主窗口 WebContentsView + AI 锁定蒙层 + 自动化动作。
 */
import fs from "node:fs";
import path from "node:path";
import {
  IpcChannels,
  resolveVisualThemeId,
  type BrowserBounds,
  type BrowserEvent,
  type BrowserState,
  type UtilityBrowserRequest,
} from "@thinker-workbench/shared";
import { BrowserWindow, WebContentsView, nativeTheme, session } from "electron";
import { getDataDir } from "../config/paths";
import { getGeneralSettings } from "../config/settingsStore";
import { getMainWindow } from "../window/createWindow";
import { buildOverlayDataUrl, overlayTokensForVisual } from "./overlayHtml";
import {
  SNAPSHOT_SCRIPT,
  clickScript,
  fillScript,
  getStylesScript,
  pressKeyScript,
  scrollScript,
  typeScript,
} from "./pageScripts";

const PARTITION = "persist:thinker-browser";
const ABOUT_BLANK = "about:blank";

function broadcast(event: BrowserEvent): void {
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed()) {
      win.webContents.send(IpcChannels.browserEvent, event);
    }
  }
}

function normalizeUrl(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return ABOUT_BLANK;
  if (/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(trimmed)) return trimmed;
  return `https://${trimmed}`;
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

  /** 当前状态快照。 */
  getState(): BrowserState {
    const wc = this.view?.webContents;
    return {
      url: wc && !wc.isDestroyed() ? wc.getURL() : ABOUT_BLANK,
      title: wc && !wc.isDestroyed() ? wc.getTitle() : "",
      loading: this.loading,
      canGoBack: Boolean(wc && !wc.isDestroyed() && wc.canGoBack()),
      canGoForward: Boolean(wc && !wc.isDestroyed() && wc.canGoForward()),
      locked: this.locked,
      visible: this.visible && this.bounds.width > 0 && this.bounds.height > 0,
      viewportWidth: this.viewportWidth || this.bounds.width,
      viewportHeight: this.viewportHeight || this.bounds.height,
    };
  }

  private emitState(): void {
    broadcast({ type: "state", state: this.getState() });
  }

  /** 确保页面 view 已创建并挂到主窗。 */
  private ensureView(): WebContentsView {
    const win = getMainWindow();
    if (!win || win.isDestroyed()) {
      throw new Error("Main window is not available.");
    }
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
        this.emitState();
      });
      wc.on("did-stop-loading", () => {
        this.loading = false;
        this.emitState();
      });
      wc.on("page-title-updated", () => this.emitState());
      wc.on("did-navigate", () => this.emitState());
      wc.on("did-navigate-in-page", () => this.emitState());
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
    if (!this.attached) {
      win.contentView.addChildView(this.view);
      this.attached = true;
    }
    return this.view;
  }

  private overlayCopy(): { title: string; takeControl: string } {
    const locale = getGeneralSettings().uiLocale;
    if (locale === "zh") {
      return { title: "AI 控制中", takeControl: "接管" };
    }
    return { title: "AI is controlling", takeControl: "Take control" };
  }

  private ensureOverlay(): WebContentsView {
    const win = getMainWindow();
    if (!win || win.isDestroyed()) {
      throw new Error("Main window is not available.");
    }
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
    const visual = resolveVisualThemeId(
      general.uiTheme,
      nativeTheme.shouldUseDarkColors,
    );
    const tokens = overlayTokensForVisual(String(visual));
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

  private applyBounds(): void {
    const empty =
      !this.visible || this.bounds.width < 2 || this.bounds.height < 2;
    if (this.view) {
      this.view.setBounds(
        empty
          ? { x: 0, y: 0, width: 0, height: 0 }
          : { ...this.bounds },
      );
    }
    if (this.overlay) {
      if (this.locked && !empty) {
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
      this.viewportWidth = this.bounds.width;
      this.viewportHeight = this.bounds.height;
    }
    if (this.visible) this.ensureView();
    this.applyBounds();
    this.emitState();
  }

  /** 显示 / 隐藏（切 tab 或关右侧栏）。 */
  setVisible(visible: boolean): void {
    this.visible = visible;
    if (visible) this.ensureView();
    this.applyBounds();
    this.emitState();
  }

  /** 导航并可选要求 UI 打开面板。 */
  async navigate(
    url: string,
    options?: { reveal?: boolean },
  ): Promise<BrowserState> {
    const view = this.ensureView();
    const target = normalizeUrl(url);
    if (options?.reveal !== false) {
      broadcast({ type: "reveal", url: target });
    }
    this.visible = true;
    this.applyBounds();
    await view.webContents.loadURL(target);
    this.emitState();
    return this.getState();
  }

  async goBack(): Promise<BrowserState> {
    const view = this.ensureView();
    if (view.webContents.canGoBack()) view.webContents.goBack();
    this.emitState();
    return this.getState();
  }

  async goForward(): Promise<BrowserState> {
    const view = this.ensureView();
    if (view.webContents.canGoForward()) view.webContents.goForward();
    this.emitState();
    return this.getState();
  }

  async reload(): Promise<BrowserState> {
    const view = this.ensureView();
    view.webContents.reload();
    this.emitState();
    return this.getState();
  }

  async setLocked(locked: boolean): Promise<BrowserState> {
    this.locked = locked;
    if (locked) {
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
    return (await view.webContents.executeJavaScript(script, true)) as T;
  }

  private async maybeScreenshot(
    take: boolean | undefined,
  ): Promise<string | undefined> {
    if (!take) return undefined;
    return this.screenshot();
  }

  async screenshot(): Promise<string> {
    const view = this.ensureView();
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
        const result = await this.evalPage(
          typeScript({ ref: req.ref, text: req.text }),
        );
        const shot = await this.maybeScreenshot(req.takeScreenshotAfterwards);
        return { output: JSON.stringify(result), screenshotPath: shot };
      }
      case "fill": {
        if (!req.ref?.trim()) throw new Error("ref is required");
        if (typeof req.value !== "string") throw new Error("value is required");
        const result = await this.evalPage(
          fillScript({ ref: req.ref, value: req.value }),
        );
        const shot = await this.maybeScreenshot(req.takeScreenshotAfterwards);
        return { output: JSON.stringify(result), screenshotPath: shot };
      }
      case "pressKey": {
        if (!req.key?.trim()) throw new Error("key is required");
        const result = await this.evalPage(
          pressKeyScript({ key: req.key, ref: req.ref }),
        );
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
        throw new Error(
          `Unknown browser action: ${(req as { action: string }).action}`,
        );
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
  }
}

export const browserSessionManager = new BrowserSessionManager();
