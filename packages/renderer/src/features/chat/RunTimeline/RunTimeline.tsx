/**
 * 助手气泡内的运行时间线（编排壳）：
 * Thinking / 叙述 / 工具 / 错误；探索类步骤默认收成 Explored；
 * 已完成且非本会话末条时，工具 / 思考 / 中间小结折成「Worked for …」，仅末尾正式答复外露。
 *
 * 纯函数见 ./format，各步骤行见 ./steps/*。
 */
import type { ChatTimelineStep } from "@thinker-workbench/shared";
import { useEffect, useRef, useState } from "react";
import { useT } from "../../../i18n/useI18n";
import {
  groupTimelineForDisplay,
  hasPendingTailHold,
  isExploreToolName,
  TAIL_EXIT_ANIM_MS,
  tailHoldForTool,
} from "../timelineExplore";
import { isLiveStreamingTextStep } from "../timelineLive";
import { isTransitionTextStep } from "../timelineModel";
import {
  filterTimelineExterior,
  formatWorkedForElapsed,
  shouldFoldWorkHistory,
  timelineHasFoldableWork,
} from "../timelineWorkFold";
import { shouldShowPlanning } from "./format";
import { ErrorStepRow, SubagentStepRow } from "./steps/AgentSteps";
import { ExploreGroupRow } from "./steps/ExploreGroupRow";
import { StatusStepRow, TextStepRow } from "./steps/TextSteps";
import { ToolStepRow } from "./steps/ToolSteps";
import { ModelSwitchStepRow, PlanningRow, TransitionStepRow } from "./steps/TransitionSteps";
import { TimelineChevron } from "./TimelineChevron";
import { useTickingNow } from "./useTickingNow";

/** 工具步（与 ToolStepRow 入参一致）；暂留卡只可能是工具步。 */
type ChatTimelineToolStep = Extract<ChatTimelineStep, { kind: "tool" }>;

/** 尾部暂留卡收组退出动画时长（ms），与 timelineExplore 的 TAIL_EXIT_ANIM_MS 一致。 */
const TAIL_EXIT_MS = TAIL_EXIT_ANIM_MS;

type Props = {
  steps: ChatTimelineStep[];
  /** 本轮助手气泡仍在 pending：空闲时末行临时显示规划中*/
  live?: boolean;
  /** 本轮累计耗时（ms）；折叠态「Worked for …」用。*/
  durationMs?: number;
  /**
   * 是否为线程末条消息。
   * 本会话内刚跑完且仍是末条时保持展开；重开历史或发出跟随后再折成 Worked for。
   */
  trailing?: boolean;
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

export function RunTimeline({
  steps,
  live = false,
  durationMs,
  trailing = false,
  onOpenModelSettings,
  onOpenFile,
  onOpenTerminal,
  onRestoreDeletedFile,
  onResume,
  canResume = false,
}: Props) {
  const t = useT();
  const visible = steps.filter((s) => !(s.kind === "status" && s.status === "planning"));
  /** 本挂载周期内是否经历过 live（区分「刚跑完」与「重开历史」）。 */
  const [livedInSession, setLivedInSession] = useState(live);
  useEffect(() => {
    if (live) setLivedInSession(true);
  }, [live]);
  /** 重开历史 / 发出跟随后折成 Worked for；本会话刚跑完且仍末条则保持展开。 */
  const foldable = shouldFoldWorkHistory({
    live,
    hasWork: timelineHasFoldableWork(visible),
    livedInSession,
    trailing,
  });
  /** 用户点开后本会话内保持展开。 */
  const [workExpanded, setWorkExpanded] = useState(false);
  const showWork = live || !foldable || workExpanded;
  const displaySteps = showWork ? visible : filterTimelineExterior(visible);
  const now = useTickingNow(live);
  const items = groupTimelineForDisplay(displaySteps, now);
  // 收起动画中的暂留卡（淡出上移，被 Explored 吸收），用于压制 planning
  const [leavingTails, setLeavingTails] = useState<ChatTimelineToolStep[]>([]);
  // 尾部探索调用暂留组外（加载中 / 最小时长 / 收起动画中）时不出现 Planning next move：
  // 那张卡本身就是当前活动，等它完全收起后再让规划行上场
  const tailHeld = hasPendingTailHold(displaySteps, now) || leavingTails.length > 0;
  const showPlanning = shouldShowPlanning(visible, live) && !tailHeld;

  /**
   * 尾部暂留卡收组动画：卡从 items 消失（折进 Explored）时多留 180ms
   * 淡出上移，避免「一闪就没了」。Explored 行本身不因此变化。
   */
  const tailStepsRef = useRef<Map<string, ChatTimelineToolStep>>(new Map());
  const animTimersRef = useRef<Set<number>>(new Set());
  useEffect(
    () => () => {
      for (const id of animTimersRef.current) window.clearTimeout(id);
      animTimersRef.current.clear();
    },
    [],
  );
  useEffect(() => {
    // 折成 Worked for 时不跟踪：整列表消失不是“收组”
    if (!showWork) {
      tailStepsRef.current = new Map();
      return;
    }
    const currentTails = new Map<string, ChatTimelineToolStep>();
    for (const item of items) {
      if (item.type === "explore") continue;
      const s = item.step;
      if (s.kind === "tool" && isExploreToolName(s.name)) currentTails.set(s.id, s);
    }
    const gone: ChatTimelineToolStep[] = [];
    for (const [id, step] of tailStepsRef.current) {
      if (!currentTails.has(id)) gone.push(step);
    }
    tailStepsRef.current = currentTails;

    if (gone.length > 0) {
      setLeavingTails((prev) => [...prev, ...gone]);
      const timer = window.setTimeout(() => {
        animTimersRef.current.delete(timer);
        setLeavingTails((prev) => prev.filter((s) => !gone.some((g) => g.id === s.id)));
      }, TAIL_EXIT_MS);
      animTimersRef.current.add(timer);
    }
  });

  if (items.length === 0 && !showPlanning && !foldable) return null;

  const workedLabel = t("chat.workedFor", { time: formatWorkedForElapsed(durationMs) });

  return (
    <ol className="run-timeline" aria-label={t("chat.timelineLabel")}>
      {foldable ? (
        <li className="run-timeline-item run-timeline-item--worked">
          <div className="run-timeline-worked">
            <button
              type="button"
              className="run-timeline-worked-toggle"
              aria-expanded={workExpanded}
              aria-label={workExpanded ? t("chat.workedForCollapse") : t("chat.workedForExpand")}
              onClick={() => setWorkExpanded((v) => !v)}
            >
              <span className="run-timeline-label">{workedLabel}</span>
              <TimelineChevron open={workExpanded} />
            </button>
          </div>
        </li>
      ) : null}
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
        if (step.kind === "transition") {
          return <TransitionStepRow key={step.id} step={step} />;
        }
        if (step.kind === "text") {
          return (
            <TextStepRow
              key={step.id}
              step={step}
              live={isLiveStreamingTextStep(visible, step.id, live)}
              transition={isTransitionTextStep(visible, step.id)}
            />
          );
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
            pending={
              step.kind === "tool" && isExploreToolName(step.name) && tailHoldForTool(step, now)
            }
            onOpenFile={onOpenFile}
            onOpenTerminal={onOpenTerminal}
            onRestoreDeletedFile={onRestoreDeletedFile}
          />
        );
      })}
      {/* 收组退出动画中的暂留卡：淡出上移，被 Explored 吸收 */}
      {leavingTails.map((step) => (
        <ToolStepRow
          key={`tail-exit:${step.id}`}
          step={step}
          ghost
          onOpenFile={onOpenFile}
          onOpenTerminal={onOpenTerminal}
          onRestoreDeletedFile={onRestoreDeletedFile}
        />
      ))}
      {showPlanning ? <PlanningRow key="planning-live" /> : null}
    </ol>
  );
}
