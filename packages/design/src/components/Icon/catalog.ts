/**
 * 图标目录：供 Components 页画廊与文档列举。
 */
import type { ComponentType } from "react";
import type { IconProps } from "./Icon";
import {
  AgentModeIcon,
  AskModeIcon,
  BellIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  ClockIcon,
  CloseIcon,
  CodeIcon,
  ConsoleIcon,
  CubeIcon,
  DatabaseIcon,
  DebugModeIcon,
  FilterIcon,
  FolderIcon,
  FolderPlusIcon,
  GlobeIcon,
  GridIcon,
  InfoIcon,
  KeyboardIcon,
  LanesIcon,
  LogsIcon,
  MaximizeIcon,
  MinimizeIcon,
  MultitaskModeIcon,
  PaletteIcon,
  PlanModeIcon,
  PlayIcon,
  PlusIcon,
  RestartIcon,
  RestoreIcon,
  SettingsIcon,
  ShieldIcon,
  SidebarLeftIcon,
  SidebarRightIcon,
  StopIcon,
  TrashIcon,
} from "./icons";

export type DesignIconEntry = {
  /** 组件名（与导出标识一致）。 */
  name: string;
  /** 渲染组件。 */
  Icon: ComponentType<IconProps & Record<string, unknown>>;
};

/** 全部具名图标（按组件名排序）。 */
export const DESIGN_ICONS: DesignIconEntry[] = [
  { name: "AgentModeIcon", Icon: AgentModeIcon },
  { name: "AskModeIcon", Icon: AskModeIcon },
  { name: "BellIcon", Icon: BellIcon },
  { name: "ChevronLeftIcon", Icon: ChevronLeftIcon },
  { name: "ChevronRightIcon", Icon: ChevronRightIcon },
  { name: "ClockIcon", Icon: ClockIcon },
  { name: "CloseIcon", Icon: CloseIcon },
  { name: "CodeIcon", Icon: CodeIcon },
  { name: "ConsoleIcon", Icon: ConsoleIcon },
  { name: "CubeIcon", Icon: CubeIcon },
  { name: "DatabaseIcon", Icon: DatabaseIcon },
  { name: "DebugModeIcon", Icon: DebugModeIcon },
  { name: "FilterIcon", Icon: FilterIcon },
  { name: "FolderIcon", Icon: FolderIcon },
  { name: "FolderPlusIcon", Icon: FolderPlusIcon },
  { name: "GlobeIcon", Icon: GlobeIcon },
  { name: "GridIcon", Icon: GridIcon },
  { name: "InfoIcon", Icon: InfoIcon },
  { name: "KeyboardIcon", Icon: KeyboardIcon },
  { name: "LanesIcon", Icon: LanesIcon },
  { name: "LogsIcon", Icon: LogsIcon },
  { name: "MaximizeIcon", Icon: MaximizeIcon },
  { name: "MinimizeIcon", Icon: MinimizeIcon },
  { name: "MultitaskModeIcon", Icon: MultitaskModeIcon },
  { name: "PaletteIcon", Icon: PaletteIcon },
  { name: "PlanModeIcon", Icon: PlanModeIcon },
  { name: "PlayIcon", Icon: PlayIcon },
  { name: "PlusIcon", Icon: PlusIcon },
  { name: "RestartIcon", Icon: RestartIcon },
  { name: "RestoreIcon", Icon: RestoreIcon },
  { name: "SettingsIcon", Icon: SettingsIcon },
  { name: "ShieldIcon", Icon: ShieldIcon },
  { name: "SidebarLeftIcon", Icon: SidebarLeftIcon },
  { name: "SidebarRightIcon", Icon: SidebarRightIcon },
  { name: "StopIcon", Icon: StopIcon },
  { name: "TrashIcon", Icon: TrashIcon },
];

/** 返回图标目录副本。 */
export function listDesignIcons(): DesignIconEntry[] {
  return [...DESIGN_ICONS];
}
