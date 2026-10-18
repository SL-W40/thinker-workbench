/**
 * 聊天左右侧栏开合与宽度；状态持久化到 localStorage（`tw-chat-panels`）。
 * 根据壳宽动态钳制，避免侧栏把中间聊天区挤没。
 */
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import {
  allocateMainWidth,
  clampPanelWidth,
  effectivePanelMinWidth,
  fitChatPanelWidths,
  MIN_CHAT_MAIN_WIDTH,
  maxSidePanelWidth,
  resizeSidePanel,
} from "./chatPanelLayout";

const STORAGE_KEY = "tw-chat-panels";

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

  /** 挂到 `.chat-shell`，用 ResizeObserver 跟踪可用宽度。 */
  const shellRef = useCallback((node: HTMLDivElement | null) => {
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

  // 任意字段变化即写回 localStorage
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch {
      /* 忽略配额等错误 */
    }
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

  const mainWidth = allocateMainWidth({
    shellWidth,
    leftOpen: state.leftOpen,
    rightOpen: state.rightOpen,
    leftWidth: state.leftWidth,
    rightWidth: state.rightWidth,
  });

  return {
    ...state,
    shellRef,
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
