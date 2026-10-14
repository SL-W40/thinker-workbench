/**
 * 主窗复用判定（与 Electron 解耦，便于单测）。
 *
 * createWindow / second-instance / activate 都可能并发调用；
 * 已有存活主窗时只聚焦，避免叠出第二个空窗。
 */
import type { BrowserWindow } from "electron";

/** 聚焦已有主窗时用到的最小接口。 */
export type ReusableMainWindow = Pick<
  BrowserWindow,
  "isDestroyed" | "isMinimized" | "restore" | "show" | "focus"
>;

/**
 * 若 `current` 仍存活则 restore/show/focus 并返回它；否则返回 null（调用方应新建）。
 */
export function reuseMainWindowIfAlive(
  current: ReusableMainWindow | null | undefined,
): ReusableMainWindow | null {
  if (!current || current.isDestroyed()) return null;
  if (current.isMinimized()) current.restore();
  current.show();
  current.focus();
  return current;
}
