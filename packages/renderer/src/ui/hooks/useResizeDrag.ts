/**
 * 分栏拖拽：把 pointermove 按 rAF 合并成「一帧最多一次」，松手时再提交最终值。
 *
 * 之前每次 pointermove 都直接 setState：侧栏宽度是顶层 state，一变就是全应用重渲染，
 * 一次拖拽能触发上百次全树渲染 + 上百次 localStorage 写。
 * 合并后每帧最多一次，松手的 onCommit 单独给落盘用。
 *
 * 所有回调都走 ref 转发，调用方不需要自己保证引用稳定。
 */
import {
  type PointerEvent as ReactPointerEvent,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";

type Options = {
  /** 当前宽度；拖拽开始时作为基准（每次渲染同步进 ref，不会读到过期值）。 */
  width: number;
  /** 把「起始宽度 + 指针水平位移」换算成目标宽度。右侧面板向左拖变宽，故取反。 */
  project: (startWidth: number, deltaX: number) => number;
  /** 夹取到合法区间。 */
  clamp?: (width: number) => number;
  /** 每帧的宽度（已经过 rAF 合并）。 */
  onResize: (width: number) => void;
  /** 松手时的最终宽度，用于收尾（落盘等）。 */
  onCommit?: (width: number) => void;
  /** 按下瞬间（第一帧预览之前）：给「冻结拖拽期不该重排的内容」用。 */
  onStart?: () => void;
  /** 松手后（无论是否真的拖动过）：解除冻结。 */
  onEnd?: () => void;
};

export function useResizeDrag(options: Options): {
  dragging: boolean;
  onPointerDown: (event: ReactPointerEvent) => void;
} {
  const [dragging, setDragging] = useState(false);
  const optsRef = useRef(options);
  optsRef.current = options;
  const startRef = useRef({ x: 0, width: 0, moved: false });

  const onPointerDown = useCallback((event: ReactPointerEvent) => {
    event.preventDefault();
    startRef.current = {
      x: event.clientX,
      width: optsRef.current.width,
      moved: false,
    };
    setDragging(true);
    optsRef.current.onStart?.();
  }, []);

  useEffect(() => {
    if (!dragging) return;
    let pending = startRef.current.width;
    let raf: number | null = null;

    const flush = () => {
      raf = null;
      optsRef.current.onResize(pending);
    };

    const onMove = (event: PointerEvent) => {
      const opts = optsRef.current;
      const raw = opts.project(startRef.current.width, event.clientX - startRef.current.x);
      pending = opts.clamp ? opts.clamp(raw) : raw;
      startRef.current.moved = true;
      // 同一帧内的多次 move 只留最后一次，等下一帧统一提交
      if (raf === null) raf = requestAnimationFrame(flush);
    };

    const onUp = () => {
      if (raf !== null) {
        cancelAnimationFrame(raf);
        raf = null;
      }
      if (startRef.current.moved) {
        optsRef.current.onResize(pending);
        optsRef.current.onCommit?.(pending);
      }
      optsRef.current.onEnd?.();
      setDragging(false);
    };

    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";

    return () => {
      if (raf !== null) cancelAnimationFrame(raf);
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };
  }, [dragging]);

  return { dragging, onPointerDown };
}
