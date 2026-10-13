/**
 * 无边框 / 自定义标题栏的 BrowserWindow 选项。
 * - macOS：系统 traffic lights（hiddenInset），勿画自定义缩小关闭放大
 * - 其它平台：完全无边框，由渲染进程画窗口控件
 */
import type { BrowserWindowConstructorOptions } from "electron";

/** 与渲染进程 `.titlebar` 高度（44px）对齐的红绿灯位置。 */
const MAC_TRAFFIC_LIGHT = { x: 14, y: 14 } as const;

/** 主窗 / 辅助窗共用的原生窗口边框选项。 */
export function windowChromeOptions(): Pick<
  BrowserWindowConstructorOptions,
  "frame" | "titleBarStyle" | "trafficLightPosition"
> {
  if (process.platform === "darwin") {
    return {
      titleBarStyle: "hiddenInset",
      trafficLightPosition: { ...MAC_TRAFFIC_LIGHT },
    };
  }
  return { frame: false };
}
