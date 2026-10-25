/** 侧栏文件列表宽度拖拽与按面板宽度自动开合。 */
import {
  type PointerEvent as ReactPointerEvent,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import { useResizeDrag } from "../../ui/hooks/useResizeDrag";

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

export function useFileListWidth(initial: number = FILE_LIST_WIDTH.default, _resetKey?: string) {
  const [width, setWidth] = useState<number>(() => clampFileListWidth(initial));

  // 切换工作空间 / 外部恢复时重同步宽度
  useEffect(() => {
    setWidth(clampFileListWidth(initial));
  }, [initial]);

  // 侧栏在右侧：向左拖 -> 变宽。走 useResizeDrag 按帧合并，避免每次 move 都 setState。
  const { dragging, onPointerDown } = useResizeDrag({
    width,
    project: (startWidth, delta) => startWidth - delta,
    clamp: clampFileListWidth,
    onResize: setWidth,
  });

  const onResizePointerDown = useCallback(
    (e: ReactPointerEvent) => {
      // 手柄在面板内部，阻止冒泡以免触发行的选中 / 拖拽
      e.stopPropagation();
      onPointerDown(e);
    },
    [onPointerDown],
  );

  return { width, dragging, onResizePointerDown };
}

/**
 * 面板够宽时自动打开文件列表；偏窄时保持关闭，除非用户手动切换。
 * 穿越断点会清除手动覆盖（除非刚从存储恢复了 forced）。
 */
export function useFileListOpen(
  autoMin: number = FILE_LIST_AUTO_PANE_MIN,
  _resetKey?: string,
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
  }, [initialForced]);

  const paneRef = useCallback((node: HTMLElement | null) => {
    setPaneEl(node);
  }, []);

  useEffect(() => {
    if (!paneEl) return;

    const apply = (w: number) => {
      const next = w >= autoMin;
      if (!skipClearOnReset.current && prevWide.current !== null && prevWide.current !== next) {
        setForced(null);
      }
      skipClearOnReset.current = false;
      prevWide.current = next;
      setAutoOpen(next);
    };

    apply(paneEl.getBoundingClientRect().width);
    const ro = new ResizeObserver((entries) => {
      const w = entries[0]?.contentRect.width;
      if (typeof w !== "number") return;
      // 拖拽跨过断点时别在拖拽途中开合：那是一次整块挂载 / 卸载 + 大范围重排。
      // 松手后宽度会再变一次（预览值落到 state），RO 自然会在那时补上判定。
      // is-resizing 由 useChatPanels 在起手 / 松手时加删，现在只用于这一处的推迟。
      if (paneEl.closest(".chat-shell.is-resizing")) return;
      apply(w);
    });
    ro.observe(paneEl);
    return () => ro.disconnect();
  }, [paneEl, autoMin]);

  const open = forced ?? autoOpen;
  const toggle = useCallback(() => {
    setForced((prev) => !(prev ?? autoOpen));
  }, [autoOpen]);
  const setOpen = useCallback((next: boolean) => {
    setForced(next);
  }, []);

  return { open, forced, toggle, setOpen, paneRef };
}
