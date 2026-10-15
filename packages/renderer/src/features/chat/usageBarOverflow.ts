/**
 * 消息底栏胶囊行：按宽度从左保留，放不下的进「⋯」菜单。
 */

export type VisiblePillOptions = {
  /**
   * 为 true 时始终预留 more 按钮宽度（例如 Copy 默认在「⋯」内，三点常驻）。
   */
  alwaysReserveMore?: boolean;
};

/**
 * 计算主行可展示的胶囊个数（从左起）。
 * 若不能全部放下（或 `alwaysReserveMore`），须为 more 按钮预留 `moreWidth`。
 */
export function visiblePillCount(
  widths: readonly number[],
  available: number,
  moreWidth: number,
  gap: number,
  options?: VisiblePillOptions,
): number {
  const n = widths.length;
  if (n === 0 || available <= 0) return 0;
  const alwaysMore = Boolean(options?.alwaysReserveMore);

  let all = 0;
  for (let i = 0; i < n; i++) {
    all += widths[i]! + (i > 0 ? gap : 0);
  }
  if (!alwaysMore && all <= available) return n;
  if (alwaysMore && all + gap + moreWidth <= available) return n;

  let best = 0;
  for (let k = 1; k <= n; k++) {
    let used = 0;
    for (let i = 0; i < k; i++) {
      used += widths[i]! + (i > 0 ? gap : 0);
    }
    const remaining = n - k;
    const needMore = alwaysMore || remaining > 0;
    const need = needMore ? used + gap + moreWidth : used;
    if (need <= available) best = k;
    else break;
  }
  return best;
}
