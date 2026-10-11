/**
 * 子代理时间线：与主会话同一套 RunTimeline 渲染。 */
import { useDesignTheme } from "@thinker-workbench/design/react";
import { StreamingMarkdownView } from "@thinker-workbench/markdown/react";
import type { ChatTimelineSubagentStep } from "@thinker-workbench/shared";
import { useT } from "../../i18n/useI18n";
import { RunTimeline } from "./RunTimeline";

type Props = {
  step: ChatTimelineSubagentStep;
 /** 探索路径点击时打开 Files（由右侧 inspector 传入）*/
  onOpenFile?: (path: string) => void;
};

export function SubagentSessionView({ step, onOpenFile }: Props) {
  const t = useT();
  const { markdownTheme } = useDesignTheme();
  const running = step.phase === "started" || step.phase === "progress";
  const timeline = step.childTimeline ?? [];
  const summary =
    step.phase === "cancelled"
      ? t("chat.subagent.cancelledLive")
      : (step.error || step.summary || "").trim();
  const showSummary = Boolean(summary) && !running;

  return (
    <ol className="thread" aria-label={t("chat.subagent.sessionAria")}>
      <li className={`bubble role-assistant${running ? " pending" : ""}`}>
        <div className="bubble-main">
          {timeline.length > 0 ? (
            <RunTimeline steps={timeline} live={running} onOpenFile={onOpenFile} />
          ) : (
            <p className="subagent-session__empty">{t("chat.subagent.timelineEmpty")}</p>
          )}
          {showSummary ? (
            <div className="bubble-body">
              <StreamingMarkdownView
                markdown={summary}
                theme={markdownTheme}
                streaming={false}
              />
            </div>
          ) : null}
        </div>
      </li>
    </ol>
  );
}
