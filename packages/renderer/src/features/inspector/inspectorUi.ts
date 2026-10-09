/**
 * 右侧 inspector UI 状态（按工作空间）持久化到 localStorage。
 * 不含未命名草稿与编辑器正文。
 */
import {
  CHANGES_TAB_KEY,
  FILES_TAB_KEY,
  type StageTab,
} from "./types";
import { clampFileListWidth, FILE_LIST_WIDTH } from "./useFileListPanel";

const STORAGE_KEY = "thinker.inspector.ui.v1";

export type StoredInspectorTab =
  | { kind: "changes" }
  | { kind: "files" }
  | { kind: "file"; path: string };

export type StoredInspectorUi = {
  tabs: StoredInspectorTab[];
  activeKey: string;
  /** 文件树侧栏：null 表示跟随自动断点。 */
  filesListForced: boolean | null;
  filesListWidth: number;
  changesListForced: boolean | null;
  changesListWidth: number;
  openDirs: string[];
};

const DEFAULTS: StoredInspectorUi = {
  tabs: [],
  activeKey: "",
  filesListForced: null,
  filesListWidth: FILE_LIST_WIDTH.default,
  changesListForced: null,
  changesListWidth: FILE_LIST_WIDTH.default,
  openDirs: [],
};

function storageKey(workspaceId: string): string {
  return `${STORAGE_KEY}.${workspaceId}`;
}

function isStoredTab(value: unknown): value is StoredInspectorTab {
  if (!value || typeof value !== "object") return false;
  const v = value as { kind?: unknown; path?: unknown };
  if (v.kind === "changes" || v.kind === "files") return true;
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
      filesListForced:
        typeof parsed.filesListForced === "boolean" ? parsed.filesListForced : null,
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
      openDirs,
    };
  } catch {
    return { ...DEFAULTS, tabs: [], openDirs: [] };
  }
}

/** 合并写回（保留未出现在 patch 中的字段）。 */
export function patchInspectorUi(
  workspaceId: string | null,
  patch: Partial<StoredInspectorUi>,
): void {
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

/** 运行时 StageTab → 可序列化片段（跳过未命名草稿）。 */
export function serializeTabs(tabs: StageTab[]): StoredInspectorTab[] {
  const out: StoredInspectorTab[] = [];
  for (const tab of tabs) {
    if (tab.kind === "changes") out.push({ kind: "changes" });
    else if (tab.kind === "files") out.push({ kind: "files" });
    else if (tab.kind === "file" && tab.path && !tab.key.startsWith("draft:")) {
      out.push({ kind: "file", path: tab.path });
    }
  }
  return out;
}

/** 序列化片段 → StageTab（标题由调用方按 i18n 填）。 */
export function hydrateTabs(
  stored: StoredInspectorTab[],
  titles: { changes: string; files: string },
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
