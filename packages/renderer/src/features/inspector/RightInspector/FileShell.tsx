/**
 * RightInspector 文件壳：编辑器 / 媒体预览 / Markdown + 侧栏文件树。
 */

import { ContextMenu, Input } from "@thinker-workbench/design/react";
import type { WorkspaceNode } from "@thinker-workbench/shared";
import {
  memo,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
  useRef,
} from "react";
import { useStableCallback } from "../../../ui/hooks/useStableCallback";
import { useT } from "../../../ui/i18n/useI18n";
import type { ChangeTreeNode } from "../changesTree";
import { FileEditor } from "../FileEditor";
import { FilesHome } from "../FilesHome";
import { FileTreeActionModals, useFileTreeActions } from "../FileTreeActions";
import { MarkdownFileView } from "../MarkdownFileView";
import { MediaPreview, type MediaPreviewInfo } from "../MediaPreview";
import type { TreeGesture, TreeSelectionJoin } from "../TreeView";
import { TreeView } from "../TreeView";
import type { StageTab } from "../types";
import { FILE_LIST_WIDTH } from "../useFileListPanel";

/** 侧栏文件树右键菜单状态。 */
export type TreeCtxMenu = {
  x: number;
  y: number;
  path: string;
  kind: "file" | "dir";
};

type Props = {
  currentTab: StageTab | undefined;
  showFilesHome: boolean;
  filesPaneRef: (node: HTMLDivElement | null) => void;
  filesListOpen: boolean;
  filesListWidth: number;
  filesListDragging: boolean;
  onFilesListResize: (e: ReactPointerEvent) => void;
  recents: string[];
  fileCandidates: string[];
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
  showFilesHome,
  filesPaneRef,
  filesListOpen,
  filesListWidth,
  filesListDragging,
  onFilesListResize,
  recents,
  fileCandidates,
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

  return (
    <div
      ref={filesPaneRef}
      className={`agent-files${!showFilesHome && filesListOpen ? " has-side" : ""}`}
    >
      <div className="agent-files__main">
        {showFilesHome ? (
          <FilesHome
            recents={recents}
            fileCandidates={fileCandidates}
            onOpenFile={(path) => onOpenFile(path)}
            onNewFile={onNewFile}
          />
        ) : fileTab ? (
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

      {!showFilesHome && filesListOpen ? (
        <aside className="agent-files__side" style={{ width: filesListWidth }}>
          {/* biome-ignore lint/a11y/useSemanticElements: 文件列表拖宽手柄，ARIA separator + 指针拖拽模式，无对应原生控件 */}
          <div
            className={`filelist-splitter${filesListDragging ? " is-dragging" : ""}`}
            onPointerDown={onFilesListResize}
            role="separator"
            aria-orientation="vertical"
            aria-valuenow={filesListWidth}
            aria-valuemin={FILE_LIST_WIDTH.min}
            aria-valuemax={FILE_LIST_WIDTH.max}
            aria-label={t("inspector.files.resizeTree")}
          />
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
              value={treeQuery}
              onChange={(e) => onTreeQueryChange(e.target.value)}
              placeholder={t("inspector.files.searchPlaceholder")}
              aria-label={t("inspector.files.searchPlaceholder")}
            />
          </div>
          <div className="agent-files__tree">
            {treeRoot ? (
              <TreeView
                nodes={treeNodes}
                openDirs={effectiveOpenDirs}
                focusPath={currentTab?.kind === "file" ? currentTab.path : null}
                selectedPaths={selectedPaths}
                selectionJoins={selectionJoins}
                onActivate={onTreeActivate}
                onMove={stableMove}
                onContextMenu={stableCtxMenu}
              />
            ) : (
              <div className="ws-empty">{t("inspector.files.emptyTree")}</div>
            )}
          </div>
          <ContextMenu
            open={Boolean(treeCtxMenu)}
            anchor={treeCtxMenu ? { x: treeCtxMenu.x, y: treeCtxMenu.y } : null}
            onClose={() => onTreeCtxMenu(null)}
            aria-label={t("inspector.files.fileMenu")}
            items={
              treeCtxMenu?.kind === "file"
                ? [
                    {
                      label: t("inspector.changes.openFile"),
                      onSelect: () => {
                        const path = treeCtxMenu.path;
                        onTreeCtxMenu(null);
                        onOpenFile(path);
                      },
                    },
                    {
                      label: t("inspector.files.revealInFolder"),
                      onSelect: () => {
                        const path = treeCtxMenu.path;
                        onTreeCtxMenu(null);
                        void actions.reveal(path);
                      },
                    },
                    {
                      label: t("inspector.changes.copyPath"),
                      onSelect: () => {
                        const path = treeCtxMenu.path;
                        onTreeCtxMenu(null);
                        copyPathText(path);
                      },
                    },
                    {
                      label: t("inspector.files.rename"),
                      separatorBefore: true,
                      onSelect: () => {
                        const path = treeCtxMenu.path;
                        onTreeCtxMenu(null);
                        actions.startRename(path);
                      },
                    },
                    {
                      label: t("inspector.files.trash"),
                      onSelect: () => {
                        const path = treeCtxMenu.path;
                        onTreeCtxMenu(null);
                        actions.setPendingRemove(path);
                      },
                    },
                  ]
                : treeCtxMenu
                  ? [
                      {
                        label: t("inspector.files.newFile"),
                        onSelect: () => {
                          const path = treeCtxMenu.path;
                          onTreeCtxMenu(null);
                          actions.startNewFile(path);
                        },
                      },
                      {
                        label: t("inspector.files.newFolder"),
                        onSelect: () => {
                          const path = treeCtxMenu.path;
                          onTreeCtxMenu(null);
                          actions.startNewFolder(path);
                        },
                      },
                      {
                        // 另存为：走编辑器保存对话框（与「在树内新建空文件」区分）
                        label: t("inspector.files.saveAsTitle"),
                        onSelect: () => {
                          onTreeCtxMenu(null);
                          onNewFile();
                        },
                      },
                      {
                        label: t("inspector.files.revealInFolder"),
                        separatorBefore: true,
                        onSelect: () => {
                          const path = treeCtxMenu.path;
                          onTreeCtxMenu(null);
                          void actions.reveal(path);
                        },
                      },
                      {
                        label: t("inspector.changes.copyPath"),
                        onSelect: () => {
                          const path = treeCtxMenu.path;
                          onTreeCtxMenu(null);
                          copyPathText(path);
                        },
                      },
                      // 工作空间根不允许改名 / 删除，否则会作用到整个仓库。
                      ...(treeCtxMenu.path === "."
                        ? []
                        : [
                            {
                              label: t("inspector.files.rename"),
                              separatorBefore: true,
                              onSelect: () => {
                                const path = treeCtxMenu.path;
                                onTreeCtxMenu(null);
                                actions.startRename(path);
                              },
                            },
                            {
                              label: t("inspector.files.trash"),
                              onSelect: () => {
                                const path = treeCtxMenu.path;
                                onTreeCtxMenu(null);
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
      ) : null}
    </div>
  );
});
