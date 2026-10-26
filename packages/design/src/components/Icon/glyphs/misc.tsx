/**
 * 设置与杂项图标：偏好面板、控制台、调色板、地球、键盘、立方体。
 *
 * 视觉约定见 `Icon/icons.tsx` 头部：16×16、内容落在约 3–13 的光学框内、描边 1.5 圆头端点。
 */
import { createIcon, Icon, type IconProps } from "../Icon";
import { VB } from "./shared";

/** 设置滑块；`active` 时圆点实心。 */
export function SettingsIcon({ active = false, ...rest }: IconProps & { active?: boolean }) {
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

// —— 设置分区 ——

/** 外观 / 主题色板。 */
export const PaletteIcon = createIcon(
  "PaletteIcon",
  <>
    <path d="M8 2.75a5.25 5.25 0 1 0 0 10.5c.85 0 1.35-.65 1.35-1.35 0-.4-.18-.75-.48-1-.28-.22-.42-.55-.42-.95a1.55 1.55 0 0 1 1.55-1.55h.35A3.9 3.9 0 0 0 8 2.75z" />
    <circle cx="6" cy="6.1" r="0.85" />
    <circle cx="8.35" cy="5.15" r="0.85" />
    <circle cx="5.35" cy="8.35" r="0.85" />
  </>,
  VB,
);

/** 通知铃铛。 */

/** 搜索 / 放大镜（命令面板、过滤框）。 */
export const SearchIcon = createIcon(
  "SearchIcon",
  <>
    <circle cx="7.1" cy="7.1" r="4.2" />
    <path d="M10.35 10.35 13.2 13.2" />
  </>,
  VB,
);

/** 快捷键 / 键盘。 */
export const KeyboardIcon = createIcon(
  "KeyboardIcon",
  <>
    <rect x="2.5" y="4.25" width="11" height="7.5" rx="1.35" />
    <path d="M4.5 6.6h1.1M7.1 6.6h1.8M10.4 6.6h1.1M5.1 9.15h5.8" />
  </>,
  VB,
);

/** 模型 / 等距立方体。 */

/** 模型 / 等距立方体。 */
export const CubeIcon = createIcon(
  "CubeIcon",
  <>
    <path d="M8 2.75 13 5.5v5L8 13.25 3 10.5v-5L8 2.75z" />
    <path d="M8 2.75v5.25M3 5.5l5 2.5 5-2.5M8 8v5.25" />
  </>,
  VB,
);

/** 删除 / 垃圾桶。 */

/**
 * 控制台：带顶栏的终端窗；`active` 时顶栏圆点实心。
 */
export function ConsoleIcon({ active = false, ...rest }: IconProps & { active?: boolean }) {
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

/** 浏览器 / 地球。 */
export const GlobeIcon = createIcon(
  "GlobeIcon",
  <>
    <circle cx="8" cy="8" r="5.25" />
    <path d="M2.75 8h10.5" />
    <path d="M8 2.75c1.85 1.85 2.75 3.7 2.75 5.25S9.85 11.4 8 13.25M8 2.75C6.15 4.6 5.25 6.45 5.25 8S6.15 11.4 8 13.25" />
  </>,
  VB,
);

/** 快捷键 / 键盘。 */
