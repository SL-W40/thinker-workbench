/**
 * 助手气泡内的运行时间线：
 * Thinking / 叙述 / 工具 / 错误；探索类步骤默认收成 Explored；

 */
import { Button, ChevronRightIcon, Kbd, useDesignTheme } from "@thinker-workbench/design/react";
import { StreamingMarkdownView } from "@thinker-workbench/markdown/react";
import type { ChatTimelineResultPathKind, ChatTimelineStep } from "@thinker-workbench/shared";
import {
  type CSSProperties,
  type RefObject,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";
import { isBrowserableUrl, requestOpenBrowser } from "../../bridge/browser";
import { useT } from "../../i18n/useI18n";
import { FileGlyph, IconFolder } from "../inspector/icons";
import { BrowserScreenshotThumb } from "./BrowserScreenshotThumb";
import { DeleteFileCard } from "./DeleteFileCard";
import { FileDiffView } from "./FileDiffView";
import { classifyRunError, isSoftStopCode } from "./runErrors";
import { ShellCard } from "./ShellCard";
import { SubagentCard } from "./SubagentCard";
import { isMissingApiKeyError } from "./systemErrors";
import {
  type ExploreGroup,
  groupTimelineForDisplay,
  isExploreToolName,
  isMutationTool,
} from "./timelineExplore";
import { isDeleteRestoreExpired, readDeleteFileRestoreTtlDays } from "./timelineModel";

type ResultPathKind = ChatTimelineResultPathKind;

/** 路径末段文件名*/
function pathBasename(path: string): string {
  const parts = path.replace(/\\/g, "/").split("/");
  return parts[parts.length - 1] || path;
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
    <span ref={ref} className={className} title={path}>
      {label}
    </span>
  );
}

/** 解析列表项类型：显式 kinds 优先，其次路径尾缀*/
function resolvePathKind(path: string, kind?: ResultPathKind): ResultPathKind {
  if (kind === "dir" || kind === "link" || kind === "file" || kind === "image") return kind;
  if (/\.(png|jpe?g|gif|webp|bmp)$/i.test(path)) return "image";
  if (/[/\\]$/.test(path)) return "dir";
  return "file";
}

type Props = {
  steps: ChatTimelineStep[];
  /** 本轮助手气泡仍在 pending：空闲时末行临时显示规划中*/
  live?: boolean;
  /** 缺 API key 错误行上的设置跳转。*/
  onOpenModelSettings?: () => void;
  /** 在右侧 Files 面板打开工作空间文件*/
  onOpenFile?: (path: string) => void;
  /** 打开右侧 Terminal，可选聚焦会话并带上时间线输出预览*/
  onOpenTerminal?: (detail?: {
    sessionId?: string;
    previewOutput?: string;
    title?: string;
  }) => void;
  /** 时间线 delete_file「恢复」：写回删前正文*/
  onRestoreDeletedFile?: (stepId: string) => void | Promise<void>;
  /** 手动停止后「继续」：从 checkpoint 续跑。*/
  onResume?: () => void;
  /** 是否可继续（忙碌时禁用按钮）*/
  canResume?: boolean;
};

/** 搜索类：摘要优先（pattern），路径次之*/
function isSearchToolName(name: string): boolean {
  return name === "grep" || name === "search_files";
}

/**
 * 工具行标题：结构化片段，避免 name · path · summary · Done 糊成一串。 * 搜索：`grep` + pattern + path；其它：name + path + summary。 */
/** await 行里的短 id（taskId / sessionId）*/
function shortenAwaitId(raw: string, max = 14): string {
  const s = raw.trim();
  if (!s) return "";
  if (s.length <= max) return s;
  return `${s.slice(0, Math.max(1, max - 1))}…`;
}

function ToolLabel({
  step,
  shimmer = false,
  pathTriggerRef,
  pathInteractive = false,
  pathOpen = false,
  onPathClick,
}: {
  step: Extract<ChatTimelineStep, { kind: "tool" }>;
  shimmer?: boolean;
  /** 可点开结果路径列表时的锚点*/
  pathTriggerRef?: RefObject<HTMLButtonElement | null>;
  pathInteractive?: boolean;
  pathOpen?: boolean;
  onPathClick?: () => void;
}) {
  const search = isSearchToolName(step.name);
  const primary = search ? step.summary : step.path;
  const secondary = search ? step.path : step.summary;
  // 搜索：路径在 secondary；其它：路径在 primary
  const pathIsPrimary = !search;

  function pathBit(text: string, asPath: boolean) {
    if (asPath && pathInteractive && onPathClick) {
      // 可点击路径：完整保留、不做中间折叠；空间不够时由 CSS 末端 …
      return (
        <button
          type="button"
          ref={pathTriggerRef}
          className={`run-timeline-tool-bit is-path is-paths-trigger${pathOpen ? " is-open" : ""}`}
          aria-expanded={pathOpen}
          aria-haspopup="listbox"
          title={text}
          onClick={(e) => {
            e.stopPropagation();
            onPathClick();
          }}
        >
          {text}
        </button>
      );
    }
    const kind = asPath ? "is-path" : search && !asPath ? "is-query" : "";
    return (
      <span className={`run-timeline-tool-bit${kind ? ` ${kind}` : ""}`} title={text}>
        {text}
      </span>
    );
  }

  return (
    <span className={`run-timeline-label${shimmer ? " run-timeline-label--shimmer" : ""}`}>
      <span className="run-timeline-tool-name">{step.name}</span>
      {primary ? pathBit(primary, pathIsPrimary) : null}
      {secondary ? pathBit(secondary, !pathIsPrimary) : null}
    </span>
  );
}

/** 右侧 > 箭头：收起朝右，展开朝下（设计系统 SVG，与文字光学居中）。*/
function TimelineChevron({ open }: { open: boolean }) {
  return <ChevronRightIcon open={open} size="sm" className="run-timeline-chevron" aria-hidden />;
}

/**
 * 空闲临时 Planning：无活动工具、末尾无正文流式时显示。
 * 有活动 Thinking 时由 StatusStepRow 处理（无正文也显示 Planning）。
 * `live` 须为真正在跑（busy+pending），避免中断后永远 Planning。
 */
function shouldShowPlanning(steps: ChatTimelineStep[], live: boolean): boolean {
  if (!live) return false;
  for (const step of steps) {
    if (step.kind === "status" && step.status === "thinking" && step.active) return false;
    if (step.kind === "tool" && step.phase === "start" && step.active) return false;
  }
  const last = steps[steps.length - 1];
  if (last?.kind === "text" && last.text.trim()) return false;
  return true;
}

export function RunTimeline({
  steps,
  live = false,
  onOpenModelSettings,
  onOpenFile,
  onOpenTerminal,
  onRestoreDeletedFile,
  onResume,
  canResume = false,
}: Props) {
  const t = useT();
  const visible = steps.filter((s) => !(s.kind === "status" && s.status === "planning"));
  const items = groupTimelineForDisplay(visible);
  const showPlanning = shouldShowPlanning(visible, live);
  if (items.length === 0 && !showPlanning) return null;

  return (
    <ol className="run-timeline" aria-label={t("chat.timelineLabel")}>
      {items.map((item) => {
        if (item.type === "explore") {
          return (
            <ExploreGroupRow
              key={item.id}
              group={item}
              live={live}
              onOpenFile={onOpenFile}
              onOpenTerminal={onOpenTerminal}
              onRestoreDeletedFile={onRestoreDeletedFile}
              onResume={onResume}
              canResume={canResume}
            />
          );
        }
        const step = item.step;
        if (step.kind === "status") {
          return <StatusStepRow key={step.id} step={step} live={live} />;
        }
        if (step.kind === "text") {
          return <TextStepRow key={step.id} step={step} live={live} />;
        }
        if (step.kind === "error") {
          return (
            <ErrorStepRow
              key={step.id}
              step={step}
              onOpenModelSettings={onOpenModelSettings}
              onResume={onResume}
              canResume={canResume}
            />
          );
        }
        if (step.kind === "model_switch") {
          return <ModelSwitchStepRow key={step.id} step={step} />;
        }
        if (step.kind === "subagent") {
          return <SubagentStepRow key={step.id} step={step} />;
        }
        return (
          <ToolStepRow
            key={step.id}
            step={step}
            onOpenFile={onOpenFile}
            onOpenTerminal={onOpenTerminal}
            onRestoreDeletedFile={onRestoreDeletedFile}
          />
        );
      })}
      {showPlanning ? <PlanningRow key="planning-live" /> : null}
    </ol>
  );
}

const RESULT_PATHS_GAP = 6;
const RESULT_PATHS_PAD = 8;

type ResultPathsCoords = { top: number; left: number; width: number };

/** 相对工具行放置命中文件列表*/
function placeResultPathsPanel(
  trigger: DOMRect,
  panelW: number,
  panelH: number,
): ResultPathsCoords {
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const width = Math.min(panelW, vw - RESULT_PATHS_PAD * 2);
  const spaceBelow = vh - trigger.bottom - RESULT_PATHS_GAP - RESULT_PATHS_PAD;
  const spaceAbove = trigger.top - RESULT_PATHS_GAP - RESULT_PATHS_PAD;
  const openBelow = spaceBelow >= Math.min(panelH, 120) || spaceBelow >= spaceAbove;

  let top = openBelow ? trigger.bottom + RESULT_PATHS_GAP : trigger.top - RESULT_PATHS_GAP - panelH;
  if (top + panelH > vh - RESULT_PATHS_PAD) {
    top = Math.max(RESULT_PATHS_PAD, vh - RESULT_PATHS_PAD - panelH);
  }
  if (top < RESULT_PATHS_PAD) top = RESULT_PATHS_PAD;

  let left = trigger.left;
  if (left + width > vw - RESULT_PATHS_PAD) left = vw - RESULT_PATHS_PAD - width;
  if (left < RESULT_PATHS_PAD) left = RESULT_PATHS_PAD;

  return { top, left, width };
}

/** 已完成探索工具行：点击路径展开 resultPaths。*/
function ToolResultPathsPanel({
  paths,
  kinds,
  anchorRef,
  open,
  onOpenChange,
  onOpenFile,
}: {
  paths: string[];
  kinds?: ResultPathKind[];
  anchorRef: RefObject<HTMLElement | null>;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onOpenFile?: (path: string) => void;
}) {
  const t = useT();
  const panelRef = useRef<HTMLDivElement>(null);
  const [coords, setCoords] = useState<ResultPathsCoords | null>(null);

  useLayoutEffect(() => {
    if (!open) {
      setCoords(null);
      return;
    }
    function update() {
      const trigger = anchorRef.current;
      const panel = panelRef.current;
      if (!trigger || !panel) return;
      const tr = trigger.getBoundingClientRect();
      const pr = panel.getBoundingClientRect();
      const hasImage =
        (kinds ?? []).some((k) => k === "image") ||
        paths.some((p) => resolvePathKind(p) === "image");
      const width = hasImage
        ? Math.min(480, Math.max(300, tr.width + 96))
        : Math.min(420, Math.max(260, tr.width + 72));
      setCoords(placeResultPathsPanel(tr, width, pr.height));
    }
    update();
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, [open, anchorRef, paths, kinds]);

  useEffect(() => {
    if (!open) return;
    const onScroll = (e: Event) => {
      const target = e.target;
      if (target instanceof Node && panelRef.current?.contains(target)) return;
      onOpenChange(false);
    };
    const onPointerDown = (e: MouseEvent) => {
      const target = e.target;
      if (!(target instanceof Node)) return;
      if (panelRef.current?.contains(target)) return;
      if (anchorRef.current?.contains(target)) return;
      onOpenChange(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onOpenChange(false);
    };
    window.addEventListener("scroll", onScroll, true);
    window.addEventListener("pointerdown", onPointerDown, true);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("scroll", onScroll, true);
      window.removeEventListener("pointerdown", onPointerDown, true);
      window.removeEventListener("keydown", onKey);
    };
  }, [open, onOpenChange, anchorRef]);

  if (!open || paths.length === 0 || typeof document === "undefined") return null;

  const panelStyle: CSSProperties = coords
    ? { top: coords.top, left: coords.left, width: coords.width }
    : { top: 0, left: 0, width: 320, visibility: "hidden" };

  return createPortal(
    <div
      ref={panelRef}
      className="run-timeline-explore-files"
      role="listbox"
      aria-label={t("chat.exploreFilesListAria")}
      style={panelStyle}
    >
      <ul className="run-timeline-explore-files__list">
        {paths.map((path, index) => {
          const kind = resolvePathKind(path, kinds?.[index]);
          if (kind === "image") {
            return (
              <li key={`${path}-${index}`} className="run-timeline-explore-files__shot-item">
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
            <li key={`${path}-${index}`}>
              {canOpen ? (
                <button
                  type="button"
                  className="run-timeline-explore-files__item is-path-only"
                  title={path}
                  onMouseDown={(e) => e.stopPropagation()}
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    onOpenFile?.(path);
                    onOpenChange(false);
                  }}
                >
                  {body}
                </button>
              ) : (
                <span
                  className="run-timeline-explore-files__item is-path-only is-static"
                  title={path}
                >
                  {body}
                </span>
              )}
            </li>
          );
        })}
      </ul>
    </div>,
    document.body,
  );
}

/** Explored / Exploring 汇总行：默认折叠，展开后见 Thought / 叙述 / 工具。*/
function ExploreGroupRow({
  group,
  live = false,
  onOpenFile,
  onOpenTerminal,
  onRestoreDeletedFile,
  onResume,
  canResume = false,
}: {
  group: ExploreGroup;
  live?: boolean;
  onOpenFile?: (path: string) => void;
  onOpenTerminal?: (detail?: {
    sessionId?: string;
    previewOutput?: string;
    title?: string;
  }) => void;
  onRestoreDeletedFile?: (stepId: string) => void | Promise<void>;
  onResume?: () => void;
  canResume?: boolean;
}) {
  const t = useT();
  const [collapsed, setCollapsed] = useState(true);
  const open = !collapsed;
  const label = formatExploreLabel(t, group);

  return (
    <li
      className={`run-timeline-item run-timeline-item--explore${group.active ? " is-active" : ""}`}
    >
      <div className="run-timeline-explore">
        <button
          type="button"
          className="run-timeline-explore-toggle"
          aria-expanded={open}
          aria-label={open ? t("chat.exploreCollapse") : t("chat.exploreExpand")}
          onClick={() => setCollapsed((v) => !v)}
        >
          <span
            className={`run-timeline-label${group.active ? " run-timeline-label--shimmer" : ""}`}
          >
            {label}
          </span>
          <TimelineChevron open={open} />
        </button>
        {open ? (
          <ol className="run-timeline-explore-body">
            {group.steps.map((step) => {
              if (step.kind === "status") {
                return <StatusStepRow key={step.id} step={step} />;
              }
              if (step.kind === "text") {
                return <TextStepRow key={step.id} step={step} live={live} />;
              }
              if (step.kind === "error") {
                return (
                  <ErrorStepRow
                    key={step.id}
                    step={step}
                    onResume={onResume}
                    canResume={canResume}
                  />
                );
              }
              if (step.kind === "model_switch") {
                return <ModelSwitchStepRow key={step.id} step={step} />;
              }
              if (step.kind === "subagent") {
                return <SubagentStepRow key={step.id} step={step} />;
              }
              if (step.kind !== "tool") return null;
              return (
                <ToolStepRow
                  key={step.id}
                  step={step}
                  onOpenFile={onOpenFile}
                  onOpenTerminal={onOpenTerminal}
                  onRestoreDeletedFile={onRestoreDeletedFile}
                />
              );
            })}
          </ol>
        ) : null}
      </div>
    </li>
  );
}

type Translate = ReturnType<typeof useT>;

/** Explored 4 files, 2 searches / 已探索 4 个文件，2 次搜索。*/
function formatExploreLabel(t: Translate, group: ExploreGroup): string {
  const verb = group.active ? t("chat.exploring") : t("chat.explored");
  const parts: string[] = [];
  if (group.fileCount > 0) {
    parts.push(
      t(group.fileCount === 1 ? "chat.exploreFileOne" : "chat.exploreFileMany").replace(
        "{n}",
        String(group.fileCount),
      ),
    );
  }
  if (group.searchCount > 0) {
    parts.push(
      t(group.searchCount === 1 ? "chat.exploreSearchOne" : "chat.exploreSearchMany").replace(
        "{n}",
        String(group.searchCount),
      ),
    );
  }
  if (group.pageCount > 0) {
    parts.push(
      t(group.pageCount === 1 ? "chat.explorePageOne" : "chat.explorePageMany").replace(
        "{n}",
        String(group.pageCount),
      ),
    );
  }
  if (parts.length === 0) return verb;
  return `${verb} ${parts.join(t("chat.exploreJoin"))}`;
}

/** 空闲临时占位：扫光「规划下一步」*/
function PlanningRow() {
  const t = useT();
  return (
    <li className="run-timeline-item run-timeline-item--status is-active run-timeline-item--status-enter">
      <div className="run-timeline-status">
        <button
          type="button"
          className="run-timeline-status-toggle"
          disabled
          aria-label={t("chat.planning")}
        >
          <span className="run-timeline-label-enter" key="planning">
            <span className="run-timeline-label run-timeline-label--shimmer">
              {t("chat.planning")}
            </span>
          </span>
        </button>
      </div>
    </li>
  );
}

/** 对用户可见的叙述，按事件顺序插在工具前后*/
function TextStepRow({
  step,
  live = false,
}: {
  step: Extract<ChatTimelineStep, { kind: "text" }>;
  /** 仍在流式时才显示 caret；已停止则收束未闭合代码块*/
  live?: boolean;
}) {
  const { markdownTheme } = useDesignTheme();
  if (!step.text.trim()) return null;
  return (
    <li className="run-timeline-item run-timeline-item--text">
      <div className="run-timeline-reply">
        <StreamingMarkdownView
          markdown={step.text}
          theme={markdownTheme}
          streaming={live}
          onLinkClick={(href) => {
            if (!isBrowserableUrl(href)) return false;
            requestOpenBrowser(href);
            return true;
          }}
        />
      </div>
    </li>
  );
}

/** 短于此时长显示 “Thought briefly” / 「已思考片刻」。*/
const THOUGHT_BRIEF_MS = 1500;

/** 思考耗时展示如 2s / 12s（不用 briefly）。*/
function formatThinkingDuration(ms: number): string {
  if (ms < 1000) return `${Math.max(0.1, Math.round(ms / 100) / 10)}s`;
  const sec = ms / 1000;
  if (sec < 10) {
    const rounded = Math.round(sec * 10) / 10;
    return `${Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1)}s`;
  }
  return `${Math.round(sec)}s`;
}

/** Thought briefly / Thought 1.2s*/
function formatThoughtLabel(t: Translate, durationMs: number | undefined): string {
  if (durationMs == null || durationMs <= 0 || durationMs < THOUGHT_BRIEF_MS) {
    return t("chat.thoughtBriefly");
  }
  return `${t("chat.thought")} ${formatThinkingDuration(durationMs)}`;
}

/**
 * 思考正文框：最多约 4 行，超出可滚： * 上下用渐隐遮罩标示可继续滚动。 */
function ThinkingBody({ text }: { text: string }) {
  const scrollerRef = useRef<HTMLPreElement>(null);
  const [fadeTop, setFadeTop] = useState(false);
  const [fadeBottom, setFadeBottom] = useState(false);

  useLayoutEffect(() => {
    const el = scrollerRef.current;
    if (!el) return;

    function updateFades() {
      if (!el) return;
      const { scrollTop, scrollHeight, clientHeight } = el;
      const overflow = scrollHeight > clientHeight + 1;
      setFadeTop(overflow && scrollTop > 1);
      setFadeBottom(overflow && scrollTop + clientHeight < scrollHeight - 1);
    }

    updateFades();
    el.addEventListener("scroll", updateFades, { passive: true });
    const ro = typeof ResizeObserver !== "undefined" ? new ResizeObserver(updateFades) : null;
    ro?.observe(el);
    return () => {
      el.removeEventListener("scroll", updateFades);
      ro?.disconnect();
    };
  }, []);

  return (
    <div
      className={`run-timeline-thinking-box${fadeTop ? " has-fade-top" : ""}${fadeBottom ? " has-fade-bottom" : ""}`}
    >
      <pre ref={scrollerRef} className="run-timeline-thinking">
        {text}
      </pre>
    </div>
  );
}

/** Thinking→Thought：无正文时显示 Planning；有正文才可展开。*/
function StatusStepRow({
  step,
  live = false,
}: {
  step: Extract<ChatTimelineStep, { kind: "status" }>;
  live?: boolean;
}) {
  const t = useT();
  const body = (step.text ?? step.summary)?.trim() ?? "";
  const hasBody = Boolean(body);
  const [collapsed, setCollapsed] = useState(true);
  const open = hasBody && !collapsed;
  // 本轮已不在跑时，即使 step.active 残留也按「已结束」展示，避免已思考秒数跟着墙钟
  const active = Boolean(live && step.active);
  const asPlanning = active && !hasBody;
  /** planning / thinking / thought：切换时 remount 触发标签过渡 */
  const labelMode = asPlanning ? "planning" : active ? "thinking" : "thought";

  // 历史展示只用已结算的 durationMs；禁止用 startedAt+墙钟（刷新会越刷越大：
  let label: string;
  if (asPlanning) {
    label = t("chat.planning");
  } else if (active) {
    label = t("chat.thinking");
  } else {
    label = formatThoughtLabel(t, step.durationMs);
  }

  const labelNode = (
    <span className="run-timeline-label-enter" key={labelMode}>
      <span className={`run-timeline-label${active ? " run-timeline-label--shimmer" : ""}`}>
        {label}
      </span>
    </span>
  );

  return (
    <li
      className={`run-timeline-item run-timeline-item--status${active ? " is-active" : ""}${hasBody ? " is-expandable" : ""}`}
    >
      <div className="run-timeline-status">
        {hasBody ? (
          <button
            type="button"
            className="run-timeline-status-toggle is-expandable"
            aria-expanded={open}
            aria-label={open ? t("chat.thinkingCollapse") : t("chat.thinkingExpand")}
            onClick={() => setCollapsed((v) => !v)}
          >
            {labelNode}
            <TimelineChevron open={open} />
          </button>
        ) : (
          <div
            className="run-timeline-status-toggle"
            aria-label={asPlanning ? t("chat.planning") : label}
          >
            {labelNode}
          </div>
        )}
        {open ? <ThinkingBody text={step.text || step.summary || ""} /> : null}
      </div>
    </li>
  );
}

/** Auto 故障切换说明（info 行）*/
function ModelSwitchStepRow({
  step,
}: {
  step: Extract<ChatTimelineStep, { kind: "model_switch" }>;
}) {
  const t = useT();
  const reasonKey = `chat.modelSwitch.reason.${step.reason}` as const;
  return (
    <li className="run-timeline-item run-timeline-item--model-switch">
      <div className="run-timeline-model-switch">
        <span className="run-timeline-label">{t("chat.modelSwitch.label")}</span>
        <p className="run-timeline-model-switch-msg">
          {t("chat.modelSwitch.message", { from: step.fromLabel, to: step.toLabel })}
          {" · "}
          {t(reasonKey)}
          {step.detail ? ` …${step.detail}` : ""}
        </p>
      </div>
    </li>
  );
}

/** 子代理 Task 生命周期行。*/
function SubagentStepRow({ step }: { step: Extract<ChatTimelineStep, { kind: "subagent" }> }) {
  return (
    <li
      className={`run-timeline-item run-timeline-item--subagent${step.active ? " is-active" : ""}`}
    >
      <SubagentCard step={step} />
    </li>
  );
}

/**
 * 错误行：真错误用 Error 卡片；手动停止只一行文案 +「继续」。
 * 缺 API key 时附带设置跳转芯片。
 */
function ErrorStepRow({
  step,
  onOpenModelSettings,
  onResume,
  canResume = false,
}: {
  step: Extract<ChatTimelineStep, { kind: "error" }>;
  onOpenModelSettings?: () => void;
  onResume?: () => void;
  /** 无 checkpoint / 不可续跑时不展示「继续」。*/
  canResume?: boolean;
}) {
  const t = useT();
  const softCode =
    step.code && isSoftStopCode(step.code) ? step.code : classifyRunError(step.message);
  const softStop = isSoftStopCode(softCode);
  const missingKey = step.code === "MODEL_API_KEY_MISSING" || isMissingApiKeyError(step.message);

  if (softStop) {
    // 软中断文案跟 code 走 i18n，避免英文 bridge 原文盖住中文界面
    const label = softCode === "PROCESS_EXIT" ? t("chat.abnormalExit") : t("chat.stopped");
    return (
      <li className="run-timeline-item run-timeline-item--stopped">
        <div className="run-timeline-stopped">
          <span className="run-timeline-label">{label}</span>
          {onResume && canResume ? (
            <Button
              variant="text"
              size="sm"
              className="run-timeline-resume"
              onClick={() => onResume()}
            >
              {t("chat.resume")}
            </Button>
          ) : null}
        </div>
      </li>
    );
  }

  return (
    <li className="run-timeline-item run-timeline-item--error is-error">
      <div className="run-timeline-error" role="alert">
        <div className="run-timeline-error-head">
          <span className="run-timeline-label">{t("chat.errorLabel")}</span>
          {step.code ? (
            <span className="run-timeline-badge run-timeline-badge--err">{step.code}</span>
          ) : (
            <span className="run-timeline-badge run-timeline-badge--err">
              {t("chat.toolFailed")}
            </span>
          )}
        </div>
        {missingKey ? (
          <p className="run-timeline-error-msg bubble-system-line">
            <span>{t("chat.errors.missingApiKeyLead")} </span>
            {onOpenModelSettings ? (
              <Kbd
                className="bubble-jump-kbd"
                aria-label={t("chat.errors.jumpSettingsModel")}
                onClick={() => onOpenModelSettings()}
              >
                {t("chat.errors.jumpSettingsModel")}
              </Kbd>
            ) : (
              <span>{t("chat.errors.jumpSettingsModel")}</span>
            )}
            <span> {t("chat.errors.missingApiKeyTail")}</span>
          </p>
        ) : (
          <p className="run-timeline-error-msg">{step.message}</p>
        )}
      </div>
    </li>
  );
}

function ToolStepRow({
  step,
  onOpenFile,
  onOpenTerminal,
  onRestoreDeletedFile,
}: {
  step: Extract<ChatTimelineStep, { kind: "tool" }>;
  onOpenFile?: (path: string) => void;
  onOpenTerminal?: (detail?: {
    sessionId?: string;
    previewOutput?: string;
    title?: string;
  }) => void;
  onRestoreDeletedFile?: (stepId: string) => void | Promise<void>;
}) {
  const t = useT();
  /** TTL 到期后 bump，立刻藏掉「恢复」按钮。*/
  const [, setRestoreTick] = useState(0);
  const running = step.phase === "start" && step.active;
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
  const canOpenPaths = resultPaths.length > 0;
  const pathTriggerRef = useRef<HTMLButtonElement>(null);
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
  const badge = running ? (
    <span className="run-timeline-badge">{t("chat.toolRunning")}</span>
  ) : failed ? (
    <span className="run-timeline-badge run-timeline-badge--err">{t("chat.toolFailed")}</span>
  ) : null;

  return (
    <li
      className={`run-timeline-item run-timeline-item--tool${running ? " is-active" : ""}${failed ? " is-error" : ""}`}
    >
      <div className="run-timeline-tool">
        <div className="run-timeline-tool-head">
          <ToolLabel
            step={step}
            shimmer={running}
            pathTriggerRef={pathTriggerRef}
            pathInteractive={canOpenPaths}
            pathOpen={pathsOpen}
            onPathClick={() => setPathsOpen((v) => !v)}
          />
          {badge}
        </div>
        {canOpenPaths ? (
          <ToolResultPathsPanel
            paths={resultPaths}
            kinds={resultPathKinds}
            anchorRef={pathTriggerRef}
            open={pathsOpen}
            onOpenChange={setPathsOpen}
            onOpenFile={onOpenFile}
          />
        ) : null}
      </div>
    </li>
  );
}
