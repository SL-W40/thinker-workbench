/**
 * 各 webContents 是否处于快捷键录制中。
 * 录制时 before-input 应跳过 reload 等主进程快捷键，把按键留给渲染进程录制器。
 */

const recordingContents = new Set<number>();

/** 标记某 webContents 进入 / 退出录制。 */
export function setShortcutRecording(contentsId: number, active: boolean): void {
  if (active) recordingContents.add(contentsId);
  else recordingContents.delete(contentsId);
}

/** 该 webContents 是否正在录制快捷键。 */
export function isShortcutRecording(contentsId: number): boolean {
  return recordingContents.has(contentsId);
}

/** 窗口销毁时清理，避免泄漏。 */
export function clearShortcutRecording(contentsId: number): void {
  recordingContents.delete(contentsId);
}
