/** 侧栏文件列表宽度拖拽与按面板宽度自动开合。 */
import {
  type PointerEvent as ReactPointerEvent,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";

export const FILE_LIST_WIDTH = {
  default: 260,
  min: 180,
  max: 480,
} as const;

/** 面板宽度达到此值时自动展开文件列表（工作空间上限约 720px，阈值需更低）。 */
export const FILE_LIST_AUTO_PANE_MIN = 560;

export function clampFileListWidth(n: number): number {
  return Math.min(FILE_LIST_WIDTH.max, Math.max(FILE_LIST_WIDTH.min, Math.round(n)));
}

export function useFileListWidth(initial: number = FILE_LIST_WIDTH.default, resetKey?: string) {
  const [width, setWidth] = useState<number>(() => clampFileListWidth(initial));
  const [dragging, setDragging] = useState(false);
  const dragRef = useRef<{ startX: number; startW: number } | null>(null);
  const widthRef = useRef(width);
  widthRef.current = width;

  // 切换工作空间 / 外部恢复时重同步宽度
  useEffect(() => {
    setWidth(clampFileListWidth(initial));
  }, [resetKey, initial]);

  useEffect(() => {
    const onMove = (e: PointerEvent) => {
      const d = dragRef.current;
      if (!d) return;
      // 侧栏在右侧：向左拖 → 变宽。
      setWidth(clampFileListWidth(d.startW + (d.startX - e.clientX)));
    };
    const onUp = () => {
      if (!dragRef.current) return;
      dragRef.current = null;
      setDragging(false);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
    };
  }, []);

  const onResizePointerDown = useCallback((e: ReactPointerEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragRef.current = { startX: e.clientX, startW: widthRef.current };
    setDragging(true);
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
  }, []);

  return { width, dragging, onResizePointerDown };
}

/**
 * 面板够宽时自动打开文件列表；偏窄时保持关闭，除非用户手动切换。
 * 穿越断点会清除手动覆盖（除非刚从存储恢复了 forced）。
 */
export function useFileListOpen(
  autoMin: number = FILE_LIST_AUTO_PANE_MIN,
  resetKey?: string,
  initialForced: boolean | null = null,
) {
  const [paneEl, setPaneEl] = useState<HTMLElement | null>(null);
  const [autoOpen, setAutoOpen] = useState(false);
  const [forced, setForced] = useState<boolean | null>(initialForced);
  const prevWide = useRef<boolean | null>(null);
  const skipClearOnReset = useRef(true);

  // 切换工作空间时恢复手动开合
  useEffect(() => {
    setForced(initialForced);
    prevWide.current = null;
    skipClearOnReset.current = true;
  }, [resetKey, initialForced]);

  const paneRef = useCallback((node: HTMLElement | null) => {
    setPaneEl(node);
  }, []);

  useEffect(() => {
    if (!paneEl) return;

    const apply = (w: number) => {
      const next = w >= autoMin;
      if (
        !skipClearOnReset.current &&
        prevWide.current !== null &&
        prevWide.current !== next
      ) {
        setForced(null);
      }
      skipClearOnReset.current = false;
      prevWide.current = next;
      setAutoOpen(next);
    };

    apply(paneEl.getBoundingClientRect().width);
    const ro = new ResizeObserver((entries) => {
      const w = entries[0]?.contentRect.width;
      if (typeof w === "number") apply(w);
    });
    ro.observe(paneEl);
    return () => ro.disconnect();
  }, [paneEl, autoMin, resetKey]);

  const open = forced ?? autoOpen;
  const toggle = useCallback(() => {
    setForced((prev) => !(prev ?? autoOpen));
  }, [autoOpen]);
  const setOpen = useCallback((next: boolean) => {
    setForced(next);
  }, []);

  return { open, forced, toggle, setOpen, paneRef };
}
