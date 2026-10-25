/**
 * 过渡 / 计划占位 / 模型切换步骤行。
 */
import type { ChatTimelineStep } from "@thinker-workbench/shared";
import { useT } from "../../../../ui/i18n/useI18n";

/** 承上启下小结行：模型在调工具前以 `[NEXT]` 标记给出的一句话。 */
export function TransitionStepRow({
  step,
}: {
  step: Extract<ChatTimelineStep, { kind: "transition" }>;
}) {
  if (!step.text.trim()) return null;
  return (
    <li className="run-timeline-item run-timeline-item--transition">
      <div className="run-timeline-transition">{step.text}</div>
    </li>
  );
}

/** 空闲临时占位：扫光「规划下一步」*/
export function PlanningRow() {
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

/** Auto 故障切换说明（info 行）*/
export function ModelSwitchStepRow({
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
