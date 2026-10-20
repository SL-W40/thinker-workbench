/**
 * 工具步骤行：标签 / 路径列表 / 各类工具卡片分发。
 */
import type { ChatTimelineStep } from "@thinker-workbench/shared";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { useT } from "../../../../i18n/useI18n";
import { FileGlyph, IconFolder } from "../../../inspector/icons";
import { BrowserScreenshotThumb } from "../../BrowserScreenshotThumb";
import { ClarifyCards } from "../../ClarifyCards";
import { DeleteFileCard } from "../../DeleteFileCard";
import { FileDiffView } from "../../FileDiffView";
import { ShellCard } from "../../ShellCard";
import { isExploreToolName, isMutationTool } from "../../timelineExplore";
import { isDeleteRestoreExpired, readDeleteFileRestoreTtlDays } from "../../timelineModel";
import {
  exploreFileKey,
  isSearchToolName,
  pathBasename,
  type ResultPathKind,
  resolvePathKind,
  shortenAwaitId,
} from "../format";
import { TimelineChevron } from "../TimelineChevron";

/**
 * 工具行标题：结构化片段，避免 name · path · summary · Done 糊成一串。 * 搜索：`grep` + pattern + path；其它：name + path + summary。 */
export function ToolLabel({
  step,
  shimmer = false,
}: {
  step: Extract<ChatTimelineStep, { kind: "tool" }>;
  shimmer?: boolean;
}) {
  const search = isSearchToolName(step.name);
  const primary = search ? step.summary : step.path;
  const secondary = search ? step.path : step.summary;
  // 搜索：路径在 secondary；其它：路径在 primary
  const pathIsPrimary = !search;

  function pathBit(text: string, asPath: boolean) {
    const kind = asPath ? "is-path" : search && !asPath ? "is-query" : "";
    return <span className={`run-timeline-tool-bit${kind ? ` ${kind}` : ""}`}>{text}</span>;
  }

  return (
    <span className={`run-timeline-label${shimmer ? " run-timeline-label--shimmer" : ""}`}>
      <span className="run-timeline-tool-name">{step.name}</span>
      {primary ? pathBit(primary, pathIsPrimary) : null}
      {secondary ? pathBit(secondary, !pathIsPrimary) : null}
    </span>
  );
}

/**
 * 按元素实际宽度中间省略：保留末段文件名，前缀能放多少放多少。
 * 通过临时写入 textContent 测 scrollWidth 二分，避免固定字符数裁切。
 */
function fitMiddleEllipsis(el: HTMLElement, path: string): string {
  const full = path.replace(/\\/g, "/");
  const ellipsis = "…";
  el.textContent = full;
  if (el.clientWidth <= 0 || el.scrollWidth <= el.clientWidth) return full;

  const base = pathBasename(full);
  const prefix = full.slice(0, Math.max(0, full.length - base.length));

  el.textContent = `${ellipsis}${base}`;
  if (el.scrollWidth > el.clientWidth) {
    let lo = 1;
    let hi = base.length;
    let best = ellipsis;
    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      const candidate = `${ellipsis}${base.slice(-mid)}`;
      el.textContent = candidate;
      if (el.scrollWidth <= el.clientWidth) {
        best = candidate;
        lo = mid + 1;
      } else {
        hi = mid - 1;
      }
    }
    return best;
  }

  let lo = 0;
  let hi = prefix.length;
  let best = `${ellipsis}${base}`;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    const candidate = `${prefix.slice(0, mid)}${ellipsis}${base}`;
    el.textContent = candidate;
    if (el.scrollWidth <= el.clientWidth) {
      best = candidate;
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }
  return best;
}

/** 列表内路径：宽度自适应中间折叠，始终尽量露出文件名*/
function PathMidEllipsis({ path, className }: { path: string; className?: string }) {
  const ref = useRef<HTMLSpanElement>(null);
  const [label, setLabel] = useState(() => path.replace(/\\/g, "/"));

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const apply = () => {
      const next = fitMiddleEllipsis(el, path);
      setLabel((prev) => (prev === next ? prev : next));
    };
    apply();
    if (typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(apply);
    ro.observe(el);
    return () => ro.disconnect();
  }, [path]);

  return (
    <span ref={ref} className={className}>
      {label}
    </span>
  );
}

/** 已完成探索工具行：点击后内联展开 resultPaths / 截图。*/
function ToolResultPathsList({
  paths,
  kinds,
  onOpenFile,
}: {
  paths: string[];
  kinds?: ResultPathKind[];
  onOpenFile?: (path: string) => void;
}) {
  if (paths.length === 0) return null;
  return (
    <ul className="run-timeline-tool-paths">
      {paths.map((path, index) => {
        const kind = resolvePathKind(path, kinds?.[index]);
        if (kind === "image") {
          return (
            <li key={exploreFileKey(path, index)} className="run-timeline-explore-files__shot-item">
              <BrowserScreenshotThumb absolutePath={path} />
            </li>
          );
        }
        const name = pathBasename(path.replace(/[/\\]+$/, ""));
        const icon = kind === "dir" ? <IconFolder /> : <FileGlyph name={name || path} />;
        const canOpen = Boolean(onOpenFile) && kind !== "dir";
        const body = (
          <>
            <span className="run-timeline-explore-files__ico" aria-hidden>
              {icon}
            </span>
            <PathMidEllipsis path={path} className="run-timeline-explore-files__path" />
          </>
        );
        return (
          <li key={exploreFileKey(path, index)}>
            {canOpen ? (
              <button
                type="button"
                className="run-timeline-explore-files__item is-path-only"
                onClick={() => onOpenFile?.(path)}
              >
                {body}
              </button>
            ) : (
              <span className="run-timeline-explore-files__item is-path-only is-static">
                {body}
              </span>
            )}
          </li>
        );
      })}
    </ul>
  );
}

export function ToolStepRow({
  step,
  onOpenFile,
  onOpenTerminal,
  onRestoreDeletedFile,
  ghost = false,
  /** 暂留窗口内（加载中 / 最短时间 + 收起动画）：强制显示「进行中」，避免快工具一结束就闪没。 */
  pending = false,
}: {
  step: Extract<ChatTimelineStep, { kind: "tool" }>;
  onOpenFile?: (path: string) => void;
  onOpenTerminal?: (detail?: {
    sessionId?: string;
    previewOutput?: string;
    title?: string;
  }) => void;
  onRestoreDeletedFile?: (stepId: string) => void | Promise<void>;
  /** 收组退出动画中的暂留卡（淡出上移，被 Explored 吸收）。 */
  ghost?: boolean;
  /** 暂留窗口内（加载中 / 最短时间 + 收起动画）：强制显示「进行中」，避免快工具一结束就闪没。 */
  pending?: boolean;
}) {
  const t = useT();
  /** TTL 到期后 bump，立刻藏掉「恢复」按钮。*/
  const [, setRestoreTick] = useState(0);
  const running = step.phase === "start" && step.active;
  // 暂留窗口内（已结束但还没收组）：继续当作进行中展示，让「进行中」贯穿最短时间+动画时长
  const effectiveRunning = running || pending;
  const failed = step.phase === "end" && step.ok === false;
  const hasDiff = Boolean(step.diff?.trim());
  const mutation = isMutationTool(step.name);
  const isDelete = step.name === "delete_file";
  const isShell = step.name === "shell" || step.name === "shell_write";
  const isShellAwait = step.name === "shell_await";
  const isTaskAwait = step.name === "task_await";
  const ttlDays = readDeleteFileRestoreTtlDays();
  const canRestore =
    isDelete &&
    step.phase === "end" &&
    step.ok === true &&
    !step.restored &&
    typeof step.restoreContent === "string" &&
    Boolean(step.path) &&
    Boolean(onRestoreDeletedFile) &&
    !isDeleteRestoreExpired(step, ttlDays);

  const resultPaths =
    step.phase === "end" && isExploreToolName(step.name)
      ? step.resultPaths?.length
        ? step.resultPaths
        : step.path?.trim()
          ? [step.path.trim()]
          : []
      : [];
  const resultPathKinds =
    step.phase === "end" && isExploreToolName(step.name) ? step.resultPathKinds : undefined;
  // 暂留窗口内（进行中/已结束未收组）：不展示结果路径，整卡保持「进行中」观感
  const canOpenPaths = resultPaths.length > 0 && !pending;
  /**
   * 单一文件结果：read_file 一定是文件、grep 只命中一个文件时，
   * 不折叠展开，点击行直接跳转。图片 / 目录 / 链接仍走展开（图片看缩略图）。
   */
  const directOpenFile =
    canOpenPaths &&
    resultPaths.length === 1 &&
    resolvePathKind(resultPaths[0] as string, resultPathKinds?.[0]) === "file" &&
    Boolean(onOpenFile);
  const expandable = canOpenPaths && !directOpenFile;
  const toolRowRef = useRef<HTMLDivElement>(null);
  const [pathsOpen, setPathsOpen] = useState(false);

  useEffect(() => {
    if (
      !isDelete ||
      typeof step.restoreContent !== "string" ||
      typeof step.restoreCachedAt !== "number"
    ) {
      return;
    }
    const ttl = readDeleteFileRestoreTtlDays();
    if (ttl <= 0) return;
    const left = step.restoreCachedAt + ttl * 86_400_000 - Date.now();
    if (left <= 0) {
      setRestoreTick((n) => n + 1);
      return;
    }
    // setTimeout 上限约 24.8 天；更长 TTL 交给会话侧定期 prune
    if (left > 2_147_483_647) return;
    const timer = window.setTimeout(() => setRestoreTick((n) => n + 1), left + 32);
    return () => window.clearTimeout(timer);
  }, [isDelete, step.restoreContent, step.restoreCachedAt]);

  // Task 启动由 subagent 行展示，避免重复
  if (step.name === "Task") {
    return null;
  }

  if (step.name === "ask_user" || step.clarify) {
    return (
      <li className={`run-timeline-item run-timeline-item--tool${running ? " is-active" : ""}`}>
        <ClarifyCards step={step} />
      </li>
    );
  }

  // task_await / shell_await：纯文字行（HITL 审批仍走 Shell 卡片：
  if (isTaskAwait || (isShellAwait && !step.hitl)) {
    const idRaw =
      (isShellAwait ? step.sessionId : undefined)?.trim() ||
      step.summary?.trim() ||
      step.path?.trim() ||
      "";
    const idShort = shortenAwaitId(idRaw);
    const status = running
      ? t("chat.toolRunning")
      : failed
        ? t("chat.toolFailed")
        : step.backgrounded
          ? t("chat.shellBackgrounded")
          : t("chat.toolDone");
    const label = isTaskAwait ? t("chat.taskAwaiting") : t("chat.shellAwaiting");
    return (
      <li
        className={`run-timeline-item run-timeline-item--tool${running ? " is-active" : ""}${failed ? " is-error" : ""}`}
      >
        <div className="run-timeline-tool">
          <div className="run-timeline-tool-head">
            <span className={`run-timeline-label${running ? " run-timeline-label--shimmer" : ""}`}>
              <span className="run-timeline-tool-name">{label}</span>
              {idShort ? (
                <span className="run-timeline-tool-bit is-await-id">{idShort}</span>
              ) : null}
              <span className={`run-timeline-tool-bit is-await-status${failed ? " is-err" : ""}`}>
                {status}
              </span>
            </span>
          </div>
        </div>
      </li>
    );
  }

  // 删除：卡片展示（不进 Explored：
  if (isDelete) {
    return (
      <li
        className={`run-timeline-item run-timeline-item--tool${running ? " is-active" : ""}${failed ? " is-error" : ""}`}
      >
        <DeleteFileCard
          path={step.path}
          running={running}
          failed={failed}
          restored={Boolean(step.restored)}
          canRestore={canRestore}
          onRestore={
            onRestoreDeletedFile ? () => Promise.resolve(onRestoreDeletedFile(step.id)) : undefined
          }
          onOpenFile={onOpenFile}
        />
      </li>
    );
  }

  if (isShell || (isShellAwait && step.hitl)) {
    const awaiting = Boolean(step.hitl);
    return (
      <li
        className={`run-timeline-item run-timeline-item--tool run-timeline-item--shell${running || awaiting ? " is-active" : ""}${failed ? " is-error" : ""}`}
      >
        <ShellCard step={step} onOpenTerminal={onOpenTerminal} />
      </li>
    );
  }

  // 改文件：进行中只显示 edit/write + path + Running；完成后换成 diff，工具行消失
  if (mutation) {
    if (running) {
      return (
        <li className="run-timeline-item run-timeline-item--tool is-active">
          <div className="run-timeline-tool">
            <div className="run-timeline-tool-head">
              <ToolLabel step={step} shimmer />
              <span className="run-timeline-badge">{t("chat.toolRunning")}</span>
            </div>
          </div>
        </li>
      );
    }
    if (hasDiff && step.diff) {
      return (
        <li className={`run-timeline-item run-timeline-item--tool${failed ? " is-error" : ""}`}>
          <FileDiffView path={step.path} diff={step.diff} onOpenFile={onOpenFile} />
        </li>
      );
    }
  }

  // 成功结束不再标 Done，避免和摘要糊成一行；只标 Running / Failed
  const badge = effectiveRunning ? (
    <span className="run-timeline-badge">{t("chat.toolRunning")}</span>
  ) : failed ? (
    <span className="run-timeline-badge run-timeline-badge--err">{t("chat.toolFailed")}</span>
  ) : null;

  return (
    <li
      className={`run-timeline-item run-timeline-item--tool${effectiveRunning ? " is-active" : ""}${failed ? " is-error" : ""}${canOpenPaths ? " has-hover-detail" : ""}${ghost ? " run-timeline-item--tail-exit" : ""}`}
    >
      <div className="run-timeline-tool" ref={toolRowRef}>
        <button
          type="button"
          className={`run-timeline-tool-head${directOpenFile || expandable ? " is-clickable" : ""}`}
          aria-expanded={expandable ? pathsOpen : undefined}
          onClick={
            directOpenFile
              ? () => onOpenFile?.(resultPaths[0] as string)
              : expandable
                ? () => setPathsOpen((v) => !v)
                : undefined
          }
        >
          <ToolLabel step={step} shimmer={effectiveRunning} />
          {badge}
          {expandable ? <TimelineChevron open={pathsOpen} /> : null}
        </button>
        {expandable && pathsOpen ? (
          <ToolResultPathsList
            paths={resultPaths}
            kinds={resultPathKinds}
            onOpenFile={onOpenFile}
          />
        ) : null}
      </div>
    </li>
  );
}
