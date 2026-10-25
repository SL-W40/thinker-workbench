/**
 * `update_plan` 的工具行：进度 + 这次动过的步骤。
 *
 * 计划列表是全量替换，只显示「更新计划」看不出改了啥；
 * 这里把完成 / 新增 / 删除 / 退回分开标注，一行说清更新了什么。
 */
import type { ChatTimelineToolStep } from "@thinker-workbench/shared";
import { useT } from "../../../ui/i18n/useI18n";

/** 一行最多展示几条变更（再多就折算成「另有 N 项」）。 */
const MAX_CHIPS = 2;

type ChangeKind = "completed" | "added" | "removed" | "reopened";

/** 各类变更的字形。 */
const GLYPH: Record<ChangeKind, string> = {
  completed: "✓",
  added: "+",
  removed: "−",
  reopened: "↺",
};

type Props = {
  step: ChatTimelineToolStep;
  running: boolean;
  failed: boolean;
};

export function PlanUpdateRow({ step, running, failed }: Props) {
  const t = useT();
  const hint = step.planUpdate;
  const chips: Array<{ key: string; kind: ChangeKind; label: string }> = [];
  const push = (kind: ChangeKind, labels: string[] | undefined) => {
    for (const label of labels ?? []) chips.push({ key: `${kind}-${label}`, kind, label });
  };
  // 顺序即重要性：完成的进度最该被看见，其次是新增、删除、退回
  push("completed", hint?.completed);
  push("added", hint?.added);
  push("removed", hint?.removed);
  push("reopened", hint?.reopened);
  const shown = chips.slice(0, MAX_CHIPS);
  const hidden = chips.length - shown.length;

  return (
    <li
      className={`run-timeline-item run-timeline-item--tool${running ? " is-active" : ""}${failed ? " is-error" : ""}`}
    >
      <div className="run-timeline-tool">
        <div className="run-timeline-tool-head">
          <span className={`run-timeline-label${running ? " run-timeline-label--shimmer" : ""}`}>
            <span className="run-timeline-tool-name">{t("chat.toolNames.updatePlan")}</span>
            {hint ? (
              <span className="run-timeline-tool-bit is-plan-progress">
                {t("chat.planUpdate.progress", {
                  done: String(hint.done),
                  total: String(hint.total),
                })}
              </span>
            ) : null}
            {shown.map((chip) => (
              <span
                key={chip.key}
                className={`run-timeline-tool-bit is-plan-change is-${chip.kind}`}
                title={chip.label}
              >
                <span className="run-timeline-plan-glyph" aria-hidden="true">
                  {GLYPH[chip.kind]}
                </span>
                {chip.label}
              </span>
            ))}
            {hidden > 0 ? (
              <span className="run-timeline-tool-bit is-plan-progress">
                {t("chat.planUpdate.more", { n: String(hidden) })}
              </span>
            ) : null}
            {!hint && !running ? (
              <span className="run-timeline-tool-bit is-err">{t("chat.toolFailed")}</span>
            ) : null}
          </span>
        </div>
      </div>
    </li>
  );
}
