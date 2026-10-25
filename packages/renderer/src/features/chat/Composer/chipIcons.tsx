/**
 * 芯片前缀图标（`/` 代码、网址链条）。
 * React（气泡）与纯 DOM（composer contentEditable 内的芯片）共用同一份 path 数据。
 */
// biome-ignore-all lint/a11y/noSvgWithoutTitle: 装饰性图标，语义由芯片标签承载
export type ChipIconKind = "slash" | "link";

const CHIP_ICON_PATH: Record<ChipIconKind, string> = {
  // `< >` 代码角标
  slash: "M5.6 5 3 8l2.6 3M10.4 5 13 8l-2.6 3",
  // 链条
  link: "M6.8 9.2 9.2 6.8M7.6 4.8 8.8 3.6a2.5 2.5 0 0 1 3.5 3.5L11.1 8.3M8.4 11.2l-1.2 1.2a2.5 2.5 0 0 1-3.5-3.5L4.9 7.7",
};

const SVG_ATTRS = {
  width: 13,
  height: 13,
  viewBox: "0 0 16 16",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.3,
  strokeLinecap: "round",
  strokeLinejoin: "round",
} as const;

/** React 版（消息气泡）。 */
export function ChipIcon({ kind }: { kind: ChipIconKind }) {
  return (
    <svg {...SVG_ATTRS}>
      <path d={CHIP_ICON_PATH[kind]} />
    </svg>
  );
}

/** DOM 版：返回整段 svg 字符串，供 contentEditable 内手工构造的芯片使用。 */
export function chipIconMarkup(kind: ChipIconKind): string {
  return `<svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${CHIP_ICON_PATH[kind]}"/></svg>`;
}
