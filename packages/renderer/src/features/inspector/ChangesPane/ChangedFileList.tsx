/**
 * Changes 改动文件行（懒加载 diff + 离屏卸载）。
 *
 * 主列表在外层做了虚拟化（见 ChangesPane），只有视口内的行会挂进 DOM，
 * 所以「展开」状态必须提到父级持有 —— 行一旦滚出窗口就卸载，
 * 放在行内的 useState 会连同展开状态一起丢掉。
 */

import type { ChangeDispositionKind } from "@thinker-workbench/shared";
import {
  type CSSProperties,
  memo,
  startTransition,
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { workspaceGitFileDiff } from "../../../platform/ipc/workspaceFs";
import { useT } from "../../../ui/i18n/useI18n";
import { FileGlyph, IconCheck, IconChevron, IconUndo, MI } from "../../../ui/icons";
import { copyRelativePath } from "./clipboard";
import { FileDiffBody } from "./FileDiff";
import { acquireDiffFetch, releaseDiffFetch } from "./highlightQueue";

export const ChangedFileRow = memo(function ChangedFileRow({
  workspaceId,
  path,
  added,
  removed,
  status,
  onOpenFile,
  open,
  onToggleOpen,
  wordWrap,
  onDispose,
  disposeBusy,
  measureRef,
  style,
}: {
  workspaceId: string;
  path: string;
  added: number;
  removed: number;
  status: string;
  onOpenFile: (path: string) => void;
  /** 是否展开 diff；由父级持有，行滚出虚拟窗口后回来仍是展开的。 */
  open: boolean;
  /** 切换展开：带 path 是为了让引用能恒定，不击穿行上的 memo。 */
  onToggleOpen: (path: string) => void;
  wordWrap: boolean;
  /** 行级处置（回滚 / 采纳）；不传则不渲染这两个按钮。 */
  onDispose?: (kind: ChangeDispositionKind, path: string) => void | Promise<void>;
  /** 处置进行中：禁用行按钮，避免重复点击。 */
  disposeBusy?: boolean;
  /** 虚拟列表测量 ref（与行内 ref 合并）。 */
  measureRef?: (node: HTMLLIElement | null) => void;
  /** 虚拟列表定位（translateY）。 */
  style?: CSSProperties;
}) {
  const [inView, setInView] = useState(false);
  const [full, setFull] = useState(false);
  const [patch, setPatch] = useState<string | null>(null);
  const [binary, setBinary] = useState(false);
  const [loading, setLoading] = useState(false);
  const [loadingFull, setLoadingFull] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [spacerHeight, setSpacerHeight] = useState<number | null>(null);
  const t = useT();
  const rowRef = useRef<HTMLLIElement | null>(null);
  const diffWrapRef = useRef<HTMLDivElement>(null);
  const patchRef = useRef<string | null>(null);
  const loadingRef = useRef(false);
  patchRef.current = patch;

  // 行内 ref 与虚拟列表的测量 ref 合并：两者都要拿到同一个节点
  const setRowNode = useCallback(
    (node: HTMLLIElement | null) => {
      rowRef.current = node;
      measureRef?.(node);
    },
    [measureRef],
  );

  // useCallback 包一层：effect 依赖里要用稳定引用，避免每次渲染重跑
  const loadDiff = useCallback(
    async (nextFull: boolean) => {
      if (!nextFull) {
        if (loadingRef.current || patchRef.current !== null) return;
        loadingRef.current = true;
        setLoading(true);
      } else {
        setLoadingFull(true);
      }
      setErr(null);
      await acquireDiffFetch();
      try {
        if (!nextFull && patchRef.current !== null) return;
        const res = await workspaceGitFileDiff(workspaceId, path, nextFull);
        setPatch(res.patch);
        setBinary(res.binary);
        setFull(nextFull);
      } catch (e) {
        setErr(e instanceof Error ? e.message : String(e));
      } finally {
        releaseDiffFetch();
        if (!nextFull) loadingRef.current = false;
        setLoading(false);
        setLoadingFull(false);
      }
    },
    [workspaceId, path],
  );

  // 跟踪是否在滚动容器视口附近：离屏卸载 diff DOM，保留高度占位防跳动。
  useEffect(() => {
    if (!open) {
      setInView(false);
      return;
    }
    const el = rowRef.current;
    if (!el) return;
    const root = el.closest(".changes-pane__scroller");
    let cancelled = false;
    const io = new IntersectionObserver(
      (entries) => {
        if (cancelled) return;
        const next = entries.some((e) => e.isIntersecting);
        startTransition(() => setInView(next));
      },
      {
        root: root instanceof Element ? root : null,
        rootMargin: "120px 0px",
        threshold: 0,
      },
    );
    io.observe(el);
    return () => {
      cancelled = true;
      io.disconnect();
    };
  }, [open]);

  // 列表首次加载或清空搜索时，默认展开顶层目录。
  useEffect(() => {
    if (!open || !inView || patch !== null || loadingRef.current) return;
    void loadDiff(false);
  }, [open, inView, patch, loadDiff]);

  // 离屏前记下高度，挂占位避免滚动条跳动。
  useLayoutEffect(() => {
    if (!open) {
      setSpacerHeight(null);
      return;
    }
    if (inView && diffWrapRef.current) {
      setSpacerHeight(diffWrapRef.current.offsetHeight);
    }
  }, [open, inView]);

  const showDiff = open && inView && (loading || patch !== null || err);
  const showSpacer =
    open && !inView && spacerHeight != null && spacerHeight > 0 && (patch !== null || err != null);

  return (
    <li
      ref={setRowNode}
      className={`changes-pane__item${open ? " is-open" : ""}`}
      data-path={path}
      style={style}
    >
      <div className="changes-pane__file-row">
        <button
          type="button"
          className="changes-pane__toggle"
          onClick={() => onToggleOpen(path)}
          title={open ? t("inspector.changes.collapseDiff") : t("inspector.changes.expandDiff")}
          aria-expanded={open}
          aria-label={
            open ? t("inspector.changes.collapseDiff") : t("inspector.changes.expandDiff")
          }
        >
          <span className="changes-pane__lead" aria-hidden>
            <span className="changes-pane__file-ico">
              <FileGlyph name={path.split("/").pop() || path} />
            </span>
            <span className="changes-pane__chev">
              {/* 16px 的方框里塞 10px 的箭头太细弱，撑到 14px 才跟文件图标一个分量 */}
              <IconChevron open={open} size={14} />
            </span>
          </span>
        </button>
        <button type="button" className="changes-pane__file-name" onClick={() => onOpenFile(path)}>
          {path}
        </button>
        {/* 状态与 +/− 行数同一行并列：状态说明改动性质，数字说明改动量，缺一个都得靠猜 */}
        <span className="changes-pane__file-stats">
          <span className="changes-pane__status">{status}</span>
          {added > 0 ? <span className="changes-pane__add">+{added}</span> : null}
          {removed > 0 ? <span className="changes-pane__del">−{removed}</span> : null}
        </span>
        <button
          type="button"
          className="changes-pane__copy-btn"
          title={t("inspector.changes.copyPath")}
          aria-label={t("inspector.changes.copyPath")}
          onClick={() => void copyRelativePath(path)}
        >
          {MI.copy}
        </button>
        {onDispose ? (
          <span className="changes-pane__dispose">
            <button
              type="button"
              className="changes-pane__copy-btn"
              title={t("inspector.changes.revertFile")}
              aria-label={t("inspector.changes.revertFile")}
              disabled={disposeBusy}
              onClick={() => void onDispose("revert", path)}
            >
              <IconUndo />
            </button>
            <button
              type="button"
              className="changes-pane__copy-btn"
              title={t("inspector.changes.keepFile")}
              aria-label={t("inspector.changes.keepFile")}
              disabled={disposeBusy}
              onClick={() => void onDispose("keep", path)}
            >
              <IconCheck />
            </button>
          </span>
        ) : null}
      </div>
      {showDiff ? (
        <div ref={diffWrapRef} className="changes-pane__diff-wrap">
          {patch === null && !err ? (
            <div className="changes-diff__empty">{t("inspector.changes.loadingDiff")}</div>
          ) : err ? (
            <div className="changes-pane__error">{err}</div>
          ) : (
            <FileDiffBody
              path={path}
              patch={patch ?? ""}
              binary={binary}
              full={full}
              loadingFull={loadingFull}
              wordWrap={wordWrap}
              onExpandFull={() => void loadDiff(true)}
            />
          )}
        </div>
      ) : showSpacer ? (
        <div
          className="changes-pane__diff-wrap changes-pane__diff-wrap--spacer"
          style={{ height: spacerHeight }}
          aria-hidden
        />
      ) : null}
    </li>
  );
});
