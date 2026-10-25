/**
 * 模式切换图标：Agent / Plan / Debug / Ask / 多任务，以及思考指示。
 *
 * 视觉约定见 `Icon/icons.tsx` 头部：16×16、内容落在约 3–13 的光学框内、描边 1.5 圆头端点。
 */
import { createIcon } from "../Icon";
import { VB } from "./shared";

/** Multitask：并行多线。 */
export const MultitaskModeIcon = createIcon(
  "MultitaskModeIcon",
  <>
    <path d="M3.25 4.5h4.5M3.25 8h4.5M3.25 11.5h4.5" />
    <path d="M9.25 4.5h3.5M11 3l1.75 1.5L11 6M9.25 11.5h3.5M11 10l1.75 1.5L11 13" />
  </>,
  VB,
);

// —— 设置分区 ——

/** 外观 / 主题色板。 */

/** Debug：缺陷定位。 */
export const DebugModeIcon = createIcon(
  "DebugModeIcon",
  <>
    <path d="M5.25 6.5c0-1.66 1.23-3 2.75-3s2.75 1.34 2.75 3v4.25c0 1.1-.9 2-2 2h-1.5c-1.1 0-2-.9-2-2V6.5z" />
    <path d="M5.25 7.5H3.5M10.75 7.5H12.5M5.25 10H3.75M10.75 10H12.25M8 3.5V2.5M6.1 4.35 5.1 3.35M9.9 4.35l1-1" />
  </>,
  VB,
);

/** Ask：只读问答。 */

/** Ask：只读问答。 */
export const AskModeIcon = createIcon(
  "AskModeIcon",
  <>
    <path d="M3.5 4.25A1.75 1.75 0 0 1 5.25 2.5h5.5A1.75 1.75 0 0 1 12.5 4.25v4A1.75 1.75 0 0 1 10.75 10H8.1L5.6 12.1V10H5.25A1.75 1.75 0 0 1 3.5 8.25v-4z" />
    <path d="M6.35 5.35c.2-.55.7-.9 1.4-.9.85 0 1.4.5 1.4 1.15 0 .7-.55 1.05-1.1 1.35-.35.2-.55.4-.55.75V7.7M7.75 9.15h.01" />
  </>,
  VB,
);

/** Multitask：并行多线。 */

// —— ChatMode ——

/** Agent：自主执行（星芒）。 */
export const AgentModeIcon = createIcon(
  "AgentModeIcon",
  <path d="M8 2.75 9.1 6.1 12.5 6.4 10 8.85l.7 3.4L8 10.55 5.3 12.25l.7-3.4L3.5 6.4l3.4-.3L8 2.75z" />,
  VB,
);

/** Plan：清单方案。 */

/**
 * 思考 / 推理中：灯泡（玻璃罩 + 螺纹底座）。
 * 罩顶为半径 3.3 的半圆，底座收在 3~13 光学框内；配合呼吸动画读作「在想」。
 */
export const ThinkingIcon = createIcon(
  "ThinkingIcon",
  <>
    <path d="M6.7 9.6c-1.2-.5-2-1.7-2-3a3.3 3.3 0 0 1 6.6 0c0 1.3-.8 2.5-2 3v.6a.85.85 0 0 1-.85.85h-.9a.85.85 0 0 1-.85-.85V9.6z" />
    <path d="M6.95 12.3h2.1" />
  </>,
  VB,
);

/** 时钟 / 耗时。 */

/** Plan：清单方案。 */
export const PlanModeIcon = createIcon(
  "PlanModeIcon",
  <>
    <rect x="3.25" y="2.75" width="9.5" height="10.5" rx="1.35" />
    <path d="M5.5 6h5M5.5 8.25h5M5.5 10.5h3.25" />
  </>,
  VB,
);

/** Debug：缺陷定位。 */
