/**
 * 子代理 / 错误步骤行。
 */
import { Button, Kbd } from "@thinker-workbench/design/react";
import type { ChatTimelineStep } from "@thinker-workbench/shared";
import { useT } from "../../../../i18n/useI18n";
import { classifyRunError, isSoftStopCode } from "../../runErrors";
import { SubagentCard } from "../../SubagentCard";
import { isMissingApiKeyError } from "../../systemErrors";

/** 子代理 Task 生命周期行。*/
export function SubagentStepRow({
  step,
}: {
  step: Extract<ChatTimelineStep, { kind: "subagent" }>;
}) {
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
export function ErrorStepRow({
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
