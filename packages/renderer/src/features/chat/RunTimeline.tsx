/**
 * 助手气泡内的运行时间线：
 * Thinking / 叙述 / 工具 / 错误；探索类步骤默认收成 Explored；
 * pending 空闲时末行临时 Planning。
 */

import { Button, Kbd, useDesignTheme } from "@thinker-workbench/design/react";
import { StreamingMarkdownView } from "@thinker-workbench/markdown/react";
import type { ChatTimelineStep } from "@thinker-workbench/shared";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { useT } from "../../i18n/I18nProvider";
import { DeleteFileCard } from "./DeleteFileCard";
import { FileDiffView } from "./FileDiffView";
import { isMissingApiKeyError } from "./systemErrors";
import { type ExploreGroup, groupTimelineForDisplay, isMutationTool } from "./timelineExplore";
import { isDeleteRestoreExpired, readDeleteFileRestoreTtlDays } from "./timelineModel";

type Props = {
  steps: ChatTimelineStep[];
  /** 本轮助手气泡仍在 pending：空闲时末行临时显示规划中。 */
  live?: boolean;
  /** 缺 API key 错误行上的设置跳转。 */
  onOpenModelSettings?: () => void;
  /** 在右侧 Files 面板打开工作空间文件。 */
  onOpenFile?: (path: string) => void;
  /** 时间线 delete_file「恢复」：写回删前正文。 */
  onRestoreDeletedFile?: (stepId: string) => void | Promise<void>;
  /** 手动停止后「继续」：从 checkpoint 续跑。 */
  onResume?: () => void;
  /** 是否可继续（忙碌时禁用按钮）。 */
  canResume?: boolean;
};

function toolTitle(step: Extract<ChatTimelineStep, { kind: "tool" }>): string {
  const parts = [step.name];
  if (step.path) parts.push(step.path);
  if (step.summary) parts.push(step.summary);
  return parts.length > 1 ? parts.join(" · ") : step.name;
}

/** 右侧 > 箭头：收起朝右，展开朝下。 */
function TimelineChevron({ open }: { open: boolean }) {
  return <span className={`run-timeline-chevron${open ? " is-open" : ""}`} aria-hidden="true" />;
}

/**
 * 空闲临时 Planning：无活动工具、末尾无正文流式；
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
              onOpenFile={onOpenFile}
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
          return <TextStepRow key={step.id} step={step} />;
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
        return (
          <ToolStepRow
            key={step.id}
            step={step}
            onOpenFile={onOpenFile}
            onRestoreDeletedFile={onRestoreDeletedFile}
          />
        );
      })}
      {showPlanning ? <PlanningRow key="planning-live" /> : null}
    </ol>
  );
}

/** Explored / Exploring 汇总行：默认折叠，展开见 Thought / 叙述 / 工具。 */
function ExploreGroupRow({
  group,
  onOpenFile,
  onRestoreDeletedFile,
  onResume,
  canResume = false,
}: {
  group: ExploreGroup;
  onOpenFile?: (path: string) => void;
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
                return <TextStepRow key={step.id} step={step} />;
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
              return (
                <ToolStepRow
                  key={step.id}
                  step={step}
                  onOpenFile={onOpenFile}
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

/** Explored 4 files, 2 searches / 已探索 4 个文件，2 次搜索 */
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
  if (parts.length === 0) return verb;
  return `${verb} ${parts.join(t("chat.exploreJoin"))}`;
}

/** 空闲临时占位：扫光「规划下一步」。 */
function PlanningRow() {
  const t = useT();
  return (
    <li className="run-timeline-item run-timeline-item--status is-active">
      <div className="run-timeline-status">
        <button
          type="button"
          className="run-timeline-status-toggle"
          disabled
          aria-label={t("chat.planning")}
        >
          <span className="run-timeline-label run-timeline-label--shimmer">
            {t("chat.planning")}
          </span>
        </button>
      </div>
    </li>
  );
}

/** 对用户可见的叙述，按事件顺序插在工具前后。 */
function TextStepRow({ step }: { step: Extract<ChatTimelineStep, { kind: "text" }> }) {
  const { markdownTheme } = useDesignTheme();
  if (!step.text.trim()) return null;
  return (
    <li className="run-timeline-item run-timeline-item--text">
      <div className="run-timeline-reply">
        <StreamingMarkdownView markdown={step.text} theme={markdownTheme} />
      </div>
    </li>
  );
}

/** 短于此时长显示 “Thought briefly” / 「已思考片刻」。 */
const THOUGHT_BRIEF_MS = 1500;

/** 思考耗时展示：1.2s / 12s（不含 briefly）。 */
function formatThinkingDuration(ms: number): string {
  if (ms < 1000) return `${Math.max(0.1, Math.round(ms / 100) / 10)}s`;
  const sec = ms / 1000;
  if (sec < 10) {
    const rounded = Math.round(sec * 10) / 10;
    return `${Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1)}s`;
  }
  return `${Math.round(sec)}s`;
}

/** Thought briefly / Thought 1.2s。 */
function formatThoughtLabel(t: Translate, durationMs: number | undefined): string {
  if (durationMs == null || durationMs <= 0 || durationMs < THOUGHT_BRIEF_MS) {
    return t("chat.thoughtBriefly");
  }
  return `${t("chat.thought")} ${formatThinkingDuration(durationMs)}`;
}

/**
 * 思考正文框：最多约 4 行，超出可滚；
 * 上下用渐隐遮罩标示可继续滚动。
 */
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
  }, [text]);

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

/** Thinking→Thought：无正文时显示 Planning；有正文才可展开。 */
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
  const active = Boolean(live && step.active);
  const asPlanning = active && !hasBody;

  let label: string;
  if (asPlanning) {
    label = t("chat.planning");
  } else if (active) {
    label = t("chat.thinking");
  } else {
    label = formatThoughtLabel(t, step.durationMs);
  }

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
            <span
              className={`run-timeline-label${active ? " run-timeline-label--shimmer" : ""}`}
            >
              {label}
            </span>
            <TimelineChevron open={open} />
          </button>
        ) : (
          <div
            className="run-timeline-status-toggle"
            aria-label={asPlanning ? t("chat.planning") : label}
          >
            <span
              className={`run-timeline-label${active ? " run-timeline-label--shimmer" : ""}`}
            >
              {label}
            </span>
          </div>
        )}
        {open ? <ThinkingBody text={step.text || step.summary || ""} /> : null}
      </div>
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
}: {
  step: Extract<ChatTimelineStep, { kind: "error" }>;
  onOpenModelSettings?: () => void;
  onResume?: () => void;
  /** 保留入参以兼容调用方；已停止行不再据此禁用（由 resume() 自行防重入）。 */
  canResume?: boolean;
}) {
  const t = useT();
  const cancelled = step.code === "CANCELLED";
  const missingKey =
    step.code === "MODEL_API_KEY_MISSING" || isMissingApiKeyError(step.message);

  if (cancelled) {
    return (
      <li className="run-timeline-item run-timeline-item--stopped">
        <div className="run-timeline-stopped">
          <span className="run-timeline-label">{step.message || t("chat.stopped")}</span>
          {onResume ? (
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
            <span className="run-timeline-badge run-timeline-badge--err">{t("chat.toolFailed")}</span>
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
  onRestoreDeletedFile,
}: {
  step: Extract<ChatTimelineStep, { kind: "tool" }>;
  onOpenFile?: (path: string) => void;
  onRestoreDeletedFile?: (stepId: string) => void | Promise<void>;
}) {
  const t = useT();
  /** TTL 到期时 bump，立刻藏掉「恢复」按钮。 */
  const [, setRestoreTick] = useState(0);
  const running = step.phase === "start" && step.active;
  const failed = step.phase === "end" && step.ok === false;
  const hasDiff = Boolean(step.diff?.trim());
  const mutation = isMutationTool(step.name);
  const isDelete = step.name === "delete_file";
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
    // setTimeout 上限约 24.8 天；更长 TTL 交给会话侧定时 prune
    if (left > 2_147_483_647) return;
    const timer = window.setTimeout(() => setRestoreTick((n) => n + 1), left + 32);
    return () => window.clearTimeout(timer);
  }, [isDelete, step.restoreContent, step.restoreCachedAt]);

  // 删除：卡片展示（不进 Explored）
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

  // 改文件：进行中只显示 edit/write · path + Running；完成后换成 diff，工具行消失
  if (mutation) {
    if (running) {
      return (
        <li className="run-timeline-item run-timeline-item--tool is-active">
          <div className="run-timeline-tool">
            <div className="run-timeline-tool-head">
              <span className="run-timeline-label run-timeline-label--shimmer">
                {toolTitle(step)}
              </span>
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

  const badge = running ? (
    <span className="run-timeline-badge">{t("chat.toolRunning")}</span>
  ) : failed ? (
    <span className="run-timeline-badge run-timeline-badge--err">{t("chat.toolFailed")}</span>
  ) : step.phase === "end" ? (
    <span className="run-timeline-badge">{t("chat.toolDone")}</span>
  ) : null;

  return (
    <li
      className={`run-timeline-item run-timeline-item--tool${running ? " is-active" : ""}${failed ? " is-error" : ""}`}
    >
      <div className="run-timeline-tool">
        <div className="run-timeline-tool-head">
          <span className={`run-timeline-label${running ? " run-timeline-label--shimmer" : ""}`}>
            {toolTitle(step)}
          </span>
          {badge}
        </div>
      </div>
    </li>
  );
}
