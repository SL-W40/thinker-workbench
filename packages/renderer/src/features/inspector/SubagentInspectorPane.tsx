/**
 * 右侧 inspector：子代理时间线 tab（头部固定，正文可滚、贴底跟随）。
 */
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { getSubagentStep, subscribeSubagentSteps } from "../../bridge/subagent";
import { useT } from "../../i18n/useI18n";
import { SubagentSessionView } from "../chat/SubagentSessionView";
import { subagentDisplayTitle } from "../chat/subagentTitle";
import { useStickToBottomScroll } from "../chat/useStickToBottomScroll";

type Props = {
  taskId: string;
  subagent: string;
  /** 点击探索路径时打开 Files。*/
  onOpenFile?: (path: string) => void;
};

export function SubagentInspectorPane({ taskId, subagent, onOpenFile }: Props) {
  const t = useT();
  const bodyRef = useRef<HTMLDivElement | null>(null);
  const contentRef = useRef<HTMLDivElement | null>(null);
  const [stickNonce, setStickNonce] = useState(0);
  const step = useSyncExternalStore(
    subscribeSubagentSteps,
    () => getSubagentStep(taskId),
    () => null,
  );

  // 打开 / 切换 Task tab 时强制贴底
  useEffect(() => {
    setStickNonce((n) => n + 1);
  }, [taskId]);

  const timelineLen = step?.childTimeline?.length ?? 0;
  const followKey = `${taskId}:${step?.phase ?? ""}:${timelineLen}:${step?.summary ?? ""}:${step?.liveLine ?? ""}`;
  useStickToBottomScroll({
    scrollerRef: bodyRef,
    contentRef,
    followKey,
    stickNonce,
    enabled: Boolean(step),
  });

  const title = step
    ? subagentDisplayTitle(step)
    : subagentDisplayTitle({ subagent, title: undefined });
  const typeName = (() => {
    const raw = (step?.subagent || subagent).trim();
    if (!raw || raw === "…") return null;
    return raw;
  })();
  const phaseKey = step ? (`chat.subagent.phase.${step.phase}` as const) : null;

  return (
    <div className="agent-subagent-pane">
      <header className="agent-subagent-pane__header">
        <h2 className="agent-subagent-pane__title" title={title}>
          {title}
        </h2>
        <p className="agent-subagent-pane__meta">
          {typeName ? <span>{t("chat.subagent.typeChip", { name: typeName })}</span> : null}
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
      <div className="agent-subagent-pane__body" ref={bodyRef}>
        {step ? (
          <div ref={contentRef}>
            <SubagentSessionView step={step} onOpenFile={onOpenFile} />
          </div>
        ) : (
          <p className="agent-subagent-pane__empty">{t("chat.subagent.timelineEmpty")}</p>
        )}
      </div>
    </div>
  );
}
