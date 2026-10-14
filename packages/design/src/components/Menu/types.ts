/**
 * 菜单项模型：ContextMenu 与 Menu 共用。
 */
import type { ReactNode } from "react";

export type MenuItem = {
  /** 可见标签。 */
  label: string;
  /** 选中回调。有子菜单时可以不传。 */
  onSelect?: () => void;
  /** 标签下的说明。 */
  description?: string;
  /** 右侧快捷键文案，如 Ctrl+K。 */
  shortcut?: string;
  /** 勾选态。传入布尔值时该项为 menuitemcheckbox。 */
  checked?: boolean;
  /** 危险操作。 */
  danger?: boolean;
  /** 禁用。 */
  disabled?: boolean;
  /** 左侧图标。 */
  icon?: ReactNode;
  /** 该项之前画分隔线。 */
  separatorBefore?: boolean;
  /** 子菜单。 */
  items?: MenuItem[];
  /** 分组标题（拍平分组时写入，调用方一般不填）。 */
  groupLabel?: string;
};

export type MenuGroup = {
  /** 分组标题；可省略，仅用分隔线区分。 */
  label?: string;
  items: MenuItem[];
};
