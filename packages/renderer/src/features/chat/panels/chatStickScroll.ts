/**
 * 聊天列表「贴底跟随」工具。
 *
 * 约定：
 * - 靠近底部 → 贴底，新内容自动跟上
 * - 用户上翻 → 解绑，绝不抢滚动 / 打断划词
 * - 发送、切会话、点「回到最新」→ 强制贴底
 */

/** 距底小于等于该像素视为「仍在底部」。 */
export const STICK_BOTTOM_THRESHOLD_PX = 80;

/** 距底部的像素距离（越小越靠近底）。 */
export function distanceFromBottom(el: HTMLElement): number {
  return el.scrollHeight - el.scrollTop - el.clientHeight;
}

/** 是否仍贴在底部附近。 */
export function isNearBottom(el: HTMLElement, thresholdPx = STICK_BOTTOM_THRESHOLD_PX): boolean {
  return distanceFromBottom(el) <= thresholdPx;
}

/** 舞台内是否有未折叠的文本选区（划词时勿抢滚动）。 */
export function hasTextSelectionIn(el: HTMLElement): boolean {
  const sel = window.getSelection();
  if (!sel || sel.isCollapsed || sel.rangeCount === 0) return false;
  const node = sel.anchorNode;
  return Boolean(node && el.contains(node));
}

/** 滚到内容最底；默认 instant，避免流式时 smooth 连动画。 */
export function scrollElementToBottom(el: HTMLElement, behavior: ScrollBehavior = "auto"): void {
  el.scrollTo({ top: el.scrollHeight, behavior });
}

/**
 * 仅在贴底且无划词时跟随到底。
 * @returns 是否执行了滚动
 */
export function scrollToBottomIfStuck(
  el: HTMLElement,
  stuck: boolean,
  behavior: ScrollBehavior = "auto",
): boolean {
  if (!stuck) return false;
  if (hasTextSelectionIn(el)) return false;
  scrollElementToBottom(el, behavior);
  return true;
}
