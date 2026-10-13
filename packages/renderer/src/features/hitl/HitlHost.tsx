/**
 * HITL 宿主：非 shell_approval 类介入弹 Modal（含密钥密码框）。
 */
import { Button, Input, Modal } from "@thinker-workbench/design/react";
import type { HitlRequest } from "@thinker-workbench/shared";
import { useEffect, useId, useState } from "react";
import { onAgentEvent, respondHitl } from "../../bridge/thinker";
import { useT } from "../../i18n/useI18n";
import "./HitlHost.less";

/** 走时间线卡片的 HITL，不进 Modal。 */
function isTimelineHitl(kind: string): boolean {
  return kind === "shell_approval" || kind === "shell_write_approval";
}

export function HitlHost() {
  const t = useT();
  const titleId = useId();
  const [pending, setPending] = useState<HitlRequest | null>(null);
  const [busy, setBusy] = useState(false);
  const [secret, setSecret] = useState("");

  useEffect(() => {
    return onAgentEvent((event) => {
      if (event.type !== "hitl") return;
      if (event.phase === "resolved") {
        setPending((cur) => (cur?.hitlId === event.hitlId ? null : cur));
        setBusy(false);
        setSecret("");
        return;
      }
      if (event.phase === "request" && event.request) {
        if (isTimelineHitl(event.request.kind)) {
          setPending((cur) => (cur?.hitlId === event.request?.hitlId ? null : cur));
          return;
        }
        setPending(event.request);
        setBusy(false);
        setSecret("");
      }
    });
  }, []);

  async function onAction(actionId: string) {
    if (!pending || busy) return;
    setBusy(true);
    try {
      const values =
        pending.kind === "shell_secret_input" && actionId === "submit" ? { secret } : undefined;
      await respondHitl({ hitlId: pending.hitlId, actionId, values });
      setPending(null);
      setSecret("");
    } catch {
      setBusy(false);
    }
  }

  const open = Boolean(pending);
  const body = pending?.body?.trim() ?? "";
  const isSecret = pending?.kind === "shell_secret_input";

  return (
    <Modal open={open} aria-labelledby={titleId} panelClassName="hitl-host__panel">
      {pending ? (
        <div className="hitl-host">
          <h2 id={titleId} className="hitl-host__title">
            {pending.title}
          </h2>
          {body ? <p className="hitl-host__body">{body}</p> : null}
          {isSecret ? (
            <Input
              type="password"
              size="sm"
              className="hitl-host__secret"
              value={secret}
              autoFocus
              placeholder={t("hitl.secretPlaceholder")}
              onChange={(e) => setSecret(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && secret) void onAction("submit");
              }}
            />
          ) : null}
          <div className="hitl-host__actions">
            {pending.actions.map((action) => (
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
                disabled={busy || (isSecret && action.id === "submit" && !secret.trim())}
                onClick={() => void onAction(action.id)}
              >
                {actionLabel(t, action.id, action.label)}
              </Button>
            ))}
          </div>
        </div>
      ) : null}
    </Modal>
  );
}

type Translate = ReturnType<typeof useT>;

function actionLabel(t: Translate, id: string, fallback: string): string {
  if (id === "allow") return t("hitl.actions.allow");
  if (id === "deny") return t("hitl.actions.deny");
  if (id === "allow_and_whitelist") return t("hitl.actions.allowAndWhitelist");
  if (id === "submit") return t("hitl.actions.submit");
  return fallback;
}
