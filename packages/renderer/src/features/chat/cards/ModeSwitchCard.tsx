/**
 * 模式切换卡片：时间线内 `request_mode_switch` 这次调用的呈现形态。
 *
 * 模型只能「请求」切换，改不改由用户决定 —— 卡片给「保持 / 切换」两个按钮，
 * 点完转成一句只读结论。真正的落盘在主进程 HITL 答复收口处，本 run 内由引擎立即生效。
 */
import { Button, CheckIcon } from "@thinker-workbench/design/react";
import type { ChatTimelineToolStep } from "@thinker-workbench/shared";
import { useState } from "react";
import { respondHitl } from "../../../platform/ipc/thinker";
import { useT } from "../../../ui/i18n/useI18n";
import { MODE_LABEL_KEY } from "../pickers/modeLabels";
import "./ModeSwitchCard.less";

type Props = {
  step: ChatTimelineToolStep;
};

export function ModeSwitchCard({ step }: Props) {
  const t = useT();
  const modeSwitch = step.modeSwitch;
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  if (!modeSwitch) return null;

  const toLabel = t(MODE_LABEL_KEY[modeSwitch.targetMode]);
  const fromLabel = t(MODE_LABEL_KEY[modeSwitch.currentMode]);
  // 只有 switch / stay 是用户的真实选择；中断（deny）按「未选择」展示
  const resolved =
    modeSwitch.resolvedAction === "switch" || modeSwitch.resolvedAction === "stay"
      ? modeSwitch.resolvedAction
      : undefined;
  const switched = resolved === "switch";
  const pending = Boolean(step.hitl) && step.active && !resolved;
  const title = switched
    ? t("chat.modeSwitch.titleSwitched", { mode: toLabel })
    : resolved === "stay"
      ? t("chat.modeSwitch.titleStayed", { mode: fromLabel })
      : pending
        ? t("chat.modeSwitch.titleAsk", { mode: toLabel })
        : t("chat.modeSwitch.title");

  async function answer(actionId: string) {
    if (!modeSwitch || busy || !pending) return;
    setBusy(true);
    setError("");
    try {
      await respondHitl({ hitlId: modeSwitch.hitlId, actionId });
    } catch {
      setBusy(false);
      setError(t("chat.modeSwitch.failed"));
    }
  }

  return (
    <section className={`mode-switch${pending ? " is-pending" : " is-done"}`} aria-label={title}>
      <div className="mode-switch__head">
        <span className="mode-switch__title">
          {resolved && switched ? (
            <span className="mode-switch__check">
              <CheckIcon size="sm" />
            </span>
          ) : null}
          {title}
        </span>
        {resolved ? null : (
          <span className="mode-switch__path">
            {fromLabel} <span aria-hidden="true">→</span> {toLabel}
          </span>
        )}
      </div>

      <p className="mode-switch__body">
        {modeSwitch.reason || t("chat.modeSwitch.body", { from: fromLabel, to: toLabel })}
      </p>

      {pending ? (
        <div className="mode-switch__actions">
          {error ? <p className="mode-switch__error">{error}</p> : null}
          <span className="mode-switch__buttons">
            <Button
              variant="secondary"
              size="sm"
              disabled={busy}
              onClick={() => void answer("stay")}
            >
              {t("chat.modeSwitch.stayIn", { mode: fromLabel })}
            </Button>
            <Button variant="primary" size="sm" busy={busy} onClick={() => void answer("switch")}>
              {t("chat.modeSwitch.switchTo", { mode: toLabel })}
            </Button>
          </span>
        </div>
      ) : null}
    </section>
  );
}
