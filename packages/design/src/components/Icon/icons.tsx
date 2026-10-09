/**
 * 具名图标目录。
 *
 * 视觉约定（16×16）：
 * - 内容落在约 3–13 的光学框内（四周约 3px 留白）
 * - 描边 1.5 / round 端点（`.tw-icon`）
 * - 复杂面性图标与简单笔画尽量同视觉重量
 */
import { Icon, createIcon, type IconProps } from "./Icon";

const VB = "0 0 16 16";

// —— 导航 / 通用 ——

export const ChevronLeftIcon = createIcon(
  "ChevronLeftIcon",
  <path d="M10.25 3.25 4.75 8l5.5 4.75" />,
  VB,
);

/** 右箭头；`open` 时旋转 90°（树节点展开）。 */
export function ChevronRightIcon({
  open = false,
  className,
  ...rest
}: IconProps & { open?: boolean }) {
  return (
    <Icon
      name="ChevronRightIcon"
      viewBox={VB}
      className={[open ? "is-open" : "", className ?? ""].filter(Boolean).join(" ")}
      {...rest}
    >
      <path d="M5.75 3.25 11.25 8l-5.5 4.75" />
    </Icon>
  );
}

export const PlusIcon = createIcon("PlusIcon", <path d="M8 3.25v9.5M3.25 8h9.5" />, VB);

export const CloseIcon = createIcon(
  "CloseIcon",
  <path d="M4.25 4.25l7.5 7.5M11.75 4.25l-7.5 7.5" />,
  VB,
);

export const MinimizeIcon = createIcon("MinimizeIcon", <path d="M3.25 8h9.5" />, VB);

export const MaximizeIcon = createIcon(
  "MaximizeIcon",
  <rect x="3.25" y="3.25" width="9.5" height="9.5" rx="1.25" />,
  VB,
);

export const RestoreIcon = createIcon(
  "RestoreIcon",
  <>
    <rect x="5.25" y="5.25" width="7.5" height="7.5" rx="1" />
    <path d="M5.75 5.25V4.1A1.1 1.1 0 0 1 6.85 3h5.05A1.1 1.1 0 0 1 13 4.1v5.05A1.1 1.1 0 0 1 11.9 10.25H10.75" />
  </>,
  VB,
);

// —— 文件 / 工作区 ——

export const FilterIcon = createIcon(
  "FilterIcon",
  <path d="M3 3.5h10L9.1 8.4v3.9L6.9 13.5V8.4L3 3.5z" />,
  VB,
);

/** 闭合文件夹路径（页签 + 圆角盒）。 */
const FOLDER_CLOSED =
  "M2.5 5.25A1.25 1.25 0 0 1 3.75 4h2.2l1 1.15h5.3A1.25 1.25 0 0 1 13.5 6.4v5.35A1.25 1.25 0 0 1 12.25 13H3.75A1.25 1.25 0 0 1 2.5 11.75V5.25z";

/** 打开文件夹路径（后盖页签 + 前盖斜面）。 */
const FOLDER_OPEN =
  "M2.5 13V4.85A1.2 1.2 0 0 1 3.7 3.65h2.1l.95 1.1h4.55A1.2 1.2 0 0 1 12.5 5.95v1.2M4.15 9.35l1.1-2.15A1.2 1.2 0 0 1 6.3 6.55h6.85a1.2 1.2 0 0 1 1.15 1.5l-1.15 4.35A1.2 1.2 0 0 1 12 13.5H3.7A1.2 1.2 0 0 1 2.5 12.3";

/** 工作区文件夹；`open` 为展开态，默认闭合。 */
export function FolderIcon({
  open = false,
  ...rest
}: IconProps & { open?: boolean }) {
  return (
    <Icon name="FolderIcon" viewBox={VB} {...rest}>
      <path d={open ? FOLDER_OPEN : FOLDER_CLOSED} />
    </Icon>
  );
}

/**
 * 打开工作区：打开态文件夹。
 * 与文案「打开」一致，不再叠加号（16px 下易挤、易跑偏）。
 */
export const FolderPlusIcon = createIcon(
  "FolderPlusIcon",
  <path d={FOLDER_OPEN} />,
  VB,
);

// —— 布局 / 工具 ——

/** 左侧栏；`open` 时填充侧栏块。 */
export function SidebarLeftIcon({
  open = false,
  ...rest
}: IconProps & { open?: boolean }) {
  return (
    <Icon name="SidebarLeftIcon" viewBox={VB} {...rest}>
      <rect x="2.75" y="3.25" width="10.5" height="9.5" rx="1.35" />
      {open ? (
        <rect className="tw-icon__fill" x="3.5" y="4" width="3" height="8" rx="0.45" />
      ) : (
        <path d="M6.75 4v8" />
      )}
    </Icon>
  );
}

/** 右侧栏（镜像左侧）。 */
export function SidebarRightIcon({
  open = false,
  ...rest
}: IconProps & { open?: boolean }) {
  return (
    <Icon name="SidebarRightIcon" viewBox={VB} {...rest}>
      <rect x="2.75" y="3.25" width="10.5" height="9.5" rx="1.35" />
      {open ? (
        <rect className="tw-icon__fill" x="9.5" y="4" width="3" height="8" rx="0.45" />
      ) : (
        <path d="M9.25 4v8" />
      )}
    </Icon>
  );
}

/** 设置滑块；`active` 时圆点实心。 */
export function SettingsIcon({
  active = false,
  ...rest
}: IconProps & { active?: boolean }) {
  const fill = active ? "tw-icon__fill" : undefined;
  return (
    <Icon name="SettingsIcon" viewBox={VB} {...rest}>
      <path d="M3 4.5h10M3 8h10M3 11.5h10" />
      <circle className={fill} cx="5.75" cy="4.5" r="1.25" />
      <circle className={fill} cx="10.25" cy="8" r="1.25" />
      <circle className={fill} cx="6.75" cy="11.5" r="1.25" />
    </Icon>
  );
}

/**
 * 控制台：带顶栏的终端窗；`active` 时顶栏圆点实心。
 */
export function ConsoleIcon({
  active = false,
  ...rest
}: IconProps & { active?: boolean }) {
  const fill = active ? "tw-icon__fill" : undefined;
  return (
    <Icon name="ConsoleIcon" viewBox={VB} {...rest}>
      <rect x="2.75" y="3.25" width="10.5" height="9.5" rx="1.35" />
      <path d="M2.75 6.15h10.5" />
      <circle className={fill} cx="4.55" cy="4.7" r="0.65" />
      <circle className={fill} cx="6.3" cy="4.7" r="0.65" />
      <path d="M4.75 8.35h6.5M4.75 10.6h4" />
    </Icon>
  );
}

export const CodeIcon = createIcon(
  "CodeIcon",
  <path d="M6 3.5 3 8l3 4.5M10 3.5l3 4.5-3 4.5M7.25 12.5l1.5-9" />,
  VB,
);

export const LogsIcon = createIcon(
  "LogsIcon",
  <>
    <rect x="2.75" y="3.25" width="10.5" height="9.5" rx="1.35" />
    <path d="M5 6.5 6.6 8 5 9.5" />
    <path d="M7.75 9.5H11" />
  </>,
  VB,
);

export const GridIcon = createIcon(
  "GridIcon",
  <>
    <rect x="3" y="3" width="4.25" height="4.25" rx="0.9" />
    <rect x="8.75" y="3" width="4.25" height="4.25" rx="0.9" />
    <rect x="3" y="8.75" width="4.25" height="4.25" rx="0.9" />
    <rect x="8.75" y="8.75" width="4.25" height="4.25" rx="0.9" />
  </>,
  VB,
);

export const LanesIcon = createIcon(
  "LanesIcon",
  <>
    <path d="M3 4.5h10M3 8h10M3 11.5h10" />
    <circle cx="4.75" cy="4.5" r="1.1" />
    <circle cx="4.75" cy="8" r="1.1" />
    <circle cx="4.75" cy="11.5" r="1.1" />
  </>,
  VB,
);

/** 播放：线框三角，光学框与 Stop 对齐。 */
export const PlayIcon = createIcon(
  "PlayIcon",
  <path d="M5.5 3.75v8.5L12.25 8z" />,
  VB,
);

/** 停止：线框圆角方块，与 Play 同量级。 */
export const StopIcon = createIcon(
  "StopIcon",
  <rect x="4.25" y="4.25" width="7.5" height="7.5" rx="1.25" />,
  VB,
);

export const RestartIcon = createIcon(
  "RestartIcon",
  <path d="M3.75 8a4.25 4.25 0 0 1 7.15-3.1L12.25 6.25V3.5M12.25 8a4.25 4.25 0 0 1-7.15 3.1L3.75 9.75v2.75" />,
  VB,
);

/** 数据库 / Tokens 统计。 */
export const DatabaseIcon = createIcon(
  "DatabaseIcon",
  <>
    <ellipse cx="8" cy="4.25" rx="4.5" ry="1.75" />
    <path d="M3.5 4.25v7.5c0 .97 2.01 1.75 4.5 1.75s4.5-.78 4.5-1.75v-7.5" />
    <path d="M3.5 8c0 .97 2.01 1.75 4.5 1.75s4.5-.78 4.5-1.75" />
  </>,
  VB,
);

/** 时钟 / 耗时。 */
export const ClockIcon = createIcon(
  "ClockIcon",
  <>
    <circle cx="8" cy="8" r="5.25" />
    <path d="M8 5.25V8l2 1.5" />
  </>,
  VB,
);

/** 信息提示。 */
export const InfoIcon = createIcon(
  "InfoIcon",
  <>
    <circle cx="8" cy="8" r="5.25" />
    <path d="M8 7.25V11M8 5.1h.01" />
  </>,
  VB,
);
