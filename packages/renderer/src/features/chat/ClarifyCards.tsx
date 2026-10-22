/**
 * ask_user 时间线卡片：多道题同时展示。
 * 每题可选选项，最后一行是自定义回复；整组一次提交。
 */
import { Badge, Button, Input, RadioGroup } from "@thinker-workbench/design/react";
import type { ChatTimelineToolStep } from "@thinker-workbench/shared";
import { useEffect, useState } from "react";
import { respondHitl } from "../../bridge/thinker";
import { useT } from "../../i18n/useI18n";

type Props = {
  step: ChatTimelineToolStep;
};

type Draft = { optionId: string; text: string };

export function ClarifyCards({ step }: Props) {
  const t = useT();
  const clarify = step.clarify;
  const questions = (clarify?.questions ?? []).filter((q) => q.options.length >= 2);
  const settled = Boolean(clarify?.answers);
  const editable = Boolean(step.active && !settled);
  const [drafts, setDrafts] = useState<Record<string, Draft>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!clarify?.hitlId || settled) return;
    const el = document.getElementById(`clarify-${clarify.hitlId}`);
    el?.scrollIntoView({ block: "nearest" });
  }, [clarify?.hitlId, settled]);

  if (!clarify || questions.length === 0) return null;

  const answerFor = (id: string) => clarify.answers?.find((row) => row.id === id);

  function draftOf(id: string): Draft {
    return drafts[id] ?? { optionId: "", text: "" };
  }

  const ready = questions.every((q) => {
    const draft = draftOf(q.id);
    return Boolean(draft.optionId || draft.text.trim());
  });

  async function onSubmit() {
    if (!ready || busy || settled) return;
    setBusy(true);
    setError("");
    try {
      await respondHitl({
        hitlId: clarify.hitlId,
        actionId: "submit",
        values: {
          answers: questions.map((q) => {
            const draft = draftOf(q.id);
            return {
              id: q.id,
              ...(draft.optionId ? { optionId: draft.optionId } : {}),
              ...(draft.text.trim() ? { text: draft.text.trim() } : {}),
            };
          }),
        },
      });
    } catch {
      setBusy(false);
      setError(t("chat.clarifySubmitFailed"));
    }
  }

  return (
    <div
      className={`run-clarify${editable ? " is-awaiting" : ""}`}
      id={clarify.hitlId ? `clarify-${clarify.hitlId}` : undefined}
    >
      <div className="run-clarify__head">
        {editable ? (
          <Badge variant="accent" className="run-clarify__badge">
            {t("chat.shellAwaitingApproval")}
          </Badge>
        ) : null}
        <span className="run-clarify__title">{t("chat.clarifyTitle")}</span>
      </div>
      {questions.map((q, index) => {
        const saved = answerFor(q.id);
        const draft = draftOf(q.id);
        const savedOption = saved?.optionId
          ? q.options.find((opt) => opt.id === saved.optionId)?.label
          : "";
        return (
          <section key={q.id} className="run-clarify__q">
            <p className="run-clarify__prompt">
              {questions.length > 1 ? (
                <span className="run-clarify__index">{index + 1}</span>
              ) : null}
              {q.prompt}
            </p>
            {settled ? (
              <div className="run-clarify__settled">
                {savedOption ? <p className="run-clarify__answer">{savedOption}</p> : null}
                {saved?.text ? <p className="run-clarify__answer is-custom">{saved.text}</p> : null}
              </div>
            ) : editable ? (
              <>
                {q.options.length > 0 ? (
                  <RadioGroup
                    className="run-clarify__options"
                    name={`clarify-${clarify.hitlId}-${q.id}`}
                    aria-label={q.prompt}
                    value={draft.optionId}
                    disabled={busy}
                    options={q.options.map((opt) => ({ value: opt.id, label: opt.label }))}
                    onChange={(optionId) =>
                      setDrafts((prev) => ({ ...prev, [q.id]: { ...draftOf(q.id), optionId } }))
                    }
                  />
                ) : null}
                <Input
                  className="run-clarify__custom"
                  size="sm"
                  value={draft.text}
                  disabled={busy}
                  aria-label={t("chat.clarifyCustom")}
                  placeholder={t("chat.clarifyCustomPlaceholder")}
                  onChange={(e) =>
                    setDrafts((prev) => ({
                      ...prev,
                      [q.id]: { ...draftOf(q.id), text: e.target.value },
                    }))
                  }
                />
              </>
            ) : null}
          </section>
        );
      })}
      {editable ? (
        <div className="run-clarify__submit">
          {error ? <p className="run-clarify__error">{error}</p> : <span />}
          <Button variant="primary" size="sm" disabled={!ready || busy} onClick={() => void onSubmit()}>
            {t("chat.clarifyContinue")}
          </Button>
        </div>
      ) : null}
    </div>
  );
}
