/**
 * Changes 面板：Git 状态、懒加载 diff、侧栏文件列表与 CTA prompt（编排壳）。
 * diff 解析见 ./diffText，渲染组件见 ./FileDiff 与 ./ChangedFileList，
 * 浮动菜单见 ./floatingMenu，限流/高亮队列见 ./highlightQueue。
 */
import { Button, EmptyState } from "@thinker-workbench/design/react";
import type { GitStatus, WorkspaceNode } from "@thinker-workbench/shared";
import { startTransition, useEffect, useMemo, useRef, useState } from "react";
import { useT } from "../../../i18n/useI18n";
import { IconChevron, IconPanelHide, MI } from "../icons";
import { loadInspectorUi, patchInspectorUi } from "../inspectorUi";
import { FILE_LIST_AUTO_PANE_MIN, useFileListOpen, useFileListWidth } from "../useFileListPanel";
import "../inspector.less";
import { type BulkExpand, ChangedFileRow, ChangesFileList } from "./ChangedFileList";
import { sortChangedFiles } from "./diffText";
import { PortalMenu, useFloatingMenuCoords } from "./floatingMenu";

export type ChangesPromptActionId =
  | "createBranchAndCommit"
  | "createBranchCommitAndPush"
  | "createBranch"
  | "commitAndPush"
  | "commit"
  | "commitAndCreatePr";

export const CHANGES_ACTION_PROMPTS: Record<ChangesPromptActionId, string> = {
  createBranchAndCommit:
    "Create a new branch and commit the current changes with an appropriate message.",
  createBranchCommitAndPush:
    "Create a new branch, commit the current changes, and push to the remote.",
  createBranch: "Create a new branch for the current uncommitted changes.",
  commitAndPush: "Commit the current changes with an appropriate message and push to the remote.",
  commit: "Commit the current changes with an appropriate message.",
  commitAndCreatePr: "Commit the current changes and open a pull request.",
};

type Props = {
  workspaceId?: string | null;
  status: GitStatus | null;
  loading?: boolean;
  error?: string | null;
  /** 全量工作区树（侧栏文件列表用；缺省回退仅改动文件）。*/
  tree?: WorkspaceNode | null;
  onRefresh: () => void;
  onInitRepo: () => void | Promise<void>;
  onOpenFile: (path: string) => void;
  onSendAction: (action: ChangesPromptActionId) => void;
};

const CTA_MENU_ACTIONS: ChangesPromptActionId[] = [
  "createBranchCommitAndPush",
  "createBranch",
  "commitAndPush",
  "commit",
  "commitAndCreatePr",
];

export function ChangesPane({
  workspaceId,
  status,
  loading,
  error,
  tree,
  onRefresh,
  onInitRepo,
  onOpenFile,
  onSendAction,
}: Props) {
  const t = useT();
  const [viewMenuOpen, setViewMenuOpen] = useState(false);
  const [ctaMenuOpen, setCtaMenuOpen] = useState(false);
  const [wordWrap, setWordWrap] = useState(false);
  const [focusPath, setFocusPath] = useState<string | null>(null);
  const [expandTick, setExpandTick] = useState(0);
  const [bulkExpand, setBulkExpand] = useState<BulkExpand>({ gen: 0, open: false });
  const viewWrapRef = useRef<HTMLDivElement>(null);
  const ctaSplitRef = useRef<HTMLDivElement>(null);
  const viewMenuRef = useRef<HTMLDivElement>(null);
  const ctaMenuRef = useRef<HTMLDivElement>(null);
  const viewMenuCoords = useFloatingMenuCoords(viewMenuOpen, viewWrapRef, 200);
  const ctaMenuCoords = useFloatingMenuCoords(ctaMenuOpen, ctaSplitRef, 240);

  const restoredUi = useMemo(() => loadInspectorUi(workspaceId ?? null), [workspaceId]);
  const skipPersist = useRef(true);
  const {
    open: listOpen,
    forced: listForced,
    toggle: toggleList,
    paneRef,
  } = useFileListOpen(FILE_LIST_AUTO_PANE_MIN, workspaceId ?? "", restoredUi.changesListForced);
  const {
    width: listWidth,
    dragging: listDragging,
    onResizePointerDown,
  } = useFileListWidth(restoredUi.changesListWidth, workspaceId ?? "");

  useEffect(() => {
    skipPersist.current = true;
    const id = window.setTimeout(() => {
      skipPersist.current = false;
    }, 0);
    return () => window.clearTimeout(id);
  }, []);

  useEffect(() => {
    if (!workspaceId || skipPersist.current) return;
    patchInspectorUi(workspaceId, {
      changesListForced: listForced,
      changesListWidth: listWidth,
    });
  }, [workspaceId, listForced, listWidth]);

  const files = useMemo(() => sortChangedFiles(status?.files ?? []), [status?.files]);
  const noChanges = !status?.isRepo || files.length === 0;
  const totals = status?.totals ?? { added: 0, removed: 0 };
  const changedPaths = useMemo(() => new Set(files.map((f) => f.path)), [files]);

  function focusFromSidebar(path: string) {
    // 改动文件：聚焦主区 diff；未改动文件：直接在编辑器打开
    if (changedPaths.has(path)) {
      setFocusPath(path);
      setExpandTick((n) => n + 1);
    } else {
      onOpenFile(path);
    }
  }

  function sendAction(id: ChangesPromptActionId) {
    setCtaMenuOpen(false);
    setViewMenuOpen(false);
    onSendAction(id);
  }

  useEffect(() => {
    if (!viewMenuOpen && !ctaMenuOpen) return;
    const onPointer = (e: MouseEvent) => {
      const target = e.target as Node;
      if (
        viewWrapRef.current?.contains(target) ||
        ctaSplitRef.current?.contains(target) ||
        viewMenuRef.current?.contains(target) ||
        ctaMenuRef.current?.contains(target)
      ) {
        return;
      }
      setViewMenuOpen(false);
      setCtaMenuOpen(false);
    };
    // capture：避免中间层 stopPropagation 导致关不
    window.addEventListener("mousedown", onPointer, true);
    return () => window.removeEventListener("mousedown", onPointer, true);
  }, [viewMenuOpen, ctaMenuOpen]);

  // 聊天页 keep-alive（hidden）时 portal 菜单仍挂在 body，切页时主动关掉
  useEffect(() => {
    if (!viewMenuOpen && !ctaMenuOpen) return;
    const triggers = [viewWrapRef.current, ctaSplitRef.current].filter(
      (el): el is HTMLDivElement => el != null,
    );
    if (triggers.length === 0) return;

    const close = () => {
      setViewMenuOpen(false);
      setCtaMenuOpen(false);
    };
    const closeIfHidden = () => {
      if (triggers.some((el) => !el.isConnected || el.closest("[hidden]"))) close();
    };

    const mo = new MutationObserver(closeIfHidden);
    for (const trigger of triggers) {
      let node: Element | null = trigger;
      while (node) {
        mo.observe(node, { attributes: true, attributeFilter: ["hidden"] });
        node = node.parentElement;
      }
    }
    window.addEventListener("hashchange", close);
    closeIfHidden();

    return () => {
      mo.disconnect();
      window.removeEventListener("hashchange", close);
    };
  }, [viewMenuOpen, ctaMenuOpen]);

  if (!status && loading) {
    return (
      <div className="changes-pane changes-pane--empty">
        <EmptyState
          title={t("inspector.section.changes")}
          description={t("inspector.changes.loading")}
        />
      </div>
    );
  }

  if (!status && error) {
    return (
      <div className="changes-pane changes-pane--empty">
        <EmptyState
          title={t("inspector.changes.errorTitle")}
          description={error}
          action={
            <Button
              variant="primary"
              className="changes-pane__primary"
              onClick={() => void onRefresh()}
            >
              {t("inspector.refresh")}
            </Button>
          }
        />
      </div>
    );
  }

  if (status && status.gitAvailable === false) {
    return (
      <div className="changes-pane changes-pane--empty">
        <EmptyState
          title={t("inspector.changes.gitMissingTitle")}
          description={t("inspector.changes.gitMissingBody")}
          action={
            <Button
              variant="primary"
              className="changes-pane__primary"
              onClick={() => void onRefresh()}
            >
              {t("inspector.refresh")}
            </Button>
          }
        />
        {error ? <div className="changes-pane__error">{error}</div> : null}
      </div>
    );
  }

  if (status && !status.isRepo) {
    return (
      <div className="changes-pane changes-pane--empty">
        <EmptyState
          title={t("inspector.changes.notRepoTitle")}
          description={t("inspector.changes.notRepoBody")}
          action={
            <Button
              variant="primary"
              className="changes-pane__primary"
              onClick={() => void onInitRepo()}
            >
              {t("inspector.changes.initRepo")}
            </Button>
          }
        />
        {error ? <div className="changes-pane__error">{error}</div> : null}
      </div>
    );
  }

  return (
    <div ref={paneRef} className={`changes-pane${listOpen && !noChanges ? " has-filelist" : ""}`}>
      <div className="changes-pane__head">
        <div className="changes-pane__toolbar">
          <div className="changes-pane__meta">
            <span className="changes-pane__stack-ico" aria-hidden>
              {/* biome-ignore lint/a11y/noSvgWithoutTitle: 纯装饰性图标，aria-hidden */}
              <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
                <path
                  d="M3.2 5.2h9.6v7.2H3.2zM4.6 3.6h9.6v1.2M6 2h7.2v1.2"
                  stroke="currentColor"
                  strokeWidth="1.3"
                  strokeLinejoin="round"
                />
                <path
                  d="M6.2 8.2h1.8M7.1 7.3v1.8M9.4 9.4h1.6"
                  stroke="currentColor"
                  strokeWidth="1.2"
                  strokeLinecap="round"
                />
              </svg>
            </span>
            <span className="changes-pane__section">{t("inspector.changes.uncommitted")}</span>
            {(totals.added > 0 || totals.removed > 0) && (
              <span className="changes-pane__totals">
                <span className="changes-pane__add">+{totals.added}</span>
                <span className="changes-pane__del">−{totals.removed}</span>
              </span>
            )}
            <span className="changes-pane__branch" title={status?.branch ?? ""}>
              {status?.branch ?? "HEAD"}
            </span>
          </div>
          <div className="changes-pane__actions">
            <div className="changes-pane__view-wrap" ref={viewWrapRef}>
              <button
                type="button"
                className="changes-pane__icon-btn changes-pane__icon-btn--more"
                aria-label={t("inspector.changes.viewOptions")}
                title={t("inspector.changes.viewOptions")}
                aria-expanded={viewMenuOpen}
                onClick={() => {
                  setCtaMenuOpen(false);
                  setViewMenuOpen((v) => !v);
                }}
              >
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden>
                  <circle cx="3.5" cy="8" r="1.15" fill="currentColor" />
                  <circle cx="8" cy="8" r="1.15" fill="currentColor" />
                  <circle cx="12.5" cy="8" r="1.15" fill="currentColor" />
                </svg>
              </button>
              <PortalMenu open={viewMenuOpen} coords={viewMenuCoords} menuRef={viewMenuRef}>
                <button
                  type="button"
                  className="changes-pane__menu-item changes-pane__menu-item--toggle"
                  role="menuitemcheckbox"
                  aria-checked={wordWrap}
                  onClick={() => setWordWrap((v) => !v)}
                >
                  <span>{t("inspector.changes.wordWrap")}</span>
                  <span className={`changes-pane__switch${wordWrap ? " is-on" : ""}`} aria-hidden />
                </button>
                <button
                  type="button"
                  className="changes-pane__menu-item"
                  role="menuitem"
                  disabled={noChanges}
                  onClick={() => {
                    setViewMenuOpen(false);
                    startTransition(() =>
                      setBulkExpand((prev) => ({ gen: prev.gen + 1, open: true })),
                    );
                  }}
                >
                  {t("inspector.changes.expandAll")}
                </button>
                <button
                  type="button"
                  className="changes-pane__menu-item"
                  role="menuitem"
                  disabled={noChanges}
                  onClick={() => {
                    setViewMenuOpen(false);
                    startTransition(() =>
                      setBulkExpand((prev) => ({ gen: prev.gen + 1, open: false })),
                    );
                  }}
                >
                  {t("inspector.changes.collapseAll")}
                </button>
              </PortalMenu>
            </div>

            <div className="changes-pane__cta-split" ref={ctaSplitRef}>
              <button
                type="button"
                className="changes-pane__cta"
                disabled={noChanges}
                onClick={() => sendAction("createBranchAndCommit")}
              >
                {t("inspector.changes.cta.createBranchAndCommit")}
              </button>
              <button
                type="button"
                className="changes-pane__cta-chev-btn"
                disabled={noChanges}
                aria-label={t("inspector.changes.moreActions")}
                aria-expanded={ctaMenuOpen}
                title={t("inspector.changes.moreActions")}
                onClick={() => {
                  setViewMenuOpen(false);
                  setCtaMenuOpen((v) => !v);
                }}
              >
                <IconChevron open />
              </button>
              <PortalMenu
                open={ctaMenuOpen}
                coords={ctaMenuCoords}
                menuRef={ctaMenuRef}
                className="changes-pane__menu--cta"
              >
                {CTA_MENU_ACTIONS.map((id) => (
                  <button
                    key={id}
                    type="button"
                    className="changes-pane__menu-item"
                    role="menuitem"
                    disabled={noChanges}
                    onClick={() => sendAction(id)}
                  >
                    {t(`inspector.changes.cta.${id}` as "inspector.changes.cta.commit")}
                  </button>
                ))}
              </PortalMenu>
            </div>

            <button
              type="button"
              className="changes-pane__icon-btn"
              title={t("inspector.refresh")}
              onClick={onRefresh}
            >
              {MI.refresh}
            </button>
            <button
              type="button"
              className={`changes-pane__icon-btn${listOpen ? " is-on" : ""}`}
              title={listOpen ? t("inspector.files.hideList") : t("inspector.files.showList")}
              aria-label={listOpen ? t("inspector.files.hideList") : t("inspector.files.showList")}
              aria-pressed={listOpen}
              disabled={noChanges}
              onClick={toggleList}
            >
              <IconPanelHide />
            </button>
          </div>
        </div>
      </div>

      {error ? <div className="changes-pane__error">{error}</div> : null}

      {noChanges ? (
        <div className="changes-pane__empty-body">
          <EmptyState
            title={t("inspector.changes.cleanTitle")}
            description={t("inspector.changes.cleanBody")}
          />
        </div>
      ) : (
        <div className="changes-pane__body">
          <div className="changes-pane__main">
            <ul className="changes-pane__list">
              {files.map((f) =>
                workspaceId ? (
                  <ChangedFileRow
                    key={f.path}
                    workspaceId={workspaceId}
                    path={f.path}
                    added={f.added}
                    removed={f.removed}
                    status={f.status}
                    onOpenFile={onOpenFile}
                    expandToken={focusPath === f.path ? expandTick : 0}
                    bulk={bulkExpand}
                    wordWrap={wordWrap}
                  />
                ) : (
                  <li key={f.path} className="changes-pane__item">
                    <div className="changes-pane__file-row">
                      <button
                        type="button"
                        className="changes-pane__file-name"
                        onClick={() => onOpenFile(f.path)}
                      >
                        {f.path}
                      </button>
                      <span className="changes-pane__file-stats">
                        {f.added > 0 ? <span className="changes-pane__add">+{f.added}</span> : null}
                        {f.removed > 0 ? (
                          <span className="changes-pane__del">−{f.removed}</span>
                        ) : null}
                      </span>
                    </div>
                  </li>
                ),
              )}
            </ul>
          </div>
          {listOpen ? (
            <ChangesFileList
              files={files}
              tree={tree}
              selectedPath={focusPath}
              onSelect={focusFromSidebar}
              onOpenFile={onOpenFile}
              width={listWidth}
              dragging={listDragging}
              onResizePointerDown={onResizePointerDown}
            />
          ) : null}
        </div>
      )}
    </div>
  );
}
