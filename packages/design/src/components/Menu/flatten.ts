/**
 * 把分组菜单拍成一列，组间加分隔线，组标题记在首项上。
 */
import type { MenuGroup, MenuItem } from "./types";

export function flattenMenuGroups(groups: readonly MenuGroup[]): MenuItem[] {
  const out: MenuItem[] = [];
  for (const group of groups) {
    if (group.items.length === 0) continue;
    group.items.forEach((item, index) => {
      const first = index === 0;
      out.push({
        ...item,
        separatorBefore: Boolean(item.separatorBefore || (first && out.length > 0)),
        groupLabel: first ? group.label : undefined,
      });
    });
  }
  return out;
}
