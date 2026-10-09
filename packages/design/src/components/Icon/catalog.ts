/**
 * 图标目录：供 Components 页画廊与文档列举。
 */
import type { ComponentType } from "react";
import type { IconProps } from "./Icon";
import {
  ChevronLeftIcon,
  ChevronRightIcon,
  ClockIcon,
  CloseIcon,
  CodeIcon,
  ConsoleIcon,
  DatabaseIcon,
  FilterIcon,
  FolderIcon,
  FolderPlusIcon,
  GridIcon,
  InfoIcon,
  LanesIcon,
  LogsIcon,
  MaximizeIcon,
  MinimizeIcon,
  PlayIcon,
  PlusIcon,
  RestartIcon,
  RestoreIcon,
  SettingsIcon,
  SidebarLeftIcon,
  SidebarRightIcon,
  StopIcon,
} from "./icons";

export type DesignIconEntry = {
  /** 组件名（与导出标识一致）。 */
  name: string;
  /** 渲染组件。 */
  Icon: ComponentType<IconProps & Record<string, unknown>>;
};

/** 全部具名图标（按组件名排序）。 */
export const DESIGN_ICONS: DesignIconEntry[] = [
  { name: "ChevronLeftIcon", Icon: ChevronLeftIcon },
  { name: "ChevronRightIcon", Icon: ChevronRightIcon },
  { name: "ClockIcon", Icon: ClockIcon },
  { name: "CloseIcon", Icon: CloseIcon },
  { name: "CodeIcon", Icon: CodeIcon },
  { name: "ConsoleIcon", Icon: ConsoleIcon },
  { name: "DatabaseIcon", Icon: DatabaseIcon },
  { name: "FilterIcon", Icon: FilterIcon },
  { name: "FolderIcon", Icon: FolderIcon },
  { name: "FolderPlusIcon", Icon: FolderPlusIcon },
  { name: "GridIcon", Icon: GridIcon },
  { name: "InfoIcon", Icon: InfoIcon },
  { name: "LanesIcon", Icon: LanesIcon },
  { name: "LogsIcon", Icon: LogsIcon },
  { name: "MaximizeIcon", Icon: MaximizeIcon },
  { name: "MinimizeIcon", Icon: MinimizeIcon },
  { name: "PlayIcon", Icon: PlayIcon },
  { name: "PlusIcon", Icon: PlusIcon },
  { name: "RestartIcon", Icon: RestartIcon },
  { name: "RestoreIcon", Icon: RestoreIcon },
  { name: "SettingsIcon", Icon: SettingsIcon },
  { name: "SidebarLeftIcon", Icon: SidebarLeftIcon },
  { name: "SidebarRightIcon", Icon: SidebarRightIcon },
  { name: "StopIcon", Icon: StopIcon },
];

/** 返回图标目录副本。 */
export function listDesignIcons(): DesignIconEntry[] {
  return [...DESIGN_ICONS];
}
