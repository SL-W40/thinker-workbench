/**
 * 变高虚拟列表：只把视口内的行挂进 DOM，上千行也不会因为一次宽度变化整表重排。
 *
 * 用法：
 * ```tsx
 * const v = useVirtualRows({ count: rows.length, estimate: 30, getKey: (i) => rows[i].key });
 * <div ref={v.scrollRef} className="scroller">
 *   <ul style={{ height: v.contentHeight, position: "relative" }}>
 *     {v.rows.map(({ index, offset }) => (
 *       <li key={...} ref={v.measureRef(index)} style={{ position: "absolute", top: 0, left: 0, right: 0, transform: `translateY(${offset}px)` }}>
 * ```
 *
 * 两个关键点：
 * - 行高按 key 缓存，行顺序 / 数量变化不会互相串号；没量过的行先用 `estimate` 占位。
 * - 量到新高度后按「当前顶行 + 行内偏移」把 scrollTop 补回去（锚定），
 *   否则上方行一变高，视口内容就会整体跳动。
 */
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";

export type VirtualRow = {
  /** 行在数据源中的下标。 */
  index: number;
  /** 行顶相对内容容器顶部的偏移（px）。 */
  offset: number;
};

export type UseVirtualRowsOptions = {
  /** 总行数。 */
  count: number;
  /** 未测量行的估算高度；越接近真实值，滚动条长度越稳。 */
  estimate: number;
  /** 视口上下各多渲染几行，避免快速滚动露白。 */
  overscan?: number;
  /** 行 key：高度缓存按 key 记，列表增删 / 排序后不会串号。 */
  getKey?: (index: number) => string;
};

export type UseVirtualRowsResult = {
  /** 挂在滚动容器上。 */
  scrollRef: (node: HTMLElement | null) => void;
  /** 内容容器要撑出的总高度（px）。 */
  contentHeight: number;
  /** 本次需要渲染的行。 */
  rows: VirtualRow[];
  /** 行测量 ref：`measureRef(index)`，必须挂到行的根元素上。 */
  measureRef: (index: number) => (node: HTMLElement | null) => void;
  /** 把指定行滚进视口（已在视口内则不动）。 */
  scrollToIndex: (index: number) => void;
};

/** 最后一个满足 `offsets[i] <= value` 的下标。 */
function findStartIndex(offsets: Float64Array, value: number, count: number): number {
  let lo = 0;
  let hi = count;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (offsets[mid] <= value) lo = mid + 1;
    else hi = mid;
  }
  return Math.max(0, lo - 1);
}

export function useVirtualRows({
  count,
  estimate,
  overscan = 6,
  getKey,
}: UseVirtualRowsOptions): UseVirtualRowsResult {
  const [scrollEl, setScrollEl] = useState<HTMLElement | null>(null);
  const [scrollTop, setScrollTop] = useState(0);
  const [viewport, setViewport] = useState(0);
  /**
   * 已测量的行高：key -> 高度。放 state 里是为了让偏移能跟着重算；
   * 同一批 RO 回调里的多次写入由 React 自动合并成一次渲染。
   */
  const [heights, setHeights] = useState<ReadonlyMap<string, number>>(() => new Map());
  const offsetsRef = useRef<Float64Array>(new Float64Array(1));
  /** 锚：顶行下标 + 它相对视口顶的偏移，用于量到新高度后把视口拉回去。 */
  const anchorRef = useRef<{ index: number; delta: number } | null>(null);

  const keyOf = useCallback((index: number) => (getKey ? getKey(index) : String(index)), [getKey]);

  // 前缀和：count 或任一已测量行高变化时重算。行数量级在千级，这点开销可以忽略。
  const offsets = useMemo(() => {
    const next = new Float64Array(count + 1);
    let acc = 0;
    for (let i = 0; i < count; i += 1) {
      next[i] = acc;
      acc += heights.get(keyOf(i)) ?? estimate;
    }
    next[count] = acc;
    return next;
  }, [count, estimate, keyOf, heights]);
  offsetsRef.current = offsets;

  const rows = useMemo(() => {
    if (count === 0) return [];
    const bottom = scrollTop + (viewport || estimate * 12);
    const start = Math.max(0, findStartIndex(offsets, scrollTop, count) - overscan);
    let end = start;
    while (end < count && offsets[end] < bottom) end += 1;
    end = Math.min(count, end + overscan);
    const out: VirtualRow[] = [];
    for (let i = start; i < end; i += 1) out.push({ index: i, offset: offsets[i] });
    return out;
  }, [count, offsets, scrollTop, viewport, overscan, estimate]);

  // 视口高度：面板 hidden（clientHeight 为 0）时也要能恢复
  useEffect(() => {
    if (!scrollEl) return;
    const sync = () => setViewport(scrollEl.clientHeight);
    sync();
    if (typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(sync);
    ro.observe(scrollEl);
    return () => ro.disconnect();
  }, [scrollEl]);

  // 滚动：按 rAF 合并，一次滚动事件最多引一次 setState
  useEffect(() => {
    if (!scrollEl) return;
    let raf: number | null = null;
    const onScroll = () => {
      if (raf !== null) return;
      raf = requestAnimationFrame(() => {
        raf = null;
        const top = scrollEl.scrollTop;
        setScrollTop(top);
        const idx = findStartIndex(offsetsRef.current, top, count);
        anchorRef.current = { index: idx, delta: offsetsRef.current[idx] - top };
      });
    };
    scrollEl.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      if (raf !== null) cancelAnimationFrame(raf);
      scrollEl.removeEventListener("scroll", onScroll);
    };
  }, [scrollEl, count]);

  // 量到新高度后把视口拉回锚点，避免上方行变高把内容顶走
  useLayoutEffect(() => {
    const el = scrollEl;
    const anchor = anchorRef.current;
    // 还没滚过就没有锚点（anchorRef 只在滚动时落），此时不需要校正
    if (!el || !anchor) return;
    if (anchor.index >= offsets.length - 1) return;
    const target = offsets[anchor.index] - anchor.delta;
    if (Math.abs(el.scrollTop - target) > 1) el.scrollTop = target;
  }, [offsets, scrollEl]);

  const roRef = useRef<ResizeObserver | null>(null);
  /** 已挂载的行元素（按下标记），卸载时 unobserve。 */
  const nodesRef = useRef(new Map<number, HTMLElement>());
  const indexByElRef = useRef(new WeakMap<Element, number>());
  const refCacheRef = useRef(new Map<number, (node: HTMLElement | null) => void>());

  const record = useCallback(
    (index: number, height: number) => {
      // 面板 hidden 时量到 0，别把 0 写进缓存
      if (height <= 0) return;
      const key = keyOf(index);
      setHeights((prev) => {
        const before = prev.get(key);
        // 抖动小于 0.5px 不重算：否则 RO 的亚像素回调会把渲染打成一团
        if (before != null && Math.abs(before - height) < 0.5) return prev;
        const next = new Map(prev);
        next.set(key, height);
        return next;
      });
    },
    [keyOf],
  );

  // 同一个实例只建一份 RO：每行一个实例会在长列表下变成几百份
  const ensureRo = useCallback(() => {
    if (roRef.current || typeof ResizeObserver === "undefined") return roRef.current;
    roRef.current = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const index = indexByElRef.current.get(entry.target);
        if (index == null) continue;
        const box = entry.borderBoxSize?.[0]?.blockSize;
        record(index, box ?? (entry.target as HTMLElement).offsetHeight);
      }
    });
    return roRef.current;
  }, [record]);

  useEffect(
    () => () => {
      roRef.current?.disconnect();
      roRef.current = null;
    },
    [],
  );

  const measureRef = useCallback(
    (index: number) => {
      const cache = refCacheRef.current;
      const cached = cache.get(index);
      if (cached) return cached;
      const fn = (node: HTMLElement | null) => {
        const prev = nodesRef.current.get(index);
        const ro = roRef.current;
        if (prev && prev !== node && ro) ro.unobserve(prev);
        if (!node) {
          nodesRef.current.delete(index);
          return;
        }
        nodesRef.current.set(index, node);
        indexByElRef.current.set(node, index);
        const observer = ensureRo();
        if (observer) observer.observe(node);
      };
      cache.set(index, fn);
      return fn;
    },
    [ensureRo],
  );

  // 提交后统一量一次：放在 layout effect 里所有行都挂完了，只触发一次强制布局；
  // 若在各自的 ref 回调里逐行读 offsetHeight，每行都可能逼一次同步布局。
  useLayoutEffect(() => {
    for (const [index, node] of nodesRef.current) record(index, node.offsetHeight);
  });

  const scrollToIndex = useCallback(
    (index: number) => {
      const el = scrollEl;
      const off = offsetsRef.current;
      if (!el || count === 0) return;
      const i = Math.min(Math.max(index, 0), count - 1);
      const top = off[i];
      const bottom = off[Math.min(i + 1, count)];
      if (top < el.scrollTop) el.scrollTop = top;
      else if (bottom > el.scrollTop + el.clientHeight) el.scrollTop = bottom - el.clientHeight;
    },
    [scrollEl, count],
  );

  const scrollRef = useCallback((node: HTMLElement | null) => setScrollEl(node), []);

  return {
    scrollRef,
    contentHeight: offsets[count] ?? 0,
    rows,
    measureRef,
    scrollToIndex,
  };
}
