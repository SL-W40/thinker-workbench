/**
 * Changes 面板：Git 状态、懒加载 diff、侧栏文件列表与 CTA prompt（编排壳）。
 * diff 解析见 ./diffText，渲染组件见 ./FileDiff 与 ./ChangedFileList，
 * 浮动菜单见 ./floatingMenu，限流/高亮队列见 ./highlightQueue。
 */
import { ConfirmDialog, EmptyState, useToast } from "@thinker-workbench/design/react";
import type { ChangeDispositionKind, GitStatus, WorkspaceNode } from "@thinker-workbench/shared";
import {
  type CSSProperties,
  memo,
  startTransition,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { applyChangeDisposition } from "../../../platform/ipc/checkpoints";
import { useStableCallback } from "../../../ui/hooks/useStableCallback";
import { useVirtualRows } from "../../../ui/hooks/useVirtualRows";
import { useT } from "../../../ui/i18n/useI18n";
import { IconPanelHide, MI } from "../../../ui/icons";
import { loadInspectorUi, patchInspectorUi } from "../inspectorUi";
import { FILE_LIST_AUTO_PANE_MIN, useFileListOpen, useFileListWidth } from "../useFileListPanel";
import "../inspector.less";
import type { ChangesPromptActionId } from "./actions";
import { ChangedFileRow, ChangesFileList } from "./ChangedFileList";
import { ChangesErrorState } from "./ChangesErrorState";
import { sortChangedFiles } from "./diffText";
import { PortalMenu } from "./floatingMenu";
import { ManualCommitForm } from "./ManualCommitForm";
import { SubmitActions } from "./SubmitActions";
import { useDisposeAll } from "./useDisposeAll";
import { usePortalMenu } from "./usePortalMenu";

export type { ChangesPromptActionId } from "./actions";
// 动作定义搬到了 ./actions（提交按钮的下拉与菜单都要用），转发导出保持上层导入路径不变
export { CHANGES_ACTION_PROMPTS } from "./actions";

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

/**
 * memo：面板内含 diff 列表与浮动菜单，RightInspector 的 30+ state 任一变化不该让它整棵重渲染。
 * 前提是上层传进来的回调引用稳定（RightInspector 里已用 useStableCallback 包过）。
 */
export const ChangesPane = memo(function ChangesPane({
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
  const toast = useToast();
  const viewMenu = usePortalMenu(200);
  const [wordWrap, setWordWrap] = useState(false);
  const [focusPath, setFocusPath] = useState<string | null>(null);
  /**
   * 手动提交表单是否展开。常态只有头部一个「提交」按钮，
   * 其余动作全在「⋯」菜单里；选了手动提交才长出这块表单。
   * 按工作空间记住：习惯自己写说明的人不想到菜单里再点一次。
   */
  const [manual, setManual] = useState(
    () => loadInspectorUi(workspaceId ?? null).changesCommitMode === "manual",
  );
  /**
   * 展开 diff 的文件；放在面板而不是行内，因为主列表做了虚拟化 ——
   * 行滚出窗口就卸载，行内 state 会把展开状态一起丢掉。
   */
  const [openPaths, setOpenPaths] = useState<ReadonlySet<string>>(() => new Set());
  /** 行级处置进行中（同一时刻只允许一个，避免并发改同一批快照）。 */
  const [disposing, setDisposing] = useState<string | null>(null);

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

  /**
   * 手动提交展开态按工作空间记住。只在用户切换时写 —— 挂载时写会把
   * skipPersist 挡掉的默认值又写回去（列表宽度那套是同一个道理）。
   */
  function setManualMode(next: boolean) {
    setManual(next);
    if (workspaceId) patchInspectorUi(workspaceId, { changesCommitMode: next ? "manual" : "ai" });
  }

  const files = useMemo(() => sortChangedFiles(status?.files ?? []), [status?.files]);
  const noChanges = !status?.isRepo || files.length === 0;
  /** 批量处置（全部回滚 / 全部采纳）：入口在「⋯」菜单，状态留在面板层。 */
  const dispose = useDisposeAll({
    workspaceId,
    paths: files.map((f) => f.path),
    onChanged: onRefresh,
  });
  const totals = status?.totals ?? { added: 0, removed: 0 };
  const changedPaths = useMemo(() => new Set(files.map((f) => f.path)), [files]);

  /** 主列表虚拟化：几百个改动文件也只有视口内十几行在 DOM 里。 */
  const list = useVirtualRows({
    count: files.length,
    estimate: 30,
    // 按路径缓存行高：同一个文件展开 / 折叠后高度不同，滚回来不用重新量
    getKey: (i) => files[i]?.path ?? String(i),
  });

  // 定位样式按 rows 缓存：每次渲染都新建对象会击穿行上的 memo
  const rowStyles = useMemo<CSSProperties[]>(
    () =>
      list.rows.map(({ offset }) => ({
        position: "absolute",
        top: 0,
        left: 0,
        right: 0,
        transform: `translateY(${offset}px)`,
      })),
    [list.rows],
  );

  const toggleOpen = useCallback((path: string) => {
    setOpenPaths((prev) => {
      const next = new Set(prev);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
  }, []);

  function focusFromSidebar(path: string) {
    // 改动文件：聚焦主区 diff；未改动文件：直接在编辑器打开
    if (changedPaths.has(path)) {
      setFocusPath(path);
      setOpenPaths((prev) => (prev.has(path) ? prev : new Set(prev).add(path)));
      const index = files.findIndex((f) => f.path === path);
      if (index >= 0) list.scrollToIndex(index);
    } else {
      onOpenFile(path);
    }
  }

  /**
   * 单文件处置：成功后刷新 Git 状态，让面板立刻反映改动消失。
   * 包一层稳定引用：行是 memo 的，每次渲染新建函数会让十几行全部重渲染。
   */
  const disposeFile = useStableCallback((kind: ChangeDispositionKind, path: string) => {
    void disposeFileImpl(kind, path);
  });

  async function disposeFileImpl(kind: ChangeDispositionKind, path: string) {
    if (!workspaceId || disposing) return;
    setDisposing(path);
    try {
      const res = await applyChangeDisposition({ workspaceId, kind, paths: [path] });
      const item = res.items[0];
      if (item?.ok) {
        onRefresh();
        return;
      }
      toast.danger({
        title:
          kind === "revert" ? t("inspector.changes.revertFile") : t("inspector.changes.keepFile"),
        description: item?.error ?? res.error ?? t("inspector.changes.disposeFailed"),
      });
    } finally {
      setDisposing(null);
    }
  }

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
      <ChangesErrorState
        status={null}
        error={error}
        onRefresh={onRefresh}
        onInitRepo={onInitRepo}
      />
    );
  }

  // 其余失败（没装 git / 目录没了 / 超时 / git 报错 / 还没初始化）统一走分类文案，
  // 原始报错只在详情弹窗里出现，不再直接铺在面板上
  if (status && (!status.isRepo || status.gitAvailable === false)) {
    return (
      <ChangesErrorState
        status={status}
        error={error}
        onRefresh={onRefresh}
        onInitRepo={onInitRepo}
      />
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
            {/* 未提交 / 分支名 / +/− 行数绑成一整块：这三部分永不互相折行 */}
            <span className="changes-pane__title">
              <span className="changes-pane__section">{t("inspector.changes.uncommitted")}</span>
              <span className="changes-pane__branch" title={status?.branch ?? ""}>
                {status?.branch ?? "HEAD"}
              </span>
              {(totals.added > 0 || totals.removed > 0) && (
                <span className="changes-pane__totals">
                  <span className="changes-pane__add">+{totals.added}</span>
                  <span className="changes-pane__del">−{totals.removed}</span>
                </span>
              )}
            </span>
          </div>
          {/* 提交按钮与右侧图标同属一组：宽度不够时整组一起折到第二行，中间不留空档 */}
          <div className="changes-pane__actions">
            {manual ? null : (
              <SubmitActions
                disabled={noChanges}
                onSendAction={onSendAction}
                onManual={() => setManualMode(true)}
                disposeBusy={dispose.busy}
                onRevertAll={dispose.revertAll}
                onKeepAll={dispose.keepAll}
              />
            )}
            <div className="changes-pane__view-wrap" ref={viewMenu.wrapRef}>
              <button
                type="button"
                className="changes-pane__icon-btn changes-pane__icon-btn--more"
                aria-label={t("inspector.changes.viewOptions")}
                title={t("inspector.changes.viewOptions")}
                aria-expanded={viewMenu.open}
                onClick={viewMenu.toggle}
              >
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden>
                  <circle cx="3.5" cy="8" r="1.15" fill="currentColor" />
                  <circle cx="8" cy="8" r="1.15" fill="currentColor" />
                  <circle cx="12.5" cy="8" r="1.15" fill="currentColor" />
                </svg>
              </button>
              <PortalMenu open={viewMenu.open} coords={viewMenu.coords} menuRef={viewMenu.menuRef}>
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
                    viewMenu.close();
                    startTransition(() => setOpenPaths(new Set(files.map((f) => f.path))));
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
                    viewMenu.close();
                    startTransition(() => setOpenPaths(new Set()));
                  }}
                >
                  {t("inspector.changes.collapseAll")}
                </button>
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
      {dispose.error ? <div className="changes-pane__error">{dispose.error}</div> : null}
      {dispose.notice ? <div className="changes-dispose__notice">{dispose.notice}</div> : null}

      {/* 手动提交表单只在菜单里选过才出现；提交完没有改动了自然收掉 */}
      {manual && workspaceId && !noChanges ? (
        <ManualCommitForm
          workspaceId={workspaceId}
          onChanged={onRefresh}
          onClose={() => setManualMode(false)}
          busy={dispose.busy}
        />
      ) : null}

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
            {/* 滚动容器与列表分离：ul 只负责撑总高，行用 translateY 定位 */}
            <div className="changes-pane__scroller" ref={list.scrollRef}>
              <ul className="changes-pane__list" style={{ height: list.contentHeight }}>
                {list.rows.map((row, i) => {
                  const { index } = row;
                  const f = files[index];
                  const style = rowStyles[i];
                  return workspaceId ? (
                    <ChangedFileRow
                      key={f.path}
                      workspaceId={workspaceId}
                      path={f.path}
                      added={f.added}
                      removed={f.removed}
                      status={f.status}
                      onOpenFile={onOpenFile}
                      open={openPaths.has(f.path)}
                      onToggleOpen={toggleOpen}
                      wordWrap={wordWrap}
                      onDispose={disposeFile}
                      disposeBusy={disposing === f.path}
                      measureRef={list.measureRef(index)}
                      style={style}
                    />
                  ) : (
                    <li
                      key={f.path}
                      className="changes-pane__item"
                      ref={list.measureRef(index)}
                      style={style}
                    >
                      <div className="changes-pane__file-row">
                        <button
                          type="button"
                          className="changes-pane__file-name"
                          onClick={() => onOpenFile(f.path)}
                        >
                          {f.path}
                        </button>
                        <span className="changes-pane__file-stats">
                          {f.added > 0 ? (
                            <span className="changes-pane__add">+{f.added}</span>
                          ) : null}
                          {f.removed > 0 ? (
                            <span className="changes-pane__del">−{f.removed}</span>
                          ) : null}
                        </span>
                      </div>
                    </li>
                  );
                })}
              </ul>
            </div>
          </div>
          {listOpen ? (
            <ChangesFileList
              files={files}
              tree={tree}
              selectedPath={focusPath}
              onSelect={focusFromSidebar}
              onOpenFile={onOpenFile}
              workspaceId={workspaceId ?? ""}
              onChanged={onRefresh}
              width={listWidth}
              dragging={listDragging}
              onResizePointerDown={onResizePointerDown}
            />
          ) : null}
        </div>
      )}

      {/* 批量处置二次确认：不可逆，走 danger 语气 */}
      <ConfirmDialog
        open={dispose.pending !== null}
        title={dispose.pending?.title}
        description={dispose.pending?.description}
        confirmLabel={dispose.pending?.confirmLabel ?? t("common.confirm")}
        cancelLabel={t("inspector.changes.cancel")}
        tone="danger"
        busy={dispose.busy}
        onConfirm={dispose.confirmPending}
        onCancel={dispose.cancelPending}
      />
    </div>
  );
});
