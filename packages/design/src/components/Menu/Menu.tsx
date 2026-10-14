/**
 * 触发器锚定的菜单。触发器由调用方渲染，本组件只负责浮层与条目。
 */

import type { PopoverAlign } from "../../overlay/place";
import type { AnchorHandle } from "../Popover/Popover";
import { Popover } from "../Popover/Popover";
import { flattenMenuGroups } from "./flatten";
import { MenuList } from "./MenuList";
import type { MenuGroup, MenuItem } from "./types";

export type { MenuGroup, MenuItem };

export type MenuProps = {
  /** 是否打开。 */
  open: boolean;
  /** 关闭回调。 */
  onClose: () => void;
  /** 触发器 ref。 */
  anchorRef?: AnchorHandle;
  /** 无 ref 时的锚点。 */
  anchor?: { x: number; y: number } | DOMRect | null;
  /** 扁平条目。与 `groups` 同时存在时以 `items` 为准。 */
  items?: MenuItem[];
  /** 分组条目。 */
  groups?: MenuGroup[];
  /** 水平对齐。默认 start。 */
  align?: PopoverAlign;
  /** 无障碍名称。 */
  "aria-label"?: string;
  /** 追加到浮层的 class。 */
  className?: string;
};

export function Menu({
  open,
  onClose,
  anchorRef,
  anchor,
  items,
  groups,
  align = "start",
  className,
  "aria-label": ariaLabel,
}: MenuProps) {
  const list = items && items.length > 0 ? items : flattenMenuGroups(groups ?? []);
  const cls = ["tw-menu", className ?? ""].filter(Boolean).join(" ");

  return (
    <Popover
      open={open}
      onClose={onClose}
      anchorRef={anchorRef}
      anchor={anchor}
      align={align}
      className={cls}
    >
      <MenuList items={list} onClose={onClose} aria-label={ariaLabel} />
    </Popover>
  );
}
