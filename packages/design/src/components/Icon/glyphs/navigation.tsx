/**
 * 导航类图标：箭头折叠、侧边栏开关。
 *
 * 视觉约定见 `Icon/icons.tsx` 头部：16×16、内容落在约 3–13 的光学框内、描边 1.5 圆头端点。
 */
import { createIcon, Icon, type IconProps } from "../Icon";
import { VB } from "./shared";

/** 右侧栏（镜像左侧）。 */
export function SidebarRightIcon({ open = false, ...rest }: IconProps & { open?: boolean }) {
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

// —— 导航 / 通用 ——

export const ChevronLeftIcon = createIcon(
  "ChevronLeftIcon",
  <path d="M10.25 3.25 4.75 8l5.5 4.75" />,
  VB,
);

/** 右箭头；`open` 时旋转 90°（树节点展开）。 */

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

/** 双右箭头（标题栏 tab 展开等）。 */

/** 双右箭头（标题栏 tab 展开等）。 */
export const ChevronsRightIcon = createIcon(
  "ChevronsRightIcon",
  <>
    <path d="M4.25 3.25 8.5 8 4.25 12.75" />
    <path d="M8.5 3.25 12.75 8 8.5 12.75" />
  </>,
  VB,
);

// —— 布局 / 工具 ——

/** 左侧栏；`open` 时填充侧栏块。 */
export function SidebarLeftIcon({ open = false, ...rest }: IconProps & { open?: boolean }) {
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
