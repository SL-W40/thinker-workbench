/**
 * 窗口边框选项。
 * - macOS：系统 traffic lights（hiddenInset），勿画自定义缩小关闭放大
 * - Windows：隐藏标题文字，保留系统最小化 / 最大化 / 关闭；按钮区透明，底色交给标题栏
 * - 其它平台：完全无边框，由渲染进程画窗口控件
 */
import type { BrowserWindow, BrowserWindowConstructorOptions } from "electron";
import { getGeneralSettings } from "../config/settingsStore";
import {
  titleBarOverlayForTheme,
  windowBackgroundForTheme,
  windowButtonPositionForFontScale,
} from "./themeBackground";

/** 主窗 / 辅助窗共用的原生窗口边框选项。 */
export function windowChromeOptions(): Pick<
  BrowserWindowConstructorOptions,
  "frame" | "titleBarStyle" | "titleBarOverlay" | "trafficLightPosition"
> {
  if (process.platform === "darwin") {
    const { uiFontScale } = getGeneralSettings();
    return {
      titleBarStyle: "hiddenInset",
      trafficLightPosition: windowButtonPositionForFontScale(uiFontScale),
    };
  }
  if (process.platform === "win32") {
    return {
      titleBarStyle: "hidden",
      titleBarOverlay: titleBarOverlayForTheme(),
    };
  }
  return { frame: false };
}

/** 把窗口底色、mac 红绿灯位置和（Windows）系统按钮区刷成当前设置。 */
export function syncBrowserWindowChrome(target: BrowserWindow): void {
  if (target.isDestroyed()) return;
  target.setBackgroundColor(windowBackgroundForTheme());
  if (process.platform === "darwin") {
    // 字体档位改变标题栏高度，灯位跟着重算（macOS 专有实例方法，内部会立即 redraw）
    target.setWindowButtonPosition(
      windowButtonPositionForFontScale(getGeneralSettings().uiFontScale),
    );
    return;
  }
  if (process.platform !== "win32") return;
  target.setTitleBarOverlay(titleBarOverlayForTheme());
}
