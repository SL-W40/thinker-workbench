/**
 * 子代理 Task 卡片：三点加载 + 底部活动文案 swiper；点击在右侧 inspector 打开时间线。
 */
import type { ChatTimelineSubagentStep } from "@thinker-workbench/shared";
import { useEffect } from "react";
import { requestOpenSubagent, syncSubagentStep } from "../../bridge/subagent";
import { useT } from "../../i18n/useI18n";
import { SubagentLiveSwiper } from "./SubagentLiveSwiper";
import { subagentDisplayTitle } from "./subagentTitle";

type Props = {
  step: ChatTimelineSubagentStep;
};

/** 卡片底栏：思考中后接实时正文*/
function formatFootLive(t: ReturnType<typeof useT>, raw: string): string {
  const s = raw.trim();
  if (!s || s === "Starting…") return t("chat.subagent.liveStarting");
  if (s === "Thinking…") return t("chat.subagent.liveThinking");
  if (s.startsWith("Thinking…")) {
    const rest = s.slice("Thinking…".length).trim();
    return rest
      ? `${t("chat.subagent.liveThinking")} ${rest}`
      : t("chat.subagent.liveThinking");
  }
  return s;
}

export function SubagentCard({ step }: Props) {
  const t = useT();
  const running = step.phase === "started" || step.phase === "progress";
  const failed = step.phase === "failed" || step.phase === "cancelled";
  const done = step.phase === "finished";
  const phaseKey = `chat.subagent.phase.${step.phase}` as const;

  // 右侧 tab 已打开时同步最新进
  useEffect(() => {
    syncSubagentStep(step);
  }, [step]);

  const displayTitle = subagentDisplayTitle(step);
  const typeName =
    !step.subagent.trim() || step.subagent === "…"
      ? null
      : step.subagent;

  const liveText = running ? formatFootLive(t, step.liveLine ?? "") : "";
  const settledFoot = !running
    ? step.phase === "cancelled"
      ? t("chat.subagent.cancelledLive")
      : failed
        ? (step.error || step.summary || t("chat.subagent.phase.failed")).trim()
        : (step.summary || "").trim()
    : "";

  return (
    <button
      type="button"
      className={`run-subagent-card${running ? " is-running" : ""}${failed ? " is-failed" : ""}${done ? " is-done" : ""}`}
      onClick={() => requestOpenSubagent(step)}
      aria-label={t("chat.subagent.openTimeline", { name: displayTitle })}
    >
      <div className="run-subagent-card__head">
        {running ? (
          <span className="run-subagent-card__dots" aria-hidden>
            <i />
            <i />
            <i />
          </span>
        ) : (
          <span
            className={`run-subagent-card__mark${failed ? " is-err" : ""}${done ? " is-ok" : ""}`}
            aria-hidden
          />
        )}
        <div className="run-subagent-card__titles">
          <span className="run-subagent-card__kicker">{t("chat.subagent.cardTitle")}</span>
          <span className="run-subagent-card__name" title={displayTitle}>
            {displayTitle}
          </span>
        </div>
        <div className="run-subagent-card__meta">
          {typeName ? (
            <span className="run-subagent-card__chip">{typeName}</span>
          ) : null}
          {step.background && running ? (
            <span className="run-subagent-card__chip">{t("chat.subagent.background")}</span>
          ) : null}
          <span
            className={`run-subagent-card__phase${running ? " is-live" : ""}${failed ? " is-err" : ""}`}
          >
            {t(phaseKey)}
          </span>
        </div>
      </div>
      {running && liveText ? (
        <div className="run-subagent-card__foot">
          <SubagentLiveSwiper text={liveText} />
        </div>
      ) : settledFoot ? (
        <div className="run-subagent-card__foot">
          <span className="run-subagent-card__settled">{settledFoot}</span>
        </div>
      ) : null}
    </button>
  );
}
