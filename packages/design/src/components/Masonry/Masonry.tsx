/**
 * 瀑布流布局：按容器宽度分列，把每个子项放到当前最短列。
 * 用绝对定位 + ResizeObserver，避免 CSS column-count 在 Electron 里叠片。
 */
import { useLayoutEffect, useRef, type ReactNode } from "react";

const DEFAULT_GAP = 16;

/** 列数断点：按容器内容宽度从窄到宽匹配，未命中则用 `columns`。 */
export type MasonryBreakpoint = {
  /** 容器宽度上限（含）。 */
  maxWidth: number;
  /** 该宽度下的列数。 */
  columns: number;
};

const DEFAULT_BREAKPOINTS: MasonryBreakpoint[] = [
  { maxWidth: 700, columns: 1 },
  { maxWidth: 1100, columns: 2 },
];

export type MasonryProps = {
  children: ReactNode;
  /** 列间距（px）。默认 16。 */
  gap?: number;
  /** 默认（最宽）列数。默认 3。 */
  columns?: number;
  /**
   * 响应式断点（按 maxWidth 升序）。
   * 默认：≤700→1 列，≤1100→2 列，更宽→`columns`。
   */
  breakpoints?: MasonryBreakpoint[];
  /** 追加到根节点的 class。 */
  className?: string;
};

/** 按容器宽度解析列数。 */
function resolveColumns(
  width: number,
  columns: number,
  breakpoints: MasonryBreakpoint[],
): number {
  const sorted = [...breakpoints].sort((a, b) => a.maxWidth - b.maxWidth);
  for (const bp of sorted) {
    if (width <= bp.maxWidth) return Math.max(1, bp.columns);
  }
  return Math.max(1, columns);
}

/**
 * 子项应为可量高度的块级元素；布局后写入 left/top/width，并撑开容器高度。
 */
export function Masonry({
  children,
  gap = DEFAULT_GAP,
  columns = 3,
  breakpoints = DEFAULT_BREAKPOINTS,
  className,
}: MasonryProps) {
  const rootRef = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    const root = rootRef.current;
    if (!root) return;

    let raf = 0;
    const observed = new Set<Element>();

    const schedule = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(layout);
    };

    const observeItems = () => {
      for (const el of Array.from(root.children)) {
        if (observed.has(el)) continue;
        observed.add(el);
        ro.observe(el);
      }
    };

    const layout = () => {
      const items = Array.from(root.children) as HTMLElement[];
      if (items.length === 0) {
        root.style.height = "0px";
        root.dataset.ready = "1";
        return;
      }

      const width = root.clientWidth;
      const cols = resolveColumns(width, columns, breakpoints);
      const colWidth = Math.max(0, (width - gap * (cols - 1)) / cols);
      const colHeights = Array.from({ length: cols }, () => 0);

      for (const el of items) {
        el.style.position = "absolute";
        el.style.boxSizing = "border-box";
        el.style.width = `${colWidth}px`;
        el.style.margin = "0";
      }

      // 宽度写好后再量高度（换列宽可能改 wrap）
      for (const el of items) {
        const col = colHeights.indexOf(Math.min(...colHeights));
        const left = col * (colWidth + gap);
        const top = colHeights[col] ?? 0;
        el.style.left = `${left}px`;
        el.style.top = `${top}px`;
        colHeights[col] = top + el.offsetHeight + gap;
      }

      const maxH = Math.max(0, ...colHeights);
      root.style.height = `${Math.max(0, maxH - gap)}px`;
      root.dataset.ready = "1";
    };

    const ro = new ResizeObserver(schedule);
    ro.observe(root);
    observeItems();
    layout();

    const mo = new MutationObserver(() => {
      observeItems();
      schedule();
    });
    mo.observe(root, { childList: true });

    void document.fonts?.ready?.then(schedule);

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      mo.disconnect();
    };
  }, [gap, columns, breakpoints]);

  return (
    <div
      ref={rootRef}
      className={["tw-masonry", className].filter(Boolean).join(" ")}
      data-ready="0"
    >
      {children}
    </div>
  );
}
