/**
 * HITL 宿主：非 shell 类介入弹 Modal。
 * shell_approval 已内嵌到时间线 ShellCard，此处跳过以免重复。
 */
import { Button, Modal } from "@thinker-workbench/design/react";
import type { HitlRequest } from "@thinker-workbench/shared";
import { useEffect, useId, useState } from "react";
import { onAgentEvent, respondHitl } from "../../bridge/thinker";
import { useT } from "../../i18n/I18nProvider";
import "./HitlHost.less";

export function HitlHost() {
  const t = useT();
  const titleId = useId();
  const [pending, setPending] = useState<HitlRequest | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    return onAgentEvent((event) => {
      if (event.type !== "hitl") return;
      if (event.phase === "resolved") {
        setPending((cur) => (cur?.hitlId === event.hitlId ? null : cur));
        setBusy(false);
        return;
      }
      if (event.phase === "request" && event.request) {
        // shell 审批走时间线卡片
        if (event.request.kind === "shell_approval") {
          setPending((cur) => (cur?.hitlId === event.request!.hitlId ? null : cur));
          return;
        }
        setPending(event.request);
        setBusy(false);
      }
    });
  }, []);

  async function onAction(actionId: string) {
    if (!pending || busy) return;
    setBusy(true);
    try {
      await respondHitl({ hitlId: pending.hitlId, actionId });
      setPending(null);
    } catch {
      setBusy(false);
    }
  }

  const open = Boolean(pending);
  const body = pending?.body?.trim() ?? "";

  return (
    <Modal
      open={open}
      aria-labelledby={titleId}
      panelClassName="hitl-host__panel"
    >
      {pending ? (
        <div className="hitl-host">
          <h2 id={titleId} className="hitl-host__title">
            {pending.title}
          </h2>
          {body ? <p className="hitl-host__body">{body}</p> : null}
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
                disabled={busy}
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
  return fallback;
}
