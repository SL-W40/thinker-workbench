/**
 * 右键 / 坐标锚定的上下文菜单。条目模型与 Menu 相同。
 */

import { MenuList } from "../Menu/MenuList";
import type { MenuItem } from "../Menu/types";
import { Popover } from "../Popover/Popover";

export type ContextMenuItemProps = MenuItem;

export type ContextMenuProps = {
  /** 是否打开。 */
  open: boolean;
  /** 锚点：屏幕坐标（右键）或 DOMRect（按钮底边）。 */
  anchor: { x: number; y: number } | DOMRect | null;
  /** 关闭回调。 */
  onClose: () => void;
  /** 菜单项。 */
  items: ContextMenuItemProps[];
  /** 无障碍标签。 */
  "aria-label"?: string;
};

export function ContextMenu({
  open,
  anchor,
  onClose,
  items,
  "aria-label": ariaLabel,
}: ContextMenuProps) {
  return (
    <Popover
      open={open}
      onClose={onClose}
      anchor={anchor}
      gap={0}
      className="tw-context-menu tw-menu"
    >
      <MenuList items={items} onClose={onClose} aria-label={ariaLabel} />
    </Popover>
  );
}
