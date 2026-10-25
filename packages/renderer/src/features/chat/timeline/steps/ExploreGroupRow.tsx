/**
 * Explored / Exploring 汇总行：默认折叠，展开后见 Thought / 叙述 / 工具。
 */
import { useState } from "react";
import { useT } from "../../../../ui/i18n/useI18n";
import { formatExploreLabel } from "../format";
import { TimelineChevron } from "../TimelineChevron";
import type { ExploreGroup } from "../timelineExplore";
import { isLiveStreamingTextStep } from "../timelineLive";
import { isTransitionTextStep } from "../transition";
import { ErrorStepRow, SubagentStepRow } from "./AgentSteps";
import { StatusStepRow, TextStepRow } from "./TextSteps";
import { ToolStepRow } from "./ToolSteps";
import { ModelSwitchStepRow, TransitionStepRow } from "./TransitionSteps";

export function ExploreGroupRow({
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
                return <StatusStepRow key={step.id} step={step} live={live && group.active} />;
              }
              if (step.kind === "transition") {
                return <TransitionStepRow key={step.id} step={step} />;
              }
              if (step.kind === "text") {
                return (
                  <TextStepRow
                    key={step.id}
                    step={step}
                    live={isLiveStreamingTextStep(group.steps, step.id, live && group.active)}
                    transition={isTransitionTextStep(group.steps, step.id)}
                  />
                );
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
