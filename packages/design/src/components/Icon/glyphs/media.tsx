/**
 * 媒体与视图类图标：播放、停止、重跑、显著性视图。
 *
 * 视觉约定见 `Icon/icons.tsx` 头部：16×16、内容落在约 3–13 的光学框内、描边 1.5 圆头端点。
 */
import { createIcon } from "../Icon";
import { VB } from "./shared";

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

/** 停止：线框圆角方块，与 Play 同量级。 */
export const StopIcon = createIcon(
  "StopIcon",
  <rect x="4.25" y="4.25" width="7.5" height="7.5" rx="1.25" />,
  VB,
);

/** 播放：线框三角，光学框与 Stop 对齐。 */
export const PlayIcon = createIcon("PlayIcon", <path d="M5.5 3.75v8.5L12.25 8z" />, VB);

/** 停止：线框圆角方块，与 Play 同量级。 */

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

/**
 * 查看 / 只读（只看不改）：眼睛。
 * 用于 read_file / list_dir 这类只读取、不改动工作区的动作。
 */
export const EyeIcon = createIcon(
  "EyeIcon",
  <>
    <path d="M2 8c1.5-2.6 3.35-3.8 6-3.8S12.5 5.4 14 8c-1.5 2.6-3.35 3.8-6 3.8S3.5 10.6 2 8z" />
    <circle cx="8" cy="8" r="1.85" />
  </>,
  VB,
);

// —— 布局 / 工具 ——

/** 左侧栏；`open` 时填充侧栏块。 */

export const RestartIcon = createIcon(
  "RestartIcon",
  <path d="M3.75 8a4.25 4.25 0 0 1 7.15-3.1L12.25 6.25V3.5M12.25 8a4.25 4.25 0 0 1-7.15 3.1L3.75 9.75v2.75" />,
  VB,
);

/** 复制：叠放双矩形。 */
