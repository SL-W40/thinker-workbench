/**
 * RightInspector 文件壳：编辑器 / 媒体预览 / Markdown + 侧栏文件树。
 */

import { ContextMenu, Input } from "@thinker-workbench/design/react";
import type { WorkspaceNode } from "@thinker-workbench/shared";
import type { PointerEvent as ReactPointerEvent } from "react";
import { useT } from "../../../i18n/useI18n";
import type { ChangeTreeNode } from "../changesTree";
import { FileEditor } from "../FileEditor";
import { FilesHome } from "../FilesHome";
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

export function FileShell({
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
        ) : currentTab?.kind === "file" ? (
          <div className="agent-files__editor">
            {mediaByKey[currentTab.key] ? (
              <MediaPreview
                path={currentTab.path || t("inspector.files.untitled")}
                info={mediaByKey[currentTab.key]}
              />
            ) : /\.(md|markdown|mdx)$/i.test(currentTab.path ?? "") ? (
              <MarkdownFileView
                path={currentTab.path || null}
                modelPath={currentTab.key}
                value={drafts[currentTab.key] ?? ""}
                readOnly={Boolean(currentTab.path && readOnlyByPath[currentTab.path])}
                onChange={onFileDraftChange}
                onSave={() => onSaveFile()}
                onOpenFile={(p) => onOpenFile(p)}
              />
            ) : (
              <FileEditor
                path={currentTab.path || null}
                modelPath={currentTab.key}
                value={drafts[currentTab.key] ?? ""}
                readOnly={Boolean(currentTab.path && readOnlyByPath[currentTab.path])}
                onChange={onFileDraftChange}
                onSave={() => onSaveFile()}
              />
            )}
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
                onContextMenu={(e, path, kind) => {
                  e.preventDefault();
                  e.stopPropagation();
                  onTreeCtxMenu({
                    x: e.clientX,
                    y: e.clientY,
                    path,
                    kind,
                  });
                }}
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
                      label: t("inspector.changes.copyPath"),
                      onSelect: () => {
                        const path = treeCtxMenu.path;
                        onTreeCtxMenu(null);
                        copyPathText(path);
                      },
                    },
                    {
                      label: t("inspector.files.newFile"),
                      separatorBefore: true,
                      onSelect: () => {
                        onTreeCtxMenu(null);
                        onNewFile();
                      },
                    },
                  ]
                : treeCtxMenu
                  ? [
                      {
                        label: t("inspector.changes.copyPath"),
                        onSelect: () => {
                          const path = treeCtxMenu.path;
                          onTreeCtxMenu(null);
                          copyPathText(path);
                        },
                      },
                      {
                        label: t("inspector.files.newFile"),
                        separatorBefore: true,
                        onSelect: () => {
                          onTreeCtxMenu(null);
                          onNewFile();
                        },
                      },
                    ]
                  : []
            }
          />
        </aside>
      ) : null}
    </div>
  );
}
