/**
 * 右侧 inspector：子代理时间?tab（头部固定，正文可滚、无横向滚动）。 */
import { useSyncExternalStore } from "react";
import {
  getSubagentStep,
  subscribeSubagentSteps,
} from "../../bridge/subagent";
import { useT } from "../../i18n/useI18n";
import { SubagentSessionView } from "../chat/SubagentSessionView";
import { subagentDisplayTitle } from "../chat/subagentTitle";

type Props = {
  taskId: string;
  subagent: string;
  /** 点击探索路径时打开 Files。*/
  onOpenFile?: (path: string) => void;
};

export function SubagentInspectorPane({ taskId, subagent, onOpenFile }: Props) {
  const t = useT();
  const step = useSyncExternalStore(
    subscribeSubagentSteps,
    () => getSubagentStep(taskId),
    () => null,
  );

  const title = step
    ? subagentDisplayTitle(step)
    : subagentDisplayTitle({ subagent, title: undefined });
  const typeName = (() => {
    const raw = (step?.subagent || subagent).trim();
    if (!raw || raw === "…") return null;
    return raw;
  })();
  const phaseKey = step
    ? (`chat.subagent.phase.${step.phase}` as const)
    : null;

  return (
    <div className="agent-subagent-pane">
      <header className="agent-subagent-pane__header">
        <h2 className="agent-subagent-pane__title" title={title}>
          {title}
        </h2>
        <p className="agent-subagent-pane__meta">
          {typeName ? (
            <span>{t("chat.subagent.typeChip", { name: typeName })}</span>
          ) : null}
          {phaseKey ? (
            <>
              {typeName ? (
                <span className="agent-subagent-pane__sep" aria-hidden>
                  ·
                </span>
              ) : null}
              <span>{t(phaseKey)}</span>
            </>
          ) : null}
          {step?.background ? (
            <>
              <span className="agent-subagent-pane__sep" aria-hidden>
                ·
              </span>
              <span>{t("chat.subagent.background")}</span>
            </>
          ) : null}
        </p>
      </header>
      <div className="agent-subagent-pane__body">
        {step ? (
          <SubagentSessionView step={step} onOpenFile={onOpenFile} />
        ) : (
          <p className="agent-subagent-pane__empty">
            {t("chat.subagent.timelineEmpty")}
          </p>
        )}
      </div>
    </div>
  );
}
