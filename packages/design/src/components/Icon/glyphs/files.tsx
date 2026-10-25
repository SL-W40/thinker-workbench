/**
 * 文件类图标：回形针、下载、目录、复制、删除。
 *
 * 视觉约定见 `Icon/icons.tsx` 头部：16×16、内容落在约 3–13 的光学框内、描边 1.5 圆头端点。
 */
import { createIcon, Icon, type IconProps } from "../Icon";
import { FOLDER_CLOSED, FOLDER_OPEN, VB } from "./shared";

/** 下载 / 导出箭头入托盘。 */
export const DownloadIcon = createIcon(
  "DownloadIcon",
  <>
    <path d="M8 3.25v7" />
    <path d="M5.25 7.75 8 10.5l2.75-2.75" />
    <path d="M3.25 12.75h9.5" />
  </>,
  VB,
);

/** 删除 / 垃圾桶。 */
export const TrashIcon = createIcon(
  "TrashIcon",
  <>
    <path d="M3.5 4.75h9" />
    <path d="M6 4.75V3.6A.85.85 0 0 1 6.85 2.75h2.3A.85.85 0 0 1 10 3.6v1.15" />
    <path d="M5.25 4.75 5.7 12.4A1.1 1.1 0 0 0 6.8 13.4h2.4a1.1 1.1 0 0 0 1.1-1L10.75 4.75" />
  </>,
  VB,
);

/** 回形针（附件）。斜向单线铺满视口，端点由 `.tw-icon` 圆角收口。 */
export const PaperclipIcon = createIcon(
  "PaperclipIcon",
  <path d="M10.6 3.15 5.15 8.6a1.7 1.7 0 0 0 2.4 2.4l5.7-5.7a2.55 2.55 0 0 0-3.6-3.6L3.9 7.45a3.4 3.4 0 0 0 4.8 4.8l5.45-5.45" />,
  VB,
);

/** 下载 / 导出箭头入托盘。 */

/** 工作区文件夹；`open` 为展开态，默认闭合。 */
export function FolderIcon({ open = false, ...rest }: IconProps & { open?: boolean }) {
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

export const PlusIcon = createIcon("PlusIcon", <path d="M8 3.25v9.5M3.25 8h9.5" />, VB);

/** 回形针（附件）。斜向单线铺满视口，端点由 `.tw-icon` 圆角收口。 */

/** 复制：叠放双矩形。 */
export const CopyIcon = createIcon(
  "CopyIcon",
  <>
    <rect x="5.5" y="5.5" width="6.75" height="6.75" rx="1.15" />
    <path d="M10.5 5.5V4.15A1.15 1.15 0 0 0 9.35 3H4.15A1.15 1.15 0 0 0 3 4.15v5.2A1.15 1.15 0 0 0 4.15 10.5H5.5" />
  </>,
  VB,
);

/** 数据库 / Tokens 统计。 */

/**
 * 打开工作区：打开态文件夹。
 * 与文案「打开」一致，不再叠加号（16px 下易挤、易跑偏）。
 */
export const FolderPlusIcon = createIcon("FolderPlusIcon", <path d={FOLDER_OPEN} />, VB);

/**
 * 查看 / 只读（只看不改）：眼睛。
 * 用于 read_file / list_dir 这类只读取、不改动工作区的动作。
 */
