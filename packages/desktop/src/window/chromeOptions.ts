/**
 * 窗口边框选项。
 * - macOS：系统 traffic lights（hiddenInset），勿画自定义缩小关闭放大
 * - Windows：隐藏标题文字，保留系统最小化 / 最大化 / 关闭；按钮区透明，底色交给标题栏
 * - 其它平台：完全无边框，由渲染进程画窗口控件
 */
import type { BrowserWindow, BrowserWindowConstructorOptions } from "electron";
import { titleBarOverlayForTheme, windowBackgroundForTheme } from "./themeBackground";

/** 与渲染进程 `.titlebar` 高度（44px）对齐的红绿灯位置。 */
const MAC_TRAFFIC_LIGHT = { x: 14, y: 14 } as const;

/** 主窗 / 辅助窗共用的原生窗口边框选项。 */
export function windowChromeOptions(): Pick<
  BrowserWindowConstructorOptions,
  "frame" | "titleBarStyle" | "titleBarOverlay" | "trafficLightPosition"
> {
  if (process.platform === "darwin") {
    return {
      titleBarStyle: "hiddenInset",
      trafficLightPosition: { ...MAC_TRAFFIC_LIGHT },
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

/** 把窗口底色和（Windows）系统按钮区刷成当前主题。 */
export function syncBrowserWindowChrome(target: BrowserWindow): void {
  if (target.isDestroyed()) return;
  target.setBackgroundColor(windowBackgroundForTheme());
  if (process.platform !== "win32") return;
  target.setTitleBarOverlay(titleBarOverlayForTheme());
}
