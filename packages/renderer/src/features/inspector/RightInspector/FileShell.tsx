/**
 * RightInspector 文件壳：文件树标签铺满面板；打开文件后只留编辑器 / 预览。
 */

import { ContextMenu, Input } from "@thinker-workbench/design/react";
import type { WorkspaceNode } from "@thinker-workbench/shared";
import { memo, type MouseEvent as ReactMouseEvent, useRef } from "react";
import { useStableCallback } from "../../../ui/hooks/useStableCallback";
import { useT } from "../../../ui/i18n/useI18n";
import type { ChangeTreeNode } from "../changesTree";
import { FileEditor } from "../FileEditor";
import { FileTreeActionModals, type FileTreeActions, useFileTreeActions } from "../FileTreeActions";
import { MarkdownFileView } from "../MarkdownFileView";
import { MediaPreview, type MediaPreviewInfo } from "../MediaPreview";
import type { TreeGesture, TreeSelectionJoin } from "../TreeView";
import { TreeView } from "../TreeView";
import type { StageTab } from "../types";

/** 侧栏文件树右键菜单状态。 */
export type TreeCtxMenu = {
  x: number;
  y: number;
  path: string;
  kind: "file" | "dir";
};

type Props = {
  currentTab: StageTab | undefined;
  /** Files 标签：整面板就是文件树，不再走最近文件首页。 */
  showFileTree: boolean;
  onOpenFile: (path: string) => void;
  onNewFile: () => void;
  /** 当前工作空间：新建 / 重命名 / 删除等写操作的目标。 */
  workspaceId: string;
  /** 写操作完成后刷新文件树。 */
  onChanged: () => void;
  drafts: Record<string, string>;
  mediaByKey: Record<string, MediaPreviewInfo>;
  readOnlyByPath: Record<string, boolean>;
  onFileDraftChange: (value: string) => void;
  onSaveFile: () => void;
  treeQuery: string;
  onTreeQueryChange: (value: string) => void;
  treeRoot: WorkspaceNode | null;
  treeNodes: ChangeTreeNode[];
  effectiveOpenDirs: Set<string>;
  selectedPaths: Set<string>;
  selectionJoins: ReadonlyMap<string, TreeSelectionJoin>;
  onTreeActivate: (node: ChangeTreeNode, gesture: TreeGesture) => void;
  treeCtxMenu: TreeCtxMenu | null;
  onTreeCtxMenu: (menu: TreeCtxMenu | null) => void;
  copyPathText: (path: string) => void;
};

/** memo：文件壳内含编辑器与文件树，顶层 state 变化不该让它整棵重渲染。 */
export const FileShell = memo(function FileShell({
  currentTab,
  showFileTree,
  onOpenFile,
  onNewFile,
  workspaceId,
  onChanged,
  drafts,
  mediaByKey,
  readOnlyByPath,
  onFileDraftChange,
  onSaveFile,
  treeQuery,
  onTreeQueryChange,
  treeRoot,
  treeNodes,
  effectiveOpenDirs,
  selectedPaths,
  selectionJoins,
  onTreeActivate,
  treeCtxMenu,
  onTreeCtxMenu,
  copyPathText,
}: Props) {
  const t = useT();
  const actions = useFileTreeActions(workspaceId, onChanged);

  // TreeView 是 memo 的：传进去的回调必须引用稳定，否则父组件一重渲染整棵树就重跑一遍。
  // onMove 里 actions 每次渲染都是新对象，用 useStableCallback 包一层既能保持引用恒定、
  // 又不会读到过期闭包（它始终转发给最新一次渲染的 actions）。
  const stableMove = useStableCallback((source: string, dir: string) => {
    void actions.move(source, dir);
  });
  const stableCtxMenu = useStableCallback(
    (e: ReactMouseEvent, path: string, kind: "file" | "dir") => {
      e.preventDefault();
      e.stopPropagation();
      onTreeCtxMenu({ x: e.clientX, y: e.clientY, path, kind });
    },
  );

  const fileTab: Extract<StageTab, { kind: "file" }> | null =
    currentTab?.kind === "file" ? currentTab : null;
  const isMedia = fileTab ? Boolean(mediaByKey[fileTab.key]) : false;
  const isMarkdown = fileTab ? /\.(md|markdown|mdx)$/i.test(fileTab.path ?? "") : false;
  const showMonaco = Boolean(fileTab) && !isMedia && !isMarkdown;

  // Monaco 常驻：editor widget 每次挂载都会拉起一个独占的 web worker，
  // 切文件 / 切 tab 反复重建是「打开文件卡」的主因。这里全程只保留一个实例，
  // 非代码文件时用 hidden 隐藏（尺寸归零由 automaticLayout 在重新显示时自愈），
  // 切回来只是一次 model 切换，不再重建 widget。
  const monacoFile = useRef<{ key: string; path: string | null } | null>(null);
  if (fileTab && showMonaco) {
    monacoFile.current = { key: fileTab.key, path: fileTab.path ?? null };
  }
  const monacoTarget = monacoFile.current;

  const treePanel = showFileTree ? (
    <FileTreePanel
      query={treeQuery}
      onQueryChange={onTreeQueryChange}
      treeRoot={treeRoot}
      treeNodes={treeNodes}
      openDirs={effectiveOpenDirs}
      focusPath={currentTab?.kind === "file" ? currentTab.path : null}
      selectedPaths={selectedPaths}
      selectionJoins={selectionJoins}
      onActivate={onTreeActivate}
      onMove={stableMove}
      onContextMenu={stableCtxMenu}
      ctxMenu={treeCtxMenu}
      onCtxMenu={onTreeCtxMenu}
      actions={actions}
      onOpenFile={onOpenFile}
      onNewFile={onNewFile}
      copyPathText={copyPathText}
    />
  ) : null;

  return (
    <div className={`agent-files${showFileTree ? " is-tree" : ""}`}>
      {showFileTree ? null : (
        <div className="agent-files__main">
          {fileTab ? (
            <div className="agent-files__editor">
              {monacoTarget ? (
                <div className="agent-files__monaco" hidden={!showMonaco}>
                  <FileEditor
                    path={monacoTarget.path}
                    modelPath={monacoTarget.key}
                    value={drafts[monacoTarget.key] ?? ""}
                    readOnly={Boolean(monacoTarget.path && readOnlyByPath[monacoTarget.path])}
                    onChange={onFileDraftChange}
                    onSave={onSaveFile}
                  />
                </div>
              ) : null}
              {isMedia ? (
                <MediaPreview
                  path={fileTab.path || t("inspector.files.untitled")}
                  info={mediaByKey[fileTab.key]}
                />
              ) : null}
              {!isMedia && isMarkdown ? (
                <MarkdownFileView
                  path={fileTab.path || null}
                  modelPath={fileTab.key}
                  value={drafts[fileTab.key] ?? ""}
                  readOnly={Boolean(fileTab.path && readOnlyByPath[fileTab.path])}
                  onChange={onFileDraftChange}
                  onSave={onSaveFile}
                  onOpenFile={onOpenFile}
                />
              ) : null}
            </div>
          ) : null}
        </div>
      )}

      {treePanel}
    </div>
  );
});

function FileTreePanel({
  query,
  onQueryChange,
  treeRoot,
  treeNodes,
  openDirs,
  focusPath,
  selectedPaths,
  selectionJoins,
  onActivate,
  onMove,
  onContextMenu,
  ctxMenu,
  onCtxMenu,
  actions,
  onOpenFile,
  onNewFile,
  copyPathText,
}: {
  query: string;
  onQueryChange: (value: string) => void;
  treeRoot: WorkspaceNode | null;
  treeNodes: ChangeTreeNode[];
  openDirs: Set<string>;
  focusPath: string | null;
  selectedPaths: Set<string>;
  selectionJoins: ReadonlyMap<string, TreeSelectionJoin>;
  onActivate: (node: ChangeTreeNode, gesture: TreeGesture) => void;
  onMove: (source: string, dir: string) => void;
  onContextMenu: (e: ReactMouseEvent, path: string, kind: "file" | "dir") => void;
  ctxMenu: TreeCtxMenu | null;
  onCtxMenu: (menu: TreeCtxMenu | null) => void;
  actions: FileTreeActions;
  onOpenFile: (path: string) => void;
  onNewFile: () => void;
  copyPathText: (path: string) => void;
}) {
  const t = useT();
  return (
    <aside className="agent-files__tree-pane">
      <div className="changes-filelist__search">
        <span className="changes-filelist__search-ico" aria-hidden>
          {/* biome-ignore lint/a11y/noSvgWithoutTitle: 纯装饰性搜索图标，label 内 input 已有语义 */}
          <svg width="15" height="15" viewBox="0 0 16 16" fill="none">
            <circle cx="7" cy="7" r="4.5" stroke="currentColor" strokeWidth="1.55" />
            <path
              d="M10.4 10.4 13.6 13.6"
              stroke="currentColor"
              strokeWidth="1.55"
              strokeLinecap="round"
            />
          </svg>
        </span>
        <Input
          value={query}
          onChange={(e) => onQueryChange(e.target.value)}
          placeholder={t("inspector.files.searchPlaceholder")}
          aria-label={t("inspector.files.searchPlaceholder")}
        />
      </div>
      <div className="agent-files__tree">
        {treeRoot ? (
          <TreeView
            nodes={treeNodes}
            openDirs={openDirs}
            focusPath={focusPath}
            selectedPaths={selectedPaths}
            selectionJoins={selectionJoins}
            onActivate={onActivate}
            onMove={onMove}
            onContextMenu={onContextMenu}
          />
        ) : (
          <div className="ws-empty">{t("inspector.files.emptyTree")}</div>
        )}
      </div>
      <ContextMenu
        open={Boolean(ctxMenu)}
        anchor={ctxMenu ? { x: ctxMenu.x, y: ctxMenu.y } : null}
        onClose={() => onCtxMenu(null)}
        aria-label={t("inspector.files.fileMenu")}
        items={
          ctxMenu?.kind === "file"
            ? [
                {
                  label: t("inspector.changes.openFile"),
                  onSelect: () => {
                    const path = ctxMenu.path;
                    onCtxMenu(null);
                    onOpenFile(path);
                  },
                },
                {
                  label: t("inspector.files.revealInFolder"),
                  onSelect: () => {
                    const path = ctxMenu.path;
                    onCtxMenu(null);
                    void actions.reveal(path);
                  },
                },
                {
                  label: t("inspector.changes.copyPath"),
                  onSelect: () => {
                    const path = ctxMenu.path;
                    onCtxMenu(null);
                    copyPathText(path);
                  },
                },
                {
                  label: t("inspector.files.rename"),
                  separatorBefore: true,
                  onSelect: () => {
                    const path = ctxMenu.path;
                    onCtxMenu(null);
                    actions.startRename(path);
                  },
                },
                {
                  label: t("inspector.files.trash"),
                  onSelect: () => {
                    const path = ctxMenu.path;
                    onCtxMenu(null);
                    actions.setPendingRemove(path);
                  },
                },
              ]
            : ctxMenu
              ? [
                  {
                    label: t("inspector.files.newFile"),
                    onSelect: () => {
                      const path = ctxMenu.path;
                      onCtxMenu(null);
                      actions.startNewFile(path);
                    },
                  },
                  {
                    label: t("inspector.files.newFolder"),
                    onSelect: () => {
                      const path = ctxMenu.path;
                      onCtxMenu(null);
                      actions.startNewFolder(path);
                    },
                  },
                  {
                    // 另存为：走编辑器保存对话框（与「在树内新建空文件」区分）
                    label: t("inspector.files.saveAsTitle"),
                    onSelect: () => {
                      onCtxMenu(null);
                      onNewFile();
                    },
                  },
                  {
                    label: t("inspector.files.revealInFolder"),
                    separatorBefore: true,
                    onSelect: () => {
                      const path = ctxMenu.path;
                      onCtxMenu(null);
                      void actions.reveal(path);
                    },
                  },
                  {
                    label: t("inspector.changes.copyPath"),
                    onSelect: () => {
                      const path = ctxMenu.path;
                      onCtxMenu(null);
                      copyPathText(path);
                    },
                  },
                  // 工作空间根不允许改名 / 删除，否则会作用到整个仓库。
                  ...(ctxMenu.path === "."
                    ? []
                    : [
                        {
                          label: t("inspector.files.rename"),
                          separatorBefore: true,
                          onSelect: () => {
                            const path = ctxMenu.path;
                            onCtxMenu(null);
                            actions.startRename(path);
                          },
                        },
                        {
                          label: t("inspector.files.trash"),
                          onSelect: () => {
                            const path = ctxMenu.path;
                            onCtxMenu(null);
                            actions.setPendingRemove(path);
                          },
                        },
                      ]),
                ]
              : []
        }
      />
      <FileTreeActionModals actions={actions} />
    </aside>
  );
}
