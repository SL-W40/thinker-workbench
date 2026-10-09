/**
 * 定高虚拟窗口：只根据滚动位置计算可见区间，避免长列表挂载全部 DOM。
 */
import { useCallback, useEffect, useRef, useState, type RefObject } from "react";

export type VirtualWindow = {
  start: number;
  end: number;
  offsetY: number;
  totalHeight: number;
};

type Options = {
  count: number;
  rowHeight: number;
  overscan?: number;
  /** 变化时滚回顶部（翻页 / 筛选）。 */
  resetKey?: string | number;
};

export function useVirtualWindow(options: Options): {
  scrollRef: RefObject<HTMLDivElement | null>;
  window: VirtualWindow;
  onScroll: () => void;
} {
  const { count, rowHeight, overscan = 10, resetKey } = options;
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const rafRef = useRef(0);
  const [viewportHeight, setViewportHeight] = useState(320);
  const [scrollTop, setScrollTop] = useState(0);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      const h = entries[0]?.contentRect.height ?? el.clientHeight;
      setViewportHeight(Math.max(0, h));
    });
    ro.observe(el);
    setViewportHeight(el.clientHeight);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTop = 0;
    setScrollTop(0);
  }, [resetKey]);

  const onScroll = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    rafRef.current = requestAnimationFrame(() => {
      setScrollTop(el.scrollTop);
    });
  }, []);

  useEffect(
    () => () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    },
    [],
  );

  // 数据变短时夹紧 scrollTop，避免空白窗
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const maxScroll = Math.max(0, count * rowHeight - el.clientHeight);
    if (el.scrollTop > maxScroll) {
      el.scrollTop = maxScroll;
      setScrollTop(maxScroll);
    }
  }, [count, rowHeight]);

  const totalHeight = count * rowHeight;
  const start = Math.max(0, Math.floor(scrollTop / rowHeight) - overscan);
  const visibleCount = Math.ceil(viewportHeight / rowHeight) + overscan * 2;
  const end = Math.min(count, start + Math.max(visibleCount, 0));
  const offsetY = start * rowHeight;

  return {
    scrollRef,
    window: { start, end, offsetY, totalHeight },
    onScroll,
  };
}
