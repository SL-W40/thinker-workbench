/**
 * ChatUsageBar 浮层定位与短 id（纯函数）。
 */

/** 展示用短 id：取末段 8 位*/
export function shortTraceId(id: string): string {
  const parts = id.split("_");
  return parts[parts.length - 1]?.slice(0, 8) ?? id.slice(-8);
}

export type PopoverCoords = {
  left: number;
  width: number;
  top?: number;
  bottom?: number;
};

/** 「⋯」菜单：宽高随内容，仅定位用。 */
export type MoreMenuCoords = {
  left: number;
  top?: number;
  bottom?: number;
};

const POPOVER_GAP = 8;
const POPOVER_PAD = 8;
const POPOVER_WIDTH = 280;

/**
 * 相对触发器放置明细浮层：哪边空间更大就往哪边开。
 * 不设 maxHeight、不滚内层——窗口太小时宁可被裁切。
 */
export function placeUsagePopover(trigger: DOMRect): PopoverCoords {
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const width = Math.min(POPOVER_WIDTH, vw - POPOVER_PAD * 2);
  let left = trigger.left;
  if (left + width > vw - POPOVER_PAD) {
    left = Math.max(POPOVER_PAD, vw - width - POPOVER_PAD);
  }
  if (left < POPOVER_PAD) left = POPOVER_PAD;

  const spaceAbove = trigger.top - POPOVER_GAP;
  const spaceBelow = vh - trigger.bottom - POPOVER_GAP;
  const preferAbove = spaceAbove >= spaceBelow;

  if (preferAbove) {
    return {
      bottom: vh - trigger.top + POPOVER_GAP,
      left,
      width,
    };
  }
  return {
    top: trigger.bottom + POPOVER_GAP,
    left,
    width,
  };
}

/**
 * 「⋯」溢出菜单定位：挂到 body 的 fixed；上下取空间更大一侧，水平夹入视口。
 */
export function placeMoreMenu(
  trigger: DOMRect,
  menuWidth: number,
  menuHeight: number,
): MoreMenuCoords {
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const width = Math.min(Math.max(menuWidth, 1), vw - POPOVER_PAD * 2);
  let left = trigger.left;
  if (left + width > vw - POPOVER_PAD) {
    left = Math.max(POPOVER_PAD, trigger.right - width);
  }
  if (left < POPOVER_PAD) left = POPOVER_PAD;

  const spaceAbove = trigger.top - POPOVER_GAP;
  const spaceBelow = vh - trigger.bottom - POPOVER_GAP;
  const preferAbove = spaceAbove >= spaceBelow && spaceAbove >= menuHeight;

  if (preferAbove) {
    return {
      bottom: vh - trigger.top + POPOVER_GAP,
      left,
    };
  }
  // 下方不够且上方更大时仍向上
  if (spaceBelow < menuHeight && spaceAbove > spaceBelow) {
    return {
      bottom: vh - trigger.top + POPOVER_GAP,
      left,
    };
  }
  return {
    top: trigger.bottom + POPOVER_GAP,
    left,
  };
}
