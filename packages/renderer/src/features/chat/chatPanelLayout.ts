/**
 * 聊天左右侧栏与中间主区宽度分配：保证 chat-main 不被侧栏挤没。
 * 布局契约：`left + main + right === shellWidth`（关闭的侧栏按 0 计）。
 */

/** 中间聊天列最小宽度（px）。 */
export const MIN_CHAT_MAIN_WIDTH = 360;

/** 预留空隙，避免 border / 亚像素取整后总宽略超壳宽。 */
export const CHAT_LAYOUT_SLACK_PX = 4;

export type FitChatPanelWidthsInput = {
  shellWidth: number;
  leftOpen: boolean;
  rightOpen: boolean;
  leftWidth: number;
  rightWidth: number;
  minLeft: number;
  maxLeft: number;
  minRight: number;
  maxRight: number;
  minChat?: number;
  slack?: number;
};

/** 将 n 钳到 [min, max] 并取整；若 max&lt;min 则落在 max。 */
export function clampPanelWidth(n: number, min: number, max: number): number {
  if (max < min) return Math.round(max);
  return Math.min(max, Math.max(min, Math.round(n)));
}

/** 有效下限：空间不够时不超过动态上限。 */
export function effectivePanelMinWidth(minWidth: number, maxWidth: number): number {
  return Math.min(minWidth, maxWidth);
}

/**
 * 中间列实宽。shellWidth≤0 时返回 0（尚未量到壳宽）。
 */
export function allocateMainWidth(input: {
  shellWidth: number;
  leftOpen: boolean;
  rightOpen: boolean;
  leftWidth: number;
  rightWidth: number;
}): number {
  if (input.shellWidth <= 0) return 0;
  const left = input.leftOpen ? Math.max(0, Math.round(input.leftWidth)) : 0;
  const right = input.rightOpen ? Math.max(0, Math.round(input.rightWidth)) : 0;
  return Math.max(0, Math.round(input.shellWidth) - left - right);
}

/**
 * 在壳宽不足时优先压缩右侧、再左侧，为聊天列留出 `minChat + slack`。
 */
export function fitChatPanelWidths(input: FitChatPanelWidthsInput): {
  leftWidth: number;
  rightWidth: number;
} {
  const minChat = input.minChat ?? MIN_CHAT_MAIN_WIDTH;
  const slack = input.slack ?? CHAT_LAYOUT_SLACK_PX;
  let left = clampPanelWidth(input.leftWidth, 0, input.maxLeft);
  let right = clampPanelWidth(input.rightWidth, 0, input.maxRight);

  if (left < input.minLeft) left = Math.min(input.minLeft, input.maxLeft);
  if (right < input.minRight) right = Math.min(input.minRight, input.maxRight);

  if (input.shellWidth <= 0) {
    return { leftWidth: left, rightWidth: right };
  }

  const budget = Math.max(0, input.shellWidth - minChat - slack);
  let leftTaken = input.leftOpen ? left : 0;
  let rightTaken = input.rightOpen ? right : 0;

  if (leftTaken + rightTaken <= budget) {
    return { leftWidth: left, rightWidth: right };
  }

  let overflow = leftTaken + rightTaken - budget;

  if (input.rightOpen && overflow > 0) {
    const take = Math.min(rightTaken, overflow);
    right -= take;
    overflow -= take;
  }
  if (input.leftOpen && overflow > 0) {
    const take = Math.min(left, overflow);
    left -= take;
    overflow -= take;
  }

  return { leftWidth: left, rightWidth: right };
}

/**
 * 拖拽某一侧的动态上限：`otherTaken` 为对侧实占（关闭为 0；让位时传对侧 min）。
 */
export function maxSidePanelWidth(input: {
  shellWidth: number;
  otherTaken: number;
  maxWidth: number;
  minChat?: number;
  slack?: number;
}): number {
  const minChat = input.minChat ?? MIN_CHAT_MAIN_WIDTH;
  const slack = input.slack ?? CHAT_LAYOUT_SLACK_PX;
  if (input.shellWidth <= 0) return input.maxWidth;
  const allowed = input.shellWidth - input.otherTaken - minChat - slack;
  return Math.min(input.maxWidth, Math.max(0, allowed));
}

/**
 * 拖拽一侧：中间不低于 minChat+slack；不够时先压对侧到其 min，再钳本侧。
 */
export function resizeSidePanel(input: {
  side: "left" | "right";
  nextWidth: number;
  shellWidth: number;
  leftOpen: boolean;
  rightOpen: boolean;
  leftWidth: number;
  rightWidth: number;
  minLeft: number;
  maxLeft: number;
  minRight: number;
  maxRight: number;
  minChat?: number;
  slack?: number;
}): { leftWidth: number; rightWidth: number } {
  const minChat = input.minChat ?? MIN_CHAT_MAIN_WIDTH;
  const slack = input.slack ?? CHAT_LAYOUT_SLACK_PX;
  const reserve = minChat + slack;

  const draggingLeft = input.side === "left";
  if (draggingLeft ? !input.leftOpen : !input.rightOpen) {
    return { leftWidth: input.leftWidth, rightWidth: input.rightWidth };
  }

  const selfMin = draggingLeft ? input.minLeft : input.minRight;
  const selfMax = draggingLeft ? input.maxLeft : input.maxRight;
  const otherOpen = draggingLeft ? input.rightOpen : input.leftOpen;
  const otherCurrent = draggingLeft ? input.rightWidth : input.leftWidth;
  const otherFloor = draggingLeft ? input.minRight : input.minLeft;

  const hardMax = maxSidePanelWidth({
    shellWidth: input.shellWidth,
    otherTaken: otherOpen ? otherFloor : 0,
    maxWidth: selfMax,
    minChat,
    slack,
  });
  const hardMin = effectivePanelMinWidth(selfMin, hardMax);
  let desired = clampPanelWidth(input.nextWidth, hardMin, hardMax);
  let other = otherCurrent;

  if (input.shellWidth > 0 && otherOpen) {
    const mainIfKeepOther = input.shellWidth - desired - otherCurrent;
    if (mainIfKeepOther < reserve) {
      const need = reserve - mainIfKeepOther;
      const yielded = Math.min(Math.max(0, otherCurrent - otherFloor), need);
      other = otherCurrent - yielded;
      if (input.shellWidth - desired - other < reserve) {
        desired = clampPanelWidth(input.shellWidth - reserve - other, hardMin, hardMax);
      }
    }
  }

  return draggingLeft
    ? { leftWidth: desired, rightWidth: other }
    : { leftWidth: other, rightWidth: desired };
}
