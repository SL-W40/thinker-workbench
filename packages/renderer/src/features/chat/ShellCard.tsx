/**
 * shell / shell_await 时间线卡片：命令、轻量状态、去 ANSI 输出、HITL、「打开终端」。
 * 输出默认折叠，底部恒有渐隐 + 居中箭头展开/收起（短输出也不例外，观感一致）。
 */
import { Badge, Button } from "@thinker-workbench/design/react";
import {
  type ChatTimelineToolStep,
  type GeneralSettings,
  shellCommandsToAllowlist,
  stripAnsi,
} from "@thinker-workbench/shared";
import { useEffect, useRef, useState } from "react";
import { GENERAL_SETTINGS_CHANGED, getGeneralSettings, respondHitl } from "../../bridge/thinker";
import { useT } from "../../i18n/useI18n";
import { formatShellPurpose } from "./explainShellCommand";
import { SHELL_COLLAPSED_LINES } from "./shellOutputOverflow";

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
  const cardRef = useRef<HTMLDivElement>(null);

  const hitl = step.hitl;
  const awaiting = Boolean(hitl);
  const running = !awaiting && step.phase === "start" && step.active;
  const failed = step.phase === "end" && step.ok === false;
  const backgrounded = Boolean(step.backgrounded);
  const command = step.command?.trim() || step.summary?.trim() || step.name;
  const displayOut = stripAnsi(step.liveOutput ?? "").trim();
  // still_running / 后台会话可打开终端；complete 后会话会回收
  const canOpenTerminal = Boolean(onOpenTerminal && backgrounded && step.sessionId);

  const hitlBody = hitl?.body?.trim() ?? "";
  const writeParent = hitl?.parentCommand?.trim() ?? "";
  const writePreview = hitl?.dataPreview ?? "";
  const isWriteApproval = Boolean(awaiting && (writeParent || writePreview));
  const purpose = isWriteApproval
    ? ""
    : hitl?.purpose?.trim() ||
      (hitlBody && command && hitlBody.startsWith(command.slice(0, Math.min(command.length, 400)))
        ? hitlBody
            .slice(command.slice(0, 400).length)
            .replace(/^\s*\n+/, "")
            .replace(/^\(|\)$/g, "")
            .trim()
        : hitlBody && hitlBody !== command
          ? hitlBody
          : "");

  // 折叠态恒显渐隐与展开箭头（含未达折叠上限的短输出）；展开态同一按钮用于收起
  const showMore = Boolean(displayOut);

  // 审批卡出现时滚进视野，避免停在气泡上方、用户只看到「执行中」。
  // biome-ignore lint/correctness/useExhaustiveDependencies: hitl?.hitlId 未在函数体读取但刻意保留：新的审批卡出现时需要重新滚动
  useEffect(() => {
    if (!awaiting) return;
    cardRef.current?.scrollIntoView({ block: "nearest" });
  }, [awaiting, hitl?.hitlId]);

  const [shellLists, setShellLists] = useState<{
    allow: string[];
    block: string[];
  } | null>(null);
  useEffect(() => {
    if (!awaiting) return;
    let cancelled = false;
    const apply = (general: GeneralSettings) => {
      if (!cancelled) {
        setShellLists({ allow: general.shellAllowlist, block: general.shellBlocklist });
      }
    };
    void getGeneralSettings()
      .then(apply)
      .catch(() => {});
    const onChanged = (event: Event) => {
      const saved = (event as CustomEvent<GeneralSettings>).detail;
      if (saved) apply(saved);
    };
    window.addEventListener(GENERAL_SETTINGS_CHANGED, onChanged);
    return () => {
      cancelled = true;
      window.removeEventListener(GENERAL_SETTINGS_CHANGED, onChanged);
    };
  }, [awaiting]);

  const whitelistTokens = shellCommandsToAllowlist(
    command,
    shellLists?.allow ?? [],
    shellLists?.block ?? [],
  );

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
      ref={cardRef}
      className={`run-shell-card${running ? " is-running" : ""}${failed ? " is-failed" : ""}${awaiting ? " is-awaiting" : ""}`}
    >
      <div className="run-shell-card__head">
        {awaiting ? (
          <Badge variant="accent" className="run-shell-card__badge">
            {t("chat.shellAwaitingApproval")}
          </Badge>
        ) : (
          <span className="run-shell-card__tool" aria-hidden="true">
            $
          </span>
        )}
        <span className="run-shell-card__cmd">
          {awaiting
            ? isWriteApproval
              ? t("chat.shellWriteIntoCommand")
              : t("hitl.shellApproval.title")
            : command}
        </span>
        {awaiting ? null : running ? (
          <span className="run-shell-card__status">{t("chat.toolRunning")}</span>
        ) : backgrounded ? (
          <span className="run-shell-card__status">{t("chat.shellBackgrounded")}</span>
        ) : failed ? (
          <span className="run-shell-card__status is-err">{t("chat.toolFailed")}</span>
        ) : null}
        {canOpenTerminal && !awaiting ? (
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
          {isWriteApproval ? (
            <div className="run-shell-card__write-ctx">
              {writeParent ? (
                <>
                  <p className="run-shell-card__note">{t("chat.shellWriteIntoCommand")}</p>
                  <pre className="run-shell-card__write-cmd">{writeParent}</pre>
                </>
              ) : null}
              <p className="run-shell-card__note">{t("chat.shellWriteWillSend")}</p>
              <pre className="run-shell-card__write-data">{writePreview || "(empty)"}</pre>
            </div>
          ) : (
            <>
              <p className="run-shell-card__note">{formatShellPurpose(command, t) || purpose}</p>
              <p className="run-shell-card__label">{t("chat.shellApprovalCommand")}</p>
              <pre className="run-shell-card__write-cmd">{command}</pre>
            </>
          )}
        </div>
      ) : null}

      {displayOut ? (
        <div className={`run-shell-card__body${expanded ? " is-expanded" : " is-collapsed"}`}>
          <pre
            className="run-shell-card__output"
            style={{ ["--shell-collapsed-lines" as string]: String(SHELL_COLLAPSED_LINES) }}
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

      {awaiting && hitl ? (
        <div className="run-shell-card__actions">
          {hitl.actions.map((action) => {
            const variant =
              action.style === "danger"
                ? "danger"
                : action.style === "primary"
                  ? "primary"
                  : action.style === "ghost"
                    ? "ghost"
                    : "secondary";
            if (action.id !== "allow_and_whitelist") {
              return (
                <Button
                  key={action.id}
                  size="sm"
                  variant={variant}
                  disabled={busy}
                  onClick={() => void onHitlAction(action.id)}
                >
                  {actionLabel(t, action.id, action.label)}
                </Button>
              );
            }
            const nativeTitle =
              whitelistTokens.length > 0
                ? `${t("hitl.whitelistTipLead")}: ${whitelistTokens.join(", ")}`
                : t("hitl.whitelistEmpty");
            return (
              <span key={action.id} className="run-shell-card__tip">
                <Button
                  size="sm"
                  variant={variant}
                  disabled={busy}
                  title={nativeTitle}
                  onClick={() => void onHitlAction(action.id)}
                >
                  {actionLabel(t, action.id, action.label)}
                </Button>
                <span className="run-shell-card__tip-bubble" role="tooltip">
                  <span className="run-shell-card__tip-lead">
                    {whitelistTokens.length > 0
                      ? t("hitl.whitelistTipLead")
                      : t("hitl.whitelistEmpty")}
                  </span>
                  {whitelistTokens.length > 0 ? (
                    <ul className="run-shell-card__tip-list">
                      {whitelistTokens.map((token) => (
                        <li key={token}>
                          <code>{token}</code>
                        </li>
                      ))}
                    </ul>
                  ) : null}
                </span>
              </span>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}
