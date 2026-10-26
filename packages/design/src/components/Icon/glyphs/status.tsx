/**
 * 状态与信息类图标：时钟、信息、铃铛、盾牌、代码、日志等。
 *
 * 视觉约定见 `Icon/icons.tsx` 头部：16×16、内容落在约 3–13 的光学框内、描边 1.5 圆头端点。
 */
import { createIcon } from "../Icon";
import { VB } from "./shared";

/** 权限 / 盾牌。 */
export const ShieldIcon = createIcon(
  "ShieldIcon",
  <path d="M8 2.75 12.5 4.6v3.45c0 2.7-1.9 4.65-4.5 5.55-2.6-.9-4.5-2.85-4.5-5.55V4.6L8 2.75z" />,
  VB,
);

/** 浏览器 / 地球。 */

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

/**
 * 思考 / 推理中：灯泡（玻璃罩 + 螺纹底座）。
 * 罩顶为半径 3.3 的半圆，底座收在 3~13 光学框内；配合呼吸动画读作「在想」。
 */

/** 通知铃铛。 */
export const BellIcon = createIcon(
  "BellIcon",
  <>
    <path d="M5.1 7.1a2.9 2.9 0 0 1 5.8 0c0 2.35 1.05 3.15 1.05 3.15H4.05S5.1 9.45 5.1 7.1" />
    <path d="M7.05 13.1a1.15 1.15 0 0 0 1.9 0" />
    <path d="M8 3.1v1.05" />
  </>,
  VB,
);

/** 权限 / 盾牌。 */

export const LogsIcon = createIcon(
  "LogsIcon",
  <>
    <rect x="2.75" y="3.25" width="10.5" height="9.5" rx="1.35" />
    <path d="M5 6.5 6.6 8 5 9.5" />
    <path d="M7.75 9.5H11" />
  </>,
  VB,
);

export const CodeIcon = createIcon(
  "CodeIcon",
  <path d="M6 3.5 3 8l3 4.5M10 3.5l3 4.5-3 4.5M7.25 12.5l1.5-9" />,
  VB,
);

/** 警告 / 危险：三角形感叹号（Toast、确认对话框的警示语气）。 */
export const AlertTriangleIcon = createIcon(
  "AlertTriangleIcon",
  <>
    <path d="M8 2.85 14.15 13H1.85L8 2.85z" />
    <path d="M8 6.6v2.65M8 11.25h.01" />
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

// —— ChatMode ——

/** Agent：自主执行（星芒）。 */

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
