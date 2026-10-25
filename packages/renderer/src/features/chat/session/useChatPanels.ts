/**
 * 聊天左右侧栏开合与宽度；状态持久化到 localStorage（`tw-chat-panels`）。
 * 根据壳宽动态钳制，避免侧栏把中间聊天区挤没。
 *
 * 三栏宽度以 CSS 变量下发到 `.chat-shell`（`shellVars`），DOM 宽度由变量决定。
 * 拖拽期间走 `previewWidth` 直接改变量、不 setState —— 宽度一旦进 React state，
 * 每一帧都会把整棵树（会话列表 / 时间线 / 编辑器 / 文件树）重渲染一遍，
 * 这是拖拽卡顿的根因；改为松手时由 `setLeftWidth` / `setRightWidth` 提交一次。
 */
import {
  type CSSProperties,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  allocateMainWidth,
  clampPanelWidth,
  effectivePanelMinWidth,
  fitChatPanelWidths,
  MIN_CHAT_MAIN_WIDTH,
  maxSidePanelWidth,
  resizeSidePanel,
} from "../panels/chatPanelLayout";

const STORAGE_KEY = "tw-chat-panels";

/** 三栏宽度变量名：写在 `.chat-shell` 上，供面板样式与拖拽预览共用。 */
const VAR_LEFT = "--chat-left-width";
const VAR_RIGHT = "--chat-right-width";
const VAR_MAIN = "--chat-main-width";
/**
 * 加在 `.chat-shell` 上的拖拽态标记。
 *
 * 现在只用于两类「拖拽期该停掉的工作」，不再冻结内容宽度：
 * - `.chat-side__body` / `.stage-shell` 加 `contain: layout`，把重排圈在容器内；
 * - `useFileListPanel` 的 ResizeObserver 据此推迟内嵌文件列表的开合，
 *   否则拖过 560px 断点时会在拖拽途中整块挂载 / 卸载。
 * 松手必须清掉，否则后一条会永久失效。
 */
const RESIZING_CLASS = "is-resizing";

export type ChatPanelsState = {
  leftOpen: boolean;
  rightOpen: boolean;
  leftWidth: number;
  rightWidth: number;
};

const MIN_LEFT_WIDTH = 180;
/** 右侧 inspector：需容纳 Changes 起始磁贴上的 +/- 统计，不宜过窄。 */
const MIN_RIGHT_WIDTH = 300;
/** 左侧工作区列表：不需要拉得很宽。 */
const MAX_LEFT_WIDTH = 360;
/** 右侧 Files / Changes / 预览：大屏可再宽一些。 */
const MAX_RIGHT_WIDTH = 1200;
const DEFAULT_WIDTH = 260;
const DEFAULT_RIGHT_WIDTH = 380;

const DEFAULTS: ChatPanelsState = {
  // 仅当 localStorage 无记录时默认打开左侧 Workspaces
  leftOpen: true,
  rightOpen: false,
  leftWidth: DEFAULT_WIDTH,
  rightWidth: DEFAULT_RIGHT_WIDTH,
};

/** 从 localStorage 读取侧栏状态；损坏或缺失时用默认值。 */
function readStored(): ChatPanelsState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULTS };
    const parsed = JSON.parse(raw) as Partial<ChatPanelsState>;
    return {
      leftOpen: Boolean(parsed.leftOpen),
      rightOpen: Boolean(parsed.rightOpen),
      leftWidth:
        typeof parsed.leftWidth === "number"
          ? clampPanelWidth(parsed.leftWidth, MIN_LEFT_WIDTH, MAX_LEFT_WIDTH)
          : DEFAULT_WIDTH,
      rightWidth:
        typeof parsed.rightWidth === "number"
          ? clampPanelWidth(parsed.rightWidth, MIN_RIGHT_WIDTH, MAX_RIGHT_WIDTH)
          : DEFAULT_RIGHT_WIDTH,
    };
  } catch {
    return { ...DEFAULTS };
  }
}

export function useChatPanels() {
  const [state, setState] = useState<ChatPanelsState>(() => readStored());
  const [shellWidth, setShellWidth] = useState(0);
  const shellRoRef = useRef<ResizeObserver | null>(null);
  /** 壳节点本身：拖拽预览要直接往它身上写 CSS 变量。 */
  const shellElRef = useRef<HTMLDivElement | null>(null);
  // 拖拽预览不触发渲染，这两份快照天然停在「起手那一刻」，正是投影所需的基准值
  const stateRef = useRef(state);
  stateRef.current = state;
  const shellWidthRef = useRef(shellWidth);
  shellWidthRef.current = shellWidth;

  /** 挂到 `.chat-shell`，用 ResizeObserver 跟踪可用宽度。 */
  const shellRef = useCallback((node: HTMLDivElement | null) => {
    shellElRef.current = node;
    shellRoRef.current?.disconnect();
    shellRoRef.current = null;
    if (!node) {
      setShellWidth(0);
      return;
    }
    const apply = () => setShellWidth(node.clientWidth);
    apply();
    if (typeof ResizeObserver !== "undefined") {
      const ro = new ResizeObserver(apply);
      ro.observe(node);
      shellRoRef.current = ro;
    }
  }, []);

  // 任意字段变化即写回 localStorage，但防抖合并：
  // 拖拽时宽度每帧都在变，同步写会把每一帧都堵在主线程上。
  useEffect(() => {
    const write = () => {
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
      } catch {
        /* 忽略配额等错误 */
      }
    };
    const timer = setTimeout(write, 200);
    // 关窗前补写一次，避免最后一次调整落在防抖窗口里丢失
    window.addEventListener("pagehide", write);
    return () => {
      clearTimeout(timer);
      window.removeEventListener("pagehide", write);
    };
  }, [state]);

  // 壳宽或开合变化时，压缩侧栏以保住聊天最小宽
  // biome-ignore lint/correctness/useExhaustiveDependencies: state.leftOpen / state.rightOpen 未在函数体读取但刻意保留：开合切换后需要重新压缩侧栏宽度
  useLayoutEffect(() => {
    if (shellWidth <= 0) return;
    setState((prev) => {
      const fitted = fitChatPanelWidths({
        shellWidth,
        leftOpen: prev.leftOpen,
        rightOpen: prev.rightOpen,
        leftWidth: prev.leftWidth,
        rightWidth: prev.rightWidth,
        minLeft: MIN_LEFT_WIDTH,
        maxLeft: MAX_LEFT_WIDTH,
        minRight: MIN_RIGHT_WIDTH,
        maxRight: MAX_RIGHT_WIDTH,
        minChat: MIN_CHAT_MAIN_WIDTH,
      });
      if (fitted.leftWidth === prev.leftWidth && fitted.rightWidth === prev.rightWidth) {
        return prev;
      }
      return { ...prev, leftWidth: fitted.leftWidth, rightWidth: fitted.rightWidth };
    });
  }, [shellWidth, state.leftOpen, state.rightOpen]);

  const toggleLeft = useCallback(() => {
    setState((prev) => ({ ...prev, leftOpen: !prev.leftOpen }));
  }, []);

  const toggleRight = useCallback(() => {
    setState((prev) => ({ ...prev, rightOpen: !prev.rightOpen }));
  }, []);

  const setRightOpen = useCallback((open: boolean) => {
    setState((prev) => (prev.rightOpen === open ? prev : { ...prev, rightOpen: open }));
  }, []);

  // 拖拽上限按「对侧可让到 min」计算，否则中间锁死后本侧拉不动
  const effectiveMaxLeft = maxSidePanelWidth({
    shellWidth,
    otherTaken: state.rightOpen ? MIN_RIGHT_WIDTH : 0,
    maxWidth: MAX_LEFT_WIDTH,
    minChat: MIN_CHAT_MAIN_WIDTH,
  });

  const effectiveMaxRight = maxSidePanelWidth({
    shellWidth,
    otherTaken: state.leftOpen ? MIN_LEFT_WIDTH : 0,
    maxWidth: MAX_RIGHT_WIDTH,
    minChat: MIN_CHAT_MAIN_WIDTH,
  });

  const setLeftWidth = useCallback(
    (width: number) => {
      setState((prev) => {
        const next = resizeSidePanel({
          side: "left",
          nextWidth: width,
          shellWidth,
          leftOpen: prev.leftOpen,
          rightOpen: prev.rightOpen,
          leftWidth: prev.leftWidth,
          rightWidth: prev.rightWidth,
          minLeft: MIN_LEFT_WIDTH,
          maxLeft: MAX_LEFT_WIDTH,
          minRight: MIN_RIGHT_WIDTH,
          maxRight: MAX_RIGHT_WIDTH,
          minChat: MIN_CHAT_MAIN_WIDTH,
        });
        if (next.leftWidth === prev.leftWidth && next.rightWidth === prev.rightWidth) {
          return prev;
        }
        return { ...prev, leftWidth: next.leftWidth, rightWidth: next.rightWidth };
      });
    },
    [shellWidth],
  );

  const setRightWidth = useCallback(
    (width: number) => {
      setState((prev) => {
        const next = resizeSidePanel({
          side: "right",
          nextWidth: width,
          shellWidth,
          leftOpen: prev.leftOpen,
          rightOpen: prev.rightOpen,
          leftWidth: prev.leftWidth,
          rightWidth: prev.rightWidth,
          minLeft: MIN_LEFT_WIDTH,
          maxLeft: MAX_LEFT_WIDTH,
          minRight: MIN_RIGHT_WIDTH,
          maxRight: MAX_RIGHT_WIDTH,
          minChat: MIN_CHAT_MAIN_WIDTH,
        });
        if (next.leftWidth === prev.leftWidth && next.rightWidth === prev.rightWidth) {
          return prev;
        }
        return { ...prev, leftWidth: next.leftWidth, rightWidth: next.rightWidth };
      });
    },
    [shellWidth],
  );

  /** 按起手快照算一次「拖到目标宽度」后的三栏结果；纯计算，不产生渲染。 */
  const resolveResize = useCallback((side: "left" | "right", nextWidth: number) => {
    const prev = stateRef.current;
    const width = shellWidthRef.current;
    const next = resizeSidePanel({
      side,
      nextWidth,
      shellWidth: width,
      leftOpen: prev.leftOpen,
      rightOpen: prev.rightOpen,
      leftWidth: prev.leftWidth,
      rightWidth: prev.rightWidth,
      minLeft: MIN_LEFT_WIDTH,
      maxLeft: MAX_LEFT_WIDTH,
      minRight: MIN_RIGHT_WIDTH,
      maxRight: MAX_RIGHT_WIDTH,
      minChat: MIN_CHAT_MAIN_WIDTH,
    });
    return {
      ...next,
      mainWidth: allocateMainWidth({
        shellWidth: width,
        leftOpen: prev.leftOpen,
        rightOpen: prev.rightOpen,
        leftWidth: next.leftWidth,
        rightWidth: next.rightWidth,
      }),
    };
  }, []);

  /**
   * 拖拽过程预览：直接写壳节点上的 CSS 变量，不 setState。
   * 每帧只改三个变量（一次样式重算），React 树完全不动。
   */
  const previewWidth = useCallback(
    (side: "left" | "right", nextWidth: number) => {
      const el = shellElRef.current;
      if (!el) return;
      const next = resolveResize(side, nextWidth);
      el.style.setProperty(VAR_LEFT, `${next.leftWidth}px`);
      el.style.setProperty(VAR_RIGHT, `${next.rightWidth}px`);
      // 壳宽还没量到时中间列仍按 CSS 的 flex: 1 1 auto 吃剩余，别写成 0
      if (next.mainWidth > 0) el.style.setProperty(VAR_MAIN, `${next.mainWidth}px`);
    },
    [resolveResize],
  );

  /**
   * 起手：只打拖拽标记。内容宽度不再冻结 —— 面板随拖拽实时重排，
   * 不卡顿靠的是 previewWidth 每帧只写 CSS 变量不渲染，加上列表已虚拟化
   * （屏内只有十几行）与拖拽期给气泡加的 content-visibility。
   *
   * data-resize-side 目前没有样式消费，留着是为了「只降级中间列」这条回退路径：
   * 真到那一步时 CSS 需要区分这次拖的是哪一栏。
   */
  const beginResize = useCallback((side: "left" | "right") => {
    const el = shellElRef.current;
    if (!el) return;
    el.dataset.resizeSide = side;
    el.classList.add(RESIZING_CLASS);
  }, []);

  /** 松手：清掉拖拽标记。无论这一下有没有真的拖动都会走到（见 useResizeDrag）。 */
  const endResize = useCallback(() => {
    const el = shellElRef.current;
    if (!el) return;
    el.classList.remove(RESIZING_CLASS);
    delete el.dataset.resizeSide;
  }, []);

  const mainWidth = allocateMainWidth({
    shellWidth,
    leftOpen: state.leftOpen,
    rightOpen: state.rightOpen,
    leftWidth: state.leftWidth,
    rightWidth: state.rightWidth,
  });

  /** 提交态的三栏宽度变量；拖拽期被 previewWidth 临时覆盖，松手后由本值统一。 */
  const shellVars = useMemo<CSSProperties>(() => {
    const vars: Record<string, string> = {
      [VAR_LEFT]: `${state.leftWidth}px`,
      [VAR_RIGHT]: `${state.rightWidth}px`,
    };
    if (mainWidth > 0) vars[VAR_MAIN] = `${mainWidth}px`;
    return vars as CSSProperties;
  }, [state.leftWidth, state.rightWidth, mainWidth]);

  return {
    ...state,
    shellRef,
    shellVars,
    previewWidth,
    beginResize,
    endResize,
    mainWidth,
    minWidth: effectivePanelMinWidth(MIN_LEFT_WIDTH, effectiveMaxLeft),
    minRightWidth: effectivePanelMinWidth(MIN_RIGHT_WIDTH, effectiveMaxRight),
    maxLeftWidth: effectiveMaxLeft,
    maxRightWidth: effectiveMaxRight,
    toggleLeft,
    toggleRight,
    setRightOpen,
    setLeftWidth,
    setRightWidth,
  };
}
