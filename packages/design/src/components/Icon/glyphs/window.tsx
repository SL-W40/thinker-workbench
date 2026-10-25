/**
 * 窗口控制与其它 chrome 图标：最小化 / 最大化 / 还原 / 关闭 / 过滤。
 *
 * 视觉约定见 `Icon/icons.tsx` 头部：16×16、内容落在约 3–13 的光学框内、描边 1.5 圆头端点。
 */
import { createIcon } from "../Icon";
import { VB } from "./shared";

export const RestoreIcon = createIcon(
  "RestoreIcon",
  <>
    <rect x="5.25" y="5.25" width="7.5" height="7.5" rx="1" />
    <path d="M5.75 5.25V4.1A1.1 1.1 0 0 1 6.85 3h5.05A1.1 1.1 0 0 1 13 4.1v5.05A1.1 1.1 0 0 1 11.9 10.25H10.75" />
  </>,
  VB,
);

// —— 文件 / 工作区 ——

export const CloseIcon = createIcon(
  "CloseIcon",
  <path d="M4.25 4.25l7.5 7.5M11.75 4.25l-7.5 7.5" />,
  VB,
);

export const MinimizeIcon = createIcon("MinimizeIcon", <path d="M3.25 8h9.5" />, VB);

export const CheckIcon = createIcon("CheckIcon", <path d="M3.5 8.25 6.5 11.25 12.5 4.75" />, VB);

// —— 文件 / 工作区 ——

export const FilterIcon = createIcon(
  "FilterIcon",
  <path d="M3 3.5h10L9.1 8.4v3.9L6.9 13.5V8.4L3 3.5z" />,
  VB,
);

export const MaximizeIcon = createIcon(
  "MaximizeIcon",
  <rect x="3.25" y="3.25" width="9.5" height="9.5" rx="1.25" />,
  VB,
);
