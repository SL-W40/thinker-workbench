/**
 * 右侧 inspector UI 状态（按工作空间）持久化到 localStorage。
 * 不含未命名草稿与编辑器正文。
 */

import { planTabKey } from "./RightInspector/tabs";
import {
  BROWSER_TAB_KEY,
  CHANGES_TAB_KEY,
  FILES_TAB_KEY,
  type StageTab,
  TERMINAL_TAB_KEY,
} from "./types";
import { clampFileListWidth, FILE_LIST_WIDTH } from "./useFileListPanel";

const STORAGE_KEY = "thinker.inspector.ui.v1";

export type StoredInspectorTab =
  | { kind: "changes" }
  | { kind: "files" }
  | { kind: "terminal" }
  | { kind: "browser" }
  /** 计划文档（虚拟文档，重启后靠会话活跃计划补内容）。 */
  | { kind: "plan"; planId: string }
  | { kind: "file"; path: string };

/**
 * Changes 面板上次用哪种方式提交（模式不再做成可见控件，藏在「提交」菜单里）：
 * - ai：把「建分支 / 提交 / 推送 / 开 PR」交给 agent 办
 * - manual：自己填说明，直接调 git
 */
export type ChangesCommitMode = "ai" | "manual";

export type StoredInspectorUi = {
  tabs: StoredInspectorTab[];
  activeKey: string;
  /** 文件树侧栏：null 表示跟随自动断点。 */
  filesListForced: boolean | null;
  filesListWidth: number;
  changesListForced: boolean | null;
  changesListWidth: number;
  /** Changes 面板上次用哪种方式提交；manual 时重开直接展开输入框。 */
  changesCommitMode: ChangesCommitMode;
  openDirs: string[];
  /** 内置浏览器最后地址（重启后还原）。 */
  browserUrl: string;
};

const DEFAULTS: StoredInspectorUi = {
  tabs: [],
  activeKey: "",
  filesListForced: null,
  filesListWidth: FILE_LIST_WIDTH.default,
  changesListForced: null,
  changesListWidth: FILE_LIST_WIDTH.default,
  // 默认 AI 代办：与整合前的顶部主按钮定位一致
  changesCommitMode: "ai",
  openDirs: [],
  browserUrl: "",
};

function isChangesCommitMode(value: unknown): value is ChangesCommitMode {
  return value === "ai" || value === "manual";
}

function storageKey(workspaceId: string): string {
  return `${STORAGE_KEY}.${workspaceId}`;
}

function isStoredTab(value: unknown): value is StoredInspectorTab {
  if (!value || typeof value !== "object") return false;
  const v = value as { kind?: unknown; path?: unknown; planId?: unknown };
  if (v.kind === "changes" || v.kind === "files" || v.kind === "terminal" || v.kind === "browser") {
    return true;
  }
  if (v.kind === "plan") return typeof v.planId === "string" && v.planId.length > 0;
  return v.kind === "file" && typeof v.path === "string" && v.path.length > 0;
}

/** 读取某工作空间的 inspector UI；损坏时返回默认空态。 */
export function loadInspectorUi(workspaceId: string | null): StoredInspectorUi {
  if (!workspaceId) return { ...DEFAULTS, tabs: [], openDirs: [] };
  try {
    const raw = localStorage.getItem(storageKey(workspaceId));
    if (!raw) return { ...DEFAULTS, tabs: [], openDirs: [] };
    const parsed = JSON.parse(raw) as Partial<StoredInspectorUi>;
    const tabs = Array.isArray(parsed.tabs) ? parsed.tabs.filter(isStoredTab) : [];
    const openDirs = Array.isArray(parsed.openDirs)
      ? parsed.openDirs.filter((p): p is string => typeof p === "string")
      : [];
    return {
      tabs,
      activeKey: typeof parsed.activeKey === "string" ? parsed.activeKey : "",
      filesListForced: typeof parsed.filesListForced === "boolean" ? parsed.filesListForced : null,
      filesListWidth:
        typeof parsed.filesListWidth === "number"
          ? clampFileListWidth(parsed.filesListWidth)
          : FILE_LIST_WIDTH.default,
      changesListForced:
        typeof parsed.changesListForced === "boolean" ? parsed.changesListForced : null,
      changesListWidth:
        typeof parsed.changesListWidth === "number"
          ? clampFileListWidth(parsed.changesListWidth)
          : FILE_LIST_WIDTH.default,
      changesCommitMode: isChangesCommitMode(parsed.changesCommitMode)
        ? parsed.changesCommitMode
        : DEFAULTS.changesCommitMode,
      openDirs,
      browserUrl: typeof parsed.browserUrl === "string" ? parsed.browserUrl : "",
    };
  } catch {
    return { ...DEFAULTS, tabs: [], openDirs: [] };
  }
}

/** 同步落盘一次（保留未出现在 patch 中的字段）。 */
function writeInspectorUi(workspaceId: string | null, patch: Partial<StoredInspectorUi>): void {
  if (!workspaceId) return;
  try {
    const prev = loadInspectorUi(workspaceId);
    const next: StoredInspectorUi = {
      ...prev,
      ...patch,
      tabs: patch.tabs ?? prev.tabs,
      openDirs: patch.openDirs ?? prev.openDirs,
      filesListWidth:
        typeof patch.filesListWidth === "number"
          ? clampFileListWidth(patch.filesListWidth)
          : prev.filesListWidth,
      changesListWidth:
        typeof patch.changesListWidth === "number"
          ? clampFileListWidth(patch.changesListWidth)
          : prev.changesListWidth,
    };
    localStorage.setItem(storageKey(workspaceId), JSON.stringify(next));
  } catch {
    /* 忽略配额等 */
  }
}

/**
 * 待写的 patch，按 workspaceId 合并；同一 workspace 的连续改动只留最后一次合并结果。
 */
const pendingPatches = new Map<string, Partial<StoredInspectorUi>>();
let flushTimer: ReturnType<typeof setTimeout> | null = null;

/** 把攒下的 patch 立刻写完（防抖窗口内最后一次改动由它兜底）。 */
export function flushInspectorUi(): void {
  if (flushTimer !== null) {
    clearTimeout(flushTimer);
    flushTimer = null;
  }
  for (const [workspaceId, patch] of pendingPatches) {
    writeInspectorUi(workspaceId, patch);
  }
  pendingPatches.clear();
}

/**
 * 合并写回（保留未出现在 patch 中的字段）。
 *
 * 落盘防抖：切 tab、展开目录、拖宽度会连续触发多次写入，而每次写都是
 * getItem + parse + stringify（全量 tabs）+ setItem 的同步阻塞主线程。
 * 200ms 合并成一次，关窗 / 隐藏页面时由 flushInspectorUi 补写。
 */
export function patchInspectorUi(
  workspaceId: string | null,
  patch: Partial<StoredInspectorUi>,
): void {
  if (!workspaceId) return;
  pendingPatches.set(workspaceId, { ...pendingPatches.get(workspaceId), ...patch });
  if (flushTimer === null) flushTimer = setTimeout(flushInspectorUi, 200);
}

// 关窗 / 切走前补写，避免最后一次改动落在防抖窗口里丢失
if (typeof window !== "undefined") {
  window.addEventListener("pagehide", flushInspectorUi);
}

/** 运行时 StageTab → 可序列化片段（跳过未命名草稿）。 */
export function serializeTabs(tabs: StageTab[]): StoredInspectorTab[] {
  const out: StoredInspectorTab[] = [];
  for (const tab of tabs) {
    if (tab.kind === "changes") out.push({ kind: "changes" });
    else if (tab.kind === "files") out.push({ kind: "files" });
    else if (tab.kind === "terminal") out.push({ kind: "terminal" });
    else if (tab.kind === "browser") out.push({ kind: "browser" });
    else if (tab.kind === "plan" && tab.planId) out.push({ kind: "plan", planId: tab.planId });
    else if (tab.kind === "file" && tab.path && !tab.key.startsWith("draft:")) {
      out.push({ kind: "file", path: tab.path });
    }
  }
  return out;
}

/** 序列化片段 → StageTab（标题由调用方按 i18n 填）。 */
export function hydrateTabs(
  stored: StoredInspectorTab[],
  titles: { changes: string; files: string; terminal: string; browser: string; plan: string },
): StageTab[] {
  const out: StageTab[] = [];
  const seen = new Set<string>();
  for (const item of stored) {
    if (item.kind === "changes") {
      if (seen.has(CHANGES_TAB_KEY)) continue;
      seen.add(CHANGES_TAB_KEY);
      out.push({ key: CHANGES_TAB_KEY, kind: "changes", title: titles.changes });
    } else if (item.kind === "files") {
      if (seen.has(FILES_TAB_KEY)) continue;
      seen.add(FILES_TAB_KEY);
      out.push({ key: FILES_TAB_KEY, kind: "files", title: titles.files });
    } else if (item.kind === "terminal") {
      if (seen.has(TERMINAL_TAB_KEY)) continue;
      seen.add(TERMINAL_TAB_KEY);
      out.push({ key: TERMINAL_TAB_KEY, kind: "terminal", title: titles.terminal });
    } else if (item.kind === "browser") {
      if (seen.has(BROWSER_TAB_KEY)) continue;
      seen.add(BROWSER_TAB_KEY);
      out.push({ key: BROWSER_TAB_KEY, kind: "browser", title: titles.browser });
    } else if (item.kind === "plan") {
      const key = planTabKey(item.planId);
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({ key, kind: "plan", title: titles.plan, planId: item.planId });
    } else {
      const key = `file:${item.path}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const parts = item.path.replace(/\\/g, "/").split("/");
      const title = parts[parts.length - 1] || item.path;
      out.push({ key, kind: "file", title, path: item.path });
    }
  }
  return out;
}

/** 校验 activeKey 是否仍在标签列表中。 */
export function resolveActiveKey(tabs: StageTab[], activeKey: string): string {
  if (tabs.some((tab) => tab.key === activeKey)) return activeKey;
  return tabs[0]?.key ?? "";
}
