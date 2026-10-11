/**
 * 运行错误归类（desktop / renderer / engine 共用文案判定）。
 */

/** 文案是否表示用户取消或 AbortSignal（含 fetch aborted）。 */
export function isCancelErrorMessage(message: string): boolean {
  const t = message.trim();
  if (!t) return false;
  return (
    /cancel/i.test(t) ||
    /\baborted\b/i.test(t) ||
    /^Stopped\.?$/i.test(t) ||
    /^已停止[。.]?$/.test(t)
  );
}
