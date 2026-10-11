/**
 * 聊天左右侧栏开合与宽度；状态持久化到 localStorage（`tw-chat-panels`）。
 */
import { useCallback, useEffect, useState } from "react";

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

/** 将宽度钳制到 [min, max] 并取整。 */
function clampWidth(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, Math.round(n)));
}

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
          ? clampWidth(parsed.leftWidth, MIN_LEFT_WIDTH, MAX_LEFT_WIDTH)
          : DEFAULT_WIDTH,
      rightWidth:
        typeof parsed.rightWidth === "number"
          ? clampWidth(parsed.rightWidth, MIN_RIGHT_WIDTH, MAX_RIGHT_WIDTH)
          : DEFAULT_RIGHT_WIDTH,
    };
  } catch {
    return { ...DEFAULTS };
  }
}

export function useChatPanels() {
  const [state, setState] = useState<ChatPanelsState>(() => readStored());

  // 任意字段变化即写回 localStorage
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch {
      /* 忽略配额等错误 */
    }
  }, [state]);

  const toggleLeft = useCallback(() => {
    setState((prev) => ({ ...prev, leftOpen: !prev.leftOpen }));
  }, []);

  const toggleRight = useCallback(() => {
    setState((prev) => ({ ...prev, rightOpen: !prev.rightOpen }));
  }, []);

  const setRightOpen = useCallback((open: boolean) => {
    setState((prev) => (prev.rightOpen === open ? prev : { ...prev, rightOpen: open }));
  }, []);

  const setLeftWidth = useCallback((width: number) => {
    setState((prev) => ({
      ...prev,
      leftWidth: clampWidth(width, MIN_LEFT_WIDTH, MAX_LEFT_WIDTH),
    }));
  }, []);

  const setRightWidth = useCallback((width: number) => {
    setState((prev) => ({
      ...prev,
      rightWidth: clampWidth(width, MIN_RIGHT_WIDTH, MAX_RIGHT_WIDTH),
    }));
  }, []);

  return {
    ...state,
    minWidth: MIN_LEFT_WIDTH,
    minRightWidth: MIN_RIGHT_WIDTH,
    maxLeftWidth: MAX_LEFT_WIDTH,
    maxRightWidth: MAX_RIGHT_WIDTH,
    toggleLeft,
    toggleRight,
    setRightOpen,
    setLeftWidth,
    setRightWidth,
  };
}
