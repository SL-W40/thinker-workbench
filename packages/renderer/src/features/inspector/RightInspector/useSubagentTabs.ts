/**
 * 子代理 tab 订阅：Task 卡片 / 后台条 / 会话恢复事件 → 标签增删与标题同步。
 */
import { type Dispatch, type SetStateAction, useEffect } from "react";
import {
  CLEAR_SUBAGENT_TABS_EVENT,
  consumePendingOpenSubagent,
  consumePendingRestoreSubagent,
  getSubagentStep,
  OPEN_SUBAGENT_EVENT,
  peekOpenSubagents,
  RESTORE_SUBAGENT_TABS_EVENT,
  setActiveSubagentTask,
  subagentTabKey,
  subscribeSubagentSteps,
} from "../../../platform/ipc/subagent";
import { useT } from "../../../ui/i18n/useI18n";
import { subagentDisplayTitle } from "../../chat";
import type { StageTab } from "../types";

type Translate = ReturnType<typeof useT>;

/** 由 taskId 构造 subagent tab；step 缺失（会话无此任务）时返回 null。 */
export function subagentTabFromTaskId(
  taskId: string,
  t: Translate,
): Extract<StageTab, { kind: "subagent" }> | null {
  const step = getSubagentStep(taskId);
  if (!step) return null;
  const typeRaw = step.subagent.trim();
  const typeName = !typeRaw || typeRaw === "…" ? t("chat.subagent.pendingName") : typeRaw;
  return {
    key: subagentTabKey(taskId),
    kind: "subagent",
    title: subagentDisplayTitle(step),
    taskId,
    subagent: typeName,
  };
}

/** 合并当前会话已打开的 Task tab（按会话记，不进 inspectorUi）。 */
export function openSubagentTabs(t: Translate): Extract<StageTab, { kind: "subagent" }>[] {
  const openSub = peekOpenSubagents();
  const subTabs: Extract<StageTab, { kind: "subagent" }>[] = [];
  for (const taskId of openSub.taskIds) {
    const tab = subagentTabFromTaskId(taskId, t);
    if (tab) subTabs.push(tab);
  }
  return subTabs;
}

/** 订阅子代理事件并维护 tab 集合。 */
export function useSubagentTabs(options: {
  ensureTab: (tab: StageTab) => void;
  setTabs: Dispatch<SetStateAction<StageTab[]>>;
  setActiveTab: Dispatch<SetStateAction<string>>;
}): void {
  const { ensureTab, setTabs, setActiveTab } = options;
  const t = useT();

  useEffect(() => {
    function openByTaskId(taskId: string) {
      const tab = subagentTabFromTaskId(taskId, t);
      if (tab) ensureTab(tab);
    }
    function onOpen(e: Event) {
      const detail = (e as CustomEvent<{ taskId: string }>).detail;
      if (detail?.taskId) openByTaskId(detail.taskId);
    }
    function onClear() {
      setTabs((prev) => {
        const next = prev.filter((tab) => tab.kind !== "subagent");
        setActiveTab((current) =>
          prev.some((tab) => tab.key === current && tab.kind === "subagent")
            ? (next[0]?.key ?? "")
            : current,
        );
        return next;
      });
    }
    /** 刷新或切回会话：重建已打开的 Task tab，并按需激活。*/
    function onRestore(e: Event) {
      const detail = (
        e as CustomEvent<{
          taskIds: string[];
          activeTaskId: string | null;
        }>
      ).detail;
      const taskIds = detail?.taskIds ?? [];
      const restored = taskIds
        .map((id) => subagentTabFromTaskId(id, t))
        .filter((tab): tab is Extract<StageTab, { kind: "subagent" }> => Boolean(tab));
      setTabs((prev) => {
        const kept = prev.filter((tab) => tab.kind !== "subagent");
        return [...kept, ...restored];
      });
      if (detail?.activeTaskId) {
        const key = subagentTabKey(detail.activeTaskId);
        if (restored.some((tab) => tab.key === key)) setActiveTab(key);
      }
    }
    function syncTabTitles() {
      setTabs((prev) => {
        let changed = false;
        const next = prev.map((tab) => {
          if (tab.kind !== "subagent") return tab;
          const step = getSubagentStep(tab.taskId);
          if (!step) return tab;
          const typeRaw = step.subagent.trim();
          const typeName = !typeRaw || typeRaw === "…" ? t("chat.subagent.pendingName") : typeRaw;
          const title = subagentDisplayTitle(step);
          if (tab.title === title && tab.subagent === typeName) return tab;
          changed = true;
          return { ...tab, title, subagent: typeName };
        });
        return changed ? next : prev;
      });
    }
    window.addEventListener(OPEN_SUBAGENT_EVENT, onOpen);
    window.addEventListener(CLEAR_SUBAGENT_TABS_EVENT, onClear);
    window.addEventListener(RESTORE_SUBAGENT_TABS_EVENT, onRestore);
    const unsubSteps = subscribeSubagentSteps(syncTabTitles);
    const pendingRestore = consumePendingRestoreSubagent();
    if (pendingRestore) {
      onRestore(new CustomEvent(RESTORE_SUBAGENT_TABS_EVENT, { detail: pendingRestore }));
    }
    const pending = consumePendingOpenSubagent();
    if (pending?.taskId) openByTaskId(pending.taskId);
    return () => {
      unsubSteps();
      window.removeEventListener(OPEN_SUBAGENT_EVENT, onOpen);
      window.removeEventListener(CLEAR_SUBAGENT_TABS_EVENT, onClear);
      window.removeEventListener(RESTORE_SUBAGENT_TABS_EVENT, onRestore);
    };
  }, [ensureTab, setTabs, setActiveTab, t]);
}

/** 激活 tab 时同步 activeTaskId（刷新后不强行抢回 Task）。 */
export function useActiveSubagentTaskSync(activeTab: string): void {
  useEffect(() => {
    if (!activeTab) return; // 初始无 key，勿冲掉会话恢复的 activeTaskId
    if (activeTab.startsWith("subagent:")) {
      setActiveSubagentTask(activeTab.slice("subagent:".length));
    } else {
      setActiveSubagentTask(null);
    }
  }, [activeTab]);
}
