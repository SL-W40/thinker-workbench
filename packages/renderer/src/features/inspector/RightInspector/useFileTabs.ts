/**
 * RightInspector 标签与文件操作：开 / 关 / 保存 / 另存 / 草稿。
 */
import { type Dispatch, type SetStateAction, useCallback } from "react";
import { forgetSubagentStep } from "../../../bridge/subagent";
import { workspaceWriteFile } from "../../../bridge/workspaceFs";
import { useT } from "../../../i18n/useI18n";
import { pushFileRecent } from "../fileRecents";
import { resolveActiveKey } from "../inspectorUi";
import type { MediaPreviewInfo } from "../MediaPreview";
import {
  BROWSER_TAB_KEY,
  CHANGES_TAB_KEY,
  FILES_TAB_KEY,
  type StageTab,
  TERMINAL_TAB_KEY,
} from "../types";
import { loadFileBuffers } from "./fileBuffers";
import { baseName, fileTabKey, isDraftTabKey, normalizeRelPath } from "./tabs";

type Translate = ReturnType<typeof useT>;

/** 未命名缓冲首次保存：填写相对路径。 */
type SaveAsState = {
  key: string;
  draft: string;
  /** 保存成功后关闭该标签（来自未保存关闭确认）。*/
  closeAfter?: boolean;
};

export type FileTabSetters = {
  setTabs: Dispatch<SetStateAction<StageTab[]>>;
  setActiveTab: Dispatch<SetStateAction<string>>;
  setTerminalFocusId: Dispatch<SetStateAction<string | null>>;
  setBrowserPendingUrl: Dispatch<SetStateAction<string | null>>;
  setDrafts: Dispatch<SetStateAction<Record<string, string>>>;
  setSaved: Dispatch<SetStateAction<Record<string, string>>>;
  setUnsaved: Dispatch<SetStateAction<Record<string, boolean>>>;
  setReadOnlyByPath: Dispatch<SetStateAction<Record<string, boolean>>>;
  setMediaByKey: Dispatch<SetStateAction<Record<string, MediaPreviewInfo>>>;
  setRecents: Dispatch<SetStateAction<string[]>>;
  setOpenDirs: Dispatch<SetStateAction<Set<string>>>;
  setSaveAs: Dispatch<SetStateAction<SaveAsState | null>>;
  setCloseDirtyKey: Dispatch<SetStateAction<string | null>>;
};

export type FileTabState = {
  workspaceId: string | null;
  currentTab: StageTab | undefined;
  tabs: StageTab[];
  drafts: Record<string, string>;
  saved: Record<string, string>;
  unsaved: Record<string, boolean>;
  readOnlyByPath: Record<string, boolean>;
  mediaByKey: Record<string, MediaPreviewInfo>;
  saveAs: SaveAsState | null;
  closeDirtyKey: string | null;
  draftSeq: { current: number };
  refreshTree: () => void;
  refreshGit: () => void;
};

/** 展开 path 的所有祖先目录。 */
function withAncestorDirs(prev: Set<string>, path: string): Set<string> {
  const next = new Set(prev);
  const parts = path.split("/");
  for (let i = 1; i < parts.length; i++) next.add(parts.slice(0, i).join("/"));
  return next;
}

export function useFileTabs(state: FileTabState, setters: FileTabSetters) {
  const t: Translate = useT();
  const {
    setTabs,
    setActiveTab,
    setTerminalFocusId,
    setBrowserPendingUrl,
    setDrafts,
    setSaved,
    setUnsaved,
    setReadOnlyByPath,
    setMediaByKey,
    setRecents,
    setOpenDirs,
    setSaveAs,
    setCloseDirtyKey,
  } = setters;
  const {
    workspaceId,
    currentTab,
    tabs,
    drafts,
    saved,
    unsaved,
    readOnlyByPath,
    mediaByKey,
    saveAs,
    closeDirtyKey,
    draftSeq,
    refreshTree,
    refreshGit,
  } = state;

  // 以下开面板函数只写 state，提为稳定引用：订阅类 effect 依赖它们，
  // 每渲染换引用会导致反复解绑 / 重绑。
  const ensureTab = useCallback(
    (tab: StageTab) => {
      setTabs((prev) => {
        const idx = prev.findIndex((t) => t.key === tab.key);
        if (idx < 0) return [...prev, tab];
        // 子代理标题可能从 draft 完善：已存在则合并更
        if (tab.kind === "subagent") {
          const cur = prev[idx];
          if (
            cur?.kind === "subagent" &&
            (cur.title !== tab.title || cur.subagent !== tab.subagent)
          ) {
            const next = [...prev];
            next[idx] = { ...cur, title: tab.title, subagent: tab.subagent };
            return next;
          }
        }
        return prev;
      });
      setActiveTab(tab.key);
    },
    [setTabs, setActiveTab],
  );

  const openTerminal = useCallback(
    (sessionId?: string) => {
      ensureTab({
        key: TERMINAL_TAB_KEY,
        kind: "terminal",
        title: t("inspector.section.terminal"),
      });
      if (sessionId?.trim()) setTerminalFocusId(sessionId.trim());
    },
    [ensureTab, t, setTerminalFocusId],
  );

  const openBrowser = useCallback(
    (url?: string) => {
      ensureTab({
        key: BROWSER_TAB_KEY,
        kind: "browser",
        title: t("inspector.section.browser"),
      });
      if (url?.trim()) setBrowserPendingUrl(url.trim());
    },
    [ensureTab, t, setBrowserPendingUrl],
  );

  function openChanges() {
    ensureTab({
      key: CHANGES_TAB_KEY,
      kind: "changes",
      title: t("inspector.section.changes"),
    });
  }

  function openFilesPane() {
    ensureTab({
      key: FILES_TAB_KEY,
      kind: "files",
      title: t("inspector.section.files"),
    });
  }

  async function openFile(path: string) {
    if (!workspaceId || !path) return;
    const key = fileTabKey(path);
    const title = baseName(path);
    setRecents(pushFileRecent(workspaceId, path));

    // 展开祖先目录
    setOpenDirs((prev) => withAncestorDirs(prev, path));

    ensureTab({ key, kind: "file", title, path });

    // 已有草稿或媒体预览则不重新读
    if (drafts[key] != null || saved[key] != null || mediaByKey[key] != null) return;

    const ok = await loadFileBuffers(workspaceId, path, {
      setDrafts,
      setSaved,
      setUnsaved,
      setMediaByKey,
      setReadOnlyByPath,
    });
    if (!ok) {
      setTabs((prev) => {
        const kept = prev.filter((tab) => tab.key !== key);
        queueMicrotask(() => {
          setActiveTab((cur) => (cur === key ? resolveActiveKey(kept, cur) : cur));
        });
        return kept;
      });
    }
  }

  function clearTabBuffers(key: string) {
    setDrafts((d) => {
      const n = { ...d };
      delete n[key];
      return n;
    });
    setSaved((d) => {
      const n = { ...d };
      delete n[key];
      return n;
    });
    setUnsaved((d) => {
      const n = { ...d };
      delete n[key];
      return n;
    });
    setMediaByKey((d) => {
      const n = { ...d };
      delete n[key];
      return n;
    });
  }

  /** 将内容写入磁盘；未命名缓冲会迁到 `file:` 标签。*/
  async function writeFileAt(key: string, path: string) {
    if (!workspaceId) return;
    const content = drafts[key] ?? "";
    await workspaceWriteFile(workspaceId, path, content);
    const newKey = fileTabKey(path);
    const title = baseName(path);

    if (key !== newKey) {
      setTabs((prev) => {
        const next = prev.filter((tab) => tab.key !== key && tab.key !== newKey);
        return [...next, { key: newKey, kind: "file", title, path }];
      });
      setActiveTab(newKey);
      clearTabBuffers(key);
      setDrafts((d) => ({ ...d, [newKey]: content }));
      setSaved((d) => ({ ...d, [newKey]: content }));
      setUnsaved((d) => ({ ...d, [newKey]: false }));
      setReadOnlyByPath((d) => ({ ...d, [path]: false }));
    } else {
      setTabs((prev) =>
        prev.map((tab) => (tab.key === key && tab.kind === "file" ? { ...tab, title, path } : tab)),
      );
      setSaved((d) => ({ ...d, [key]: content }));
      setUnsaved((d) => ({ ...d, [key]: false }));
    }

    setRecents(pushFileRecent(workspaceId, path));
    setOpenDirs((prev) => withAncestorDirs(prev, path));
    void refreshTree();
    void refreshGit();
  }

  async function saveFile() {
    if (!workspaceId || currentTab?.kind !== "file") return;
    const key = currentTab.key;
    if (currentTab.path && readOnlyByPath[currentTab.path]) return;
    // 未命名：先弹路径再落盘（Electron ?window.prompt：
    if (!currentTab.path || isDraftTabKey(key)) {
      setSaveAs({ key, draft: "untitled.ts" });
      return;
    }
    await writeFileAt(key, currentTab.path);
  }

  async function commitSaveAs() {
    if (!saveAs) return;
    const path = normalizeRelPath(saveAs.draft);
    if (!path) return;
    const key = saveAs.key;
    const closeAfter = Boolean(saveAs.closeAfter);
    setSaveAs(null);
    await writeFileAt(key, path);
    if (closeAfter) forceCloseTab(fileTabKey(path));
  }

  /** 新建：直接打开未命名编辑器，保存时再填路径。*/
  function onNewFile() {
    draftSeq.current += 1;
    const n = draftSeq.current;
    const key = `draft:${n}`;
    const base = t("inspector.files.untitled");
    const title = n === 1 ? base : `${base} ${n}`;
    ensureTab({ key, kind: "file", title, path: "" });
    setDrafts((d) => ({ ...d, [key]: "" }));
    setSaved((d) => ({ ...d, [key]: "" }));
    setUnsaved((d) => ({ ...d, [key]: true }));
  }

  /** 关闭标签（不经未保存确认）。*/
  function forceCloseTab(key: string) {
    setTabs((prev) => {
      const closing = prev.find((t) => t.key === key);
      if (closing?.kind === "subagent") {
        forgetSubagentStep(closing.taskId);
      }
      const next = prev.filter((t) => t.key !== key);
      const idx = prev.findIndex((t) => t.key === key);
      const fallback = next[Math.max(0, idx - 1)] ?? next[0];
      // 用函数式读最新 activeTab，避免 save+close 改掉 key 后闭包过期
      setActiveTab((current) => (current === key ? (fallback?.key ?? "") : current));
      return next;
    });
    if (key.startsWith("file:") || isDraftTabKey(key)) {
      clearTabBuffers(key);
    }
  }

  function closeTab(key: string) {
    const tab = tabs.find((t) => t.key === key);
    if (tab?.kind === "file" && unsaved[key]) {
      setCloseDirtyKey(key);
      return;
    }
    forceCloseTab(key);
  }

  /** 未保存关闭弹窗：保存后关闭。*/
  async function saveAndCloseDirty() {
    if (!closeDirtyKey) return;
    const key = closeDirtyKey;
    const tab = tabs.find((t) => t.key === key);
    setCloseDirtyKey(null);
    if (tab?.kind !== "file") return;
    if (!tab.path || isDraftTabKey(key)) {
      setSaveAs({
        key,
        draft: tab.path || "untitled.ts",
        closeAfter: true,
      });
      return;
    }
    await writeFileAt(key, tab.path);
    forceCloseTab(key);
  }

  function discardAndCloseDirty() {
    if (!closeDirtyKey) return;
    const key = closeDirtyKey;
    setCloseDirtyKey(null);
    forceCloseTab(key);
  }

  function onFileDraftChange(value: string) {
    if (currentTab?.kind !== "file") return;
    const key = currentTab.key;
    setDrafts((d) => ({ ...d, [key]: value }));
    setUnsaved((d) => ({ ...d, [key]: value !== (saved[key] ?? "") }));
  }

  return {
    ensureTab,
    openTerminal,
    openBrowser,
    openChanges,
    openFilesPane,
    openFile,
    saveFile,
    commitSaveAs,
    onNewFile,
    forceCloseTab,
    closeTab,
    saveAndCloseDirty,
    discardAndCloseDirty,
    onFileDraftChange,
  };
}
