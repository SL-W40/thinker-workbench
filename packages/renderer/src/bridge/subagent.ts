/**
 * 渲染进程：打开右侧 inspector 子代理时间线 tab。
 * 按会话把已打开 tab + 步骤快照写入 localStorage，刷新后可恢复。
 */
import type { ChatTimelineSubagentStep } from "@thinker-workbench/shared";

/** 时间线 / 后台条请求打开子代理详情。 */
export const OPEN_SUBAGENT_EVENT = "tw:open-subagent";

/** 会话切换时清空子代理 tab。 */
export const CLEAR_SUBAGENT_TABS_EVENT = "tw:clear-subagent-tabs";

/** 绑定会话后：恢复该会话下已打开的子代理 tab。 */
export const RESTORE_SUBAGENT_TABS_EVENT = "tw:restore-subagent-tabs";

type OpenSubagentDetail = {
  taskId: string;
};

type RestoreSubagentDetail = {
  taskIds: string[];
  /** 刷新前若正在看某个 Task tab，则恢复为激活；否则为 null（保持 Files 等）。 */
  activeTaskId: string | null;
};

type SessionSnap = {
  openTaskIds: string[];
  activeTaskId: string | null;
  steps: Record<string, ChatTimelineSubagentStep>;
};

const STORAGE_PREFIX = "thinker.subagent.session.v1.";

const steps = new Map<string, ChatTimelineSubagentStep>();
const listeners = new Set<() => void>();

/** 当前绑定的聊天会话；未绑定则不落盘。 */
let sessionId: string | null = null;
/** 该会话下已打开的 Task tab（有序）。 */
let openTaskIds: string[] = [];
/** 当前激活的 Task；null 表示激活的是非 Task 标签。 */
let activeTaskId: string | null = null;

let pendingOpen: OpenSubagentDetail | null = null;
/** RightInspector 尚未监听时，挂起一次恢复详情。 */
let pendingRestore: RestoreSubagentDetail | null = null;

function notify(): void {
  for (const cb of listeners) cb();
}

function storageKey(sid: string): string {
  return `${STORAGE_PREFIX}${sid}`;
}

function readSnap(sid: string): SessionSnap {
  try {
    const raw = localStorage.getItem(storageKey(sid));
    if (!raw) return { openTaskIds: [], activeTaskId: null, steps: {} };
    const parsed = JSON.parse(raw) as Partial<SessionSnap>;
    const open = Array.isArray(parsed.openTaskIds)
      ? parsed.openTaskIds.filter((id): id is string => typeof id === "string" && id.length > 0)
      : [];
    const stepsObj =
      parsed.steps && typeof parsed.steps === "object" && !Array.isArray(parsed.steps)
        ? (parsed.steps as Record<string, ChatTimelineSubagentStep>)
        : {};
    const active =
      typeof parsed.activeTaskId === "string" && open.includes(parsed.activeTaskId)
        ? parsed.activeTaskId
        : null;
    return { openTaskIds: open, activeTaskId: active, steps: stepsObj };
  } catch {
    return { openTaskIds: [], activeTaskId: null, steps: {} };
  }
}

function writeSnap(): void {
  if (!sessionId) return;
  try {
    const stepsObj: Record<string, ChatTimelineSubagentStep> = {};
    for (const id of openTaskIds) {
      const step = steps.get(id);
      if (step) stepsObj[id] = step;
    }
    const snap: SessionSnap = {
      openTaskIds: [...openTaskIds],
      activeTaskId: activeTaskId && openTaskIds.includes(activeTaskId) ? activeTaskId : null,
      steps: stepsObj,
    };
    localStorage.setItem(storageKey(sessionId), JSON.stringify(snap));
  } catch {
    /* 忽略配额等 */
  }
}

function rememberOpen(taskId: string): void {
  if (!openTaskIds.includes(taskId)) openTaskIds = [...openTaskIds, taskId];
  activeTaskId = taskId;
}

/** 取出并清空待打开详情（RightInspector 挂载时调用）。 */
export function consumePendingOpenSubagent(): OpenSubagentDetail | null {
  const next = pendingOpen;
  pendingOpen = null;
  return next;
}

/** 取出并清空待恢复详情（RightInspector 挂载时调用）。 */
export function consumePendingRestoreSubagent(): RestoreSubagentDetail | null {
  const next = pendingRestore;
  pendingRestore = null;
  return next;
}

/** 当前会话已打开的 Task（供 inspector hydrate 合并，避免被工作空间恢复冲掉）。 */
export function peekOpenSubagents(): RestoreSubagentDetail {
  return {
    taskIds: [...openTaskIds],
    activeTaskId: activeTaskId && openTaskIds.includes(activeTaskId) ? activeTaskId : null,
  };
}

/** 请求打开右侧子代理时间线 tab。 */
export function requestOpenSubagent(step: ChatTimelineSubagentStep): void {
  steps.set(step.taskId, step);
  rememberOpen(step.taskId);
  writeSnap();
  const payload: OpenSubagentDetail = { taskId: step.taskId };
  pendingOpen = payload;
  notify();
  window.dispatchEvent(new CustomEvent(OPEN_SUBAGENT_EVENT, { detail: payload }));
}

/** 主会话仍在推送 progress 时刷新已打开 tab 的详情。 */
export function syncSubagentStep(step: ChatTimelineSubagentStep): void {
  if (!steps.has(step.taskId)) return;
  steps.set(step.taskId, step);
  writeSnap();
  notify();
}

/** 读取当前缓存的子代理步骤。 */
export function getSubagentStep(taskId: string): ChatTimelineSubagentStep | null {
  return steps.get(taskId) ?? null;
}

/** 订阅步骤缓存变更（inspector tab 内容刷新）。 */
export function subscribeSubagentSteps(cb: () => void): () => void {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
}

/**
 * 绑定当前聊天会话：加载该会话已打开的 Task tab / 步骤；
 * 切换会话时不会抹掉其它会话的落盘数据。
 */
export function bindSubagentSession(nextSessionId: string | null): void {
  sessionId = nextSessionId;
  steps.clear();
  openTaskIds = [];
  activeTaskId = null;
  pendingOpen = null;

  if (!nextSessionId) {
    pendingRestore = null;
    notify();
    window.dispatchEvent(new CustomEvent(CLEAR_SUBAGENT_TABS_EVENT));
    return;
  }

  const snap = readSnap(nextSessionId);
  openTaskIds = snap.openTaskIds;
  activeTaskId = snap.activeTaskId;
  for (const id of openTaskIds) {
    const step = snap.steps[id];
    if (step && typeof step.taskId === "string") {
      steps.set(id, step);
    }
  }
  // 丢掉没有步骤快照的幽灵 tab
  openTaskIds = openTaskIds.filter((id) => steps.has(id));
  if (activeTaskId && !steps.has(activeTaskId)) activeTaskId = null;

  notify();
  const detail: RestoreSubagentDetail = {
    taskIds: [...openTaskIds],
    activeTaskId,
  };
  pendingRestore = detail;
  window.dispatchEvent(new CustomEvent(RESTORE_SUBAGENT_TABS_EVENT, { detail }));
}

/** @deprecated 使用 bindSubagentSession；保留给旧调用点。 */
export function clearSubagentTabs(): void {
  bindSubagentSession(null);
}

/** 关闭单个子代理 tab 时丢掉缓存。 */
export function forgetSubagentStep(taskId: string): void {
  if (!steps.delete(taskId) && !openTaskIds.includes(taskId)) return;
  openTaskIds = openTaskIds.filter((id) => id !== taskId);
  if (activeTaskId === taskId) activeTaskId = null;
  writeSnap();
  notify();
}

/**
 * 同步 inspector 当前激活标签：仅当激活的是 Task tab 时记下 id，
 * 否则清空，避免刷新后强行抢回 Task。
 */
export function setActiveSubagentTask(taskId: string | null): void {
  const next = taskId && openTaskIds.includes(taskId) ? taskId : null;
  if (activeTaskId === next) return;
  activeTaskId = next;
  writeSnap();
}

/** tab key。 */
export function subagentTabKey(taskId: string): string {
  return `subagent:${taskId}`;
}
