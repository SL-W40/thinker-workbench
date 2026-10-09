/**
 * 快捷键录制门闩：录制中全局快捷键（含主进程 reload）不得触发。
 */

let active = false;

/** 当前是否正在录制快捷键。 */
export function isShortcutRecording(): boolean {
  return active;
}

/**
 * 进入 / 退出录制；同步通知主进程（若有 preload）。
 */
export function setShortcutRecording(next: boolean): void {
  if (active === next) return;
  active = next;
  window.thinker?.settings?.setShortcutRecording?.(next);
}
