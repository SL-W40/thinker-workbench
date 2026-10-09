/**
 * shell / shell_await 时间线卡片：命令、轻量状态、去 ANSI 输出、HITL、「打开终端」。
 * 输出默认 4 行，超出底部渐隐 + 居中下箭头展开。
 */
import { Badge, Button } from "@thinker-workbench/design/react";
import type { ChatTimelineToolStep } from "@thinker-workbench/shared";
import { useLayoutEffect, useRef, useState } from "react";
import { respondHitl } from "../../bridge/thinker";
import { useT } from "../../i18n/I18nProvider";
import { stripAnsi } from "./stripAnsi";

/** 折叠时可见行数。 */
const COLLAPSED_LINES = 4;

type Props = {
  step: ChatTimelineToolStep;
  onOpenTerminal?: (detail?: {
    sessionId?: string;
    previewOutput?: string;
    title?: string;
  }) => void;
};

type Translate = ReturnType<typeof useT>;

function actionLabel(t: Translate, id: string, fallback: string): string {
  if (id === "allow") return t("hitl.actions.allow");
  if (id === "deny") return t("hitl.actions.deny");
  if (id === "allow_and_whitelist") return t("hitl.actions.allowAndWhitelist");
  return fallback;
}

export function ShellCard({ step, onOpenTerminal }: Props) {
  const t = useT();
  const [busy, setBusy] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [overflows, setOverflows] = useState(false);
  const outputRef = useRef<HTMLPreElement>(null);

  const hitl = step.hitl;
  const awaiting = Boolean(hitl);
  const running = !awaiting && step.phase === "start" && step.active;
  const failed = step.phase === "end" && step.ok === false;
  const backgrounded = Boolean(step.backgrounded);
  const command = step.command?.trim() || step.summary?.trim() || step.name;
  const displayOut = stripAnsi(step.liveOutput ?? "").trim();
  // 仅挂起会话保留「打开终端」；一次跑完的会话已自动关闭
  const canOpenTerminal = Boolean(onOpenTerminal && backgrounded && step.sessionId);

  const hitlBody = hitl?.body?.trim() ?? "";
  const reviewNote =
    hitlBody &&
    command &&
    hitlBody.startsWith(command.slice(0, Math.min(command.length, 400)))
      ? hitlBody.slice(command.slice(0, 400).length).replace(/^\s*\n+/, "").trim()
      : hitlBody && hitlBody !== command
        ? hitlBody
        : "";

  useLayoutEffect(() => {
    const el = outputRef.current;
    if (!el) {
      setOverflows(false);
      return;
    }
    setOverflows(el.scrollHeight > el.clientHeight + 2);
  }, [displayOut, expanded]);

  const showMore = Boolean(displayOut) && (overflows || expanded);

  async function onHitlAction(actionId: string) {
    if (!hitl || busy) return;
    setBusy(true);
    try {
      await respondHitl({ hitlId: hitl.hitlId, actionId });
    } catch {
      setBusy(false);
    }
  }

  return (
    <div
      className={`run-shell-card${running ? " is-running" : ""}${failed ? " is-failed" : ""}${awaiting ? " is-awaiting" : ""}`}
    >
      <div className="run-shell-card__head">
        <span className="run-shell-card__tool" aria-hidden="true">
          $
        </span>
        <span className="run-shell-card__cmd">{command}</span>
        {awaiting ? (
          <Badge variant="accent" className="run-shell-card__badge">
            {t("chat.shellAwaitingApproval")}
          </Badge>
        ) : running ? (
          <span className="run-shell-card__status">{t("chat.toolRunning")}</span>
        ) : backgrounded ? (
          <span className="run-shell-card__status">{t("chat.shellBackgrounded")}</span>
        ) : failed ? (
          <span className="run-shell-card__status is-err">{t("chat.toolFailed")}</span>
        ) : null}
        {canOpenTerminal ? (
          <Button
            variant="text"
            size="sm"
            className="run-shell-card__term"
            onClick={() =>
              onOpenTerminal?.({
                sessionId: step.sessionId,
                title: command,
              })
            }
          >
            {t("chat.openTerminal")}
          </Button>
        ) : null}
      </div>

      {awaiting && hitl ? (
        <div className="run-shell-card__hitl">
          {reviewNote ? <p className="run-shell-card__note">{reviewNote}</p> : null}
          <div className="run-shell-card__actions">
            {hitl.actions.map((action) => (
              <Button
                key={action.id}
                size="sm"
                variant={
                  action.style === "danger"
                    ? "danger"
                    : action.style === "primary"
                      ? "primary"
                      : action.style === "ghost"
                        ? "ghost"
                        : "secondary"
                }
                disabled={busy}
                onClick={() => void onHitlAction(action.id)}
              >
                {actionLabel(t, action.id, action.label)}
              </Button>
            ))}
          </div>
        </div>
      ) : null}

      {displayOut ? (
        <div
          className={`run-shell-card__body${expanded ? " is-expanded" : " is-collapsed"}`}
        >
          <pre
            ref={outputRef}
            className="run-shell-card__output"
            style={{ ["--shell-collapsed-lines" as string]: String(COLLAPSED_LINES) }}
          >
            {displayOut}
          </pre>
          {showMore ? (
            <button
              type="button"
              className={`run-shell-card__fade${expanded ? " is-expanded" : ""}`}
              aria-expanded={expanded}
              aria-label={expanded ? t("chat.shellCollapse") : t("chat.shellExpand")}
              onClick={() => setExpanded((v) => !v)}
            >
              <span
                className={`run-shell-card__arrow${expanded ? " is-up" : ""}`}
                aria-hidden="true"
              />
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
