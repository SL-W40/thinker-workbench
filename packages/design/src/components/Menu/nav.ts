/**
 * 在未禁用的菜单项之间循环移动。
 */

type NavItem = { disabled?: boolean };

/** 没有可选项时返回 -1。 */
export function nextEnabledIndex(items: readonly NavItem[], current: number, delta: number): number {
  const enabled: number[] = [];
  items.forEach((item, index) => {
    if (!item.disabled) enabled.push(index);
  });
  if (enabled.length === 0) return -1;
  const pos = enabled.indexOf(current);
  const start = pos === -1 ? (delta > 0 ? -1 : 0) : pos;
  const nextPos = (start + delta + enabled.length) % enabled.length;
  return enabled[nextPos] ?? -1;
}
