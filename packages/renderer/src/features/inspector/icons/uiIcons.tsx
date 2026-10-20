/**
 * 通用 UI 图标：面板 / 折叠箭头 / 更多 / 菜单图标集合 MI。
 */
// biome-ignore-all lint/a11y/noSvgWithoutTitle: 本文件是纯装饰性图标集合，svg 全部 aria-hidden，不承载语义，无需 title
import type { ReactNode } from "react";

export function IconPanelHide() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.4"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <rect x="2" y="2.5" width="12" height="11" rx="1.6" />
      <path d="M10.2 2.5v11" />
    </svg>
  );
}

export function IconChevron({ open }: { open?: boolean }) {
  return (
    <svg
      width="10"
      height="10"
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      style={{ transform: open ? "rotate(90deg)" : undefined, transition: "transform 0.12s ease" }}
    >
      <path d="M6 3.5 10.5 8 6 12.5" />
    </svg>
  );
}

/** 竖向三点（更多操作）图标。 */
export function MoreVerticalIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
      <circle cx="8" cy="3" r="1.4" />
      <circle cx="8" cy="8" r="1.4" />
      <circle cx="8" cy="13" r="1.4" />
    </svg>
  );
}

function MenuIcon({ d, extra }: { d: string; extra?: ReactNode }) {
  return (
    <svg
      width="13"
      height="13"
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.4"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d={d} />
      {extra}
    </svg>
  );
}

export const MI = {
  open: <MenuIcon d="M2.5 8.5 6 12l7.5-8" />,
  newFile: <MenuIcon d="M4 2h5l3.5 3.5V14H4zM9 2v4h4M8 8v4M6 10h4" />,
  newFolder: (
    <MenuIcon d="M2 4.5A1.5 1.5 0 0 1 3.5 3h2.7a1 1 0 0 1 .8.4l.7 1H12.5A1.5 1.5 0 0 1 14 5.9v5.6A1.5 1.5 0 0 1 12.5 13h-9A1.5 1.5 0 0 1 2 11.5zM8 7v4M6 9h4" />
  ),
  rename: <MenuIcon d="M10.7 3.3a1.6 1.6 0 0 1 2.3 2.3L6 12.6l-3 .7.7-3zM9.5 4.5l2.3 2.3" />,
  copy: <MenuIcon d="M5.5 5.5h7v7h-7zM10.5 5.5v-2h-7v7h2" />,
  scissors: (
    <MenuIcon d="M5 3.5a2 2 0 1 1-1.4 3.4L7 10l-3.4 3.1A2 2 0 1 1 5 16.5M7 10l5.5-5M7 10l5.5 5" />
  ),
  clipboard: (
    <MenuIcon d="M6 2.5h4a1 1 0 0 1 1 1V4h1.5A1.5 1.5 0 0 1 14 5.5v7A1.5 1.5 0 0 1 12.5 14h-9A1.5 1.5 0 0 1 2 12.5v-7A1.5 1.5 0 0 1 3.5 4H5V3.5a1 1 0 0 1 1-1zM6 4h4" />
  ),
  selectAll: <MenuIcon d="M2.5 2.5h4v4h-4zM9.5 2.5h4v4h-4zM2.5 9.5h4v4h-4zM9.5 9.5h4v4h-4z" />,
  duplicate: <MenuIcon d="M4 2h5l3.5 3.5V14H4zM9 2v4h4M6.5 9.5h4M6.5 11.5h2.5" />,
  del: <MenuIcon d="M3 4.5h10M6.5 4.5V3h3v1.5M4.5 4.5 5.2 13h5.6l.7-8.5M6.8 7v3.6M9.2 7v3.6" />,
  reveal: (
    <MenuIcon d="M2 4.5A1.5 1.5 0 0 1 3.5 3h2.7a1 1 0 0 1 .8.4l.7 1H12.5A1.5 1.5 0 0 1 14 5.9v5.6A1.5 1.5 0 0 1 12.5 13h-9A1.5 1.5 0 0 1 2 11.5zM8 7.2v3.6M8 7.2 6.6 8.6M8 7.2l1.4 1.4" />
  ),
  copyPath: <MenuIcon d="M4 2h5l3.5 3.5V14H4zM9 2v4h4M6 9h4M6 11h3" />,
  collapse: <MenuIcon d="M4 6.5 8 3l4 3.5M4 9.5 8 13l4-3.5" />,
  expand: <MenuIcon d="M4 3.5 8 7l4-3.5M4 9 8 12.5 12 9" />,
  refresh: <MenuIcon d="M13 8a5 5 0 1 1-1.5-3.6M13 2.8v2.4h-2.4" />,
  chat: (
    <MenuIcon d="M2.5 4.2A1.7 1.7 0 0 1 4.2 2.5h7.6a1.7 1.7 0 0 1 1.7 1.7v5a1.7 1.7 0 0 1-1.7 1.7H7l-2.8 2.4v-2.4H4.2a1.7 1.7 0 0 1-1.7-1.7z" />
  ),
  pin: <MenuIcon d="M6 2.5h4l-.6 4 2.1 2.5H4.5L6.6 6.5zM8 9v4.5" />,
  panel: <MenuIcon d="M2.5 3.5h11v9h-11zM10.5 3.5v9" />,
  close: <MenuIcon d="M4 4l8 8M12 4 4 12" />,
  closeRight: <MenuIcon d="M2.5 4h4.2v8H2.5zM8.8 8h4.7M11.2 5.8 13.5 8l-2.3 2.2" />,
  closeLeft: <MenuIcon d="M9.3 4h4.2v8H9.3zM7.2 8H2.5M4.8 5.8 2.5 8l2.3 2.2" />,
  closeAll: <MenuIcon d="M3 4.5h10M3 8h10M3 11.5h10" />,
};
