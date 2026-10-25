/**
 * ask_user 时间线卡片：一次只呈现一道题的轮播。
 * 答完当前题可「下一步」，也可回「上一步」改答案；选答题（required=false）可直接跳过。
 * 全部必答题都有答案后才能提交，提交后卡片转为只读的问答摘要。
 */
import { Badge, Button, Input, RadioGroup } from "@thinker-workbench/design/react";
import type { ChatTimelineToolStep } from "@thinker-workbench/shared";
import { useEffect, useState } from "react";
import { respondHitl } from "../../../platform/ipc/thinker";
import { useT } from "../../../ui/i18n/useI18n";

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
  const [index, setIndex] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!clarify?.hitlId || settled) return;
    const el = document.getElementById(`clarify-${clarify.hitlId}`);
    el?.scrollIntoView({ block: "nearest" });
  }, [clarify?.hitlId, settled]);

  if (!clarify || questions.length === 0) return null;

  const total = questions.length;
  const current = Math.min(index, total - 1);
  const question = questions[current];
  if (!question) return null;

  const answerFor = (id: string) => clarify.answers?.find((row) => row.id === id);

  function draftOf(id: string): Draft {
    return drafts[id] ?? { optionId: "", text: "" };
  }

  /** 某题是否已有答案（选中选项或写了自定义回复）。 */
  function answered(id: string): boolean {
    const draft = draftOf(id);
    return Boolean(draft.optionId || draft.text.trim());
  }

  const isOptional = question.required === false;
  const currentAnswered = answered(question.id);
  const isLast = current === total - 1;
  // 必答题都答完才能提交
  const ready = questions.every((q) => q.required === false || answered(q.id));

  function setDraft(id: string, patch: Partial<Draft>) {
    setDrafts((prev) => ({ ...prev, [id]: { ...draftOf(id), ...patch } }));
  }

  async function submit() {
    if (!clarify || !ready || busy || settled) return;
    setBusy(true);
    setError("");
    try {
      await respondHitl({
        hitlId: clarify.hitlId,
        actionId: "submit",
        values: {
          // 只回传作答的题：选答题被跳过时不占一行
          answers: questions
            .filter((q) => answered(q.id))
            .map((q) => {
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

  function goPrev() {
    if (current > 0) setIndex(current - 1);
  }

  function goNext() {
    if (isLast) {
      void submit();
      return;
    }
    setIndex(current + 1);
  }

  /** 跳过当前选答题：已是最后一题则直接提交。 */
  function skip() {
    setDrafts((prev) => ({ ...prev, [question.id]: { optionId: "", text: "" } }));
    if (isLast) {
      void submit();
      return;
    }
    setIndex(current + 1);
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

      {settled ? (
        <div className="run-clarify__summary">
          {questions.map((q) => {
            const saved = answerFor(q.id);
            const savedOption = saved?.optionId
              ? q.options.find((opt) => opt.id === saved.optionId)?.label
              : "";
            const answer = saved?.text?.trim() || savedOption;
            if (!answer) return null;
            return (
              <div key={q.id} className="run-clarify__row">
                <p className="run-clarify__row-prompt">{q.prompt}</p>
                <p className="run-clarify__answer">{answer}</p>
              </div>
            );
          })}
        </div>
      ) : editable ? (
        <>
          {/* 单题且必答时没有可翻页的信息，省略进度条 */}
          {total > 1 || isOptional ? (
            <div className="run-clarify__pager">
              {total > 1 ? (
                <span className="run-clarify__step">
                  {t("chat.clarifyStep", { current: String(current + 1), total: String(total) })}
                </span>
              ) : null}
              {isOptional ? <Badge variant="neutral">{t("chat.clarifyOptional")}</Badge> : null}
              {total > 1 ? (
                <span className="run-clarify__dots" aria-hidden="true">
                  {questions.map((q, i) => (
                    <span
                      key={q.id}
                      className={`run-clarify__dot${i === current ? " is-current" : ""}${
                        answered(q.id) ? " is-answered" : ""
                      }`}
                    />
                  ))}
                </span>
              ) : null}
            </div>
          ) : null}

          <section className="run-clarify__q">
            <p className="run-clarify__prompt">{question.prompt}</p>
            {question.options.length > 0 ? (
              <RadioGroup
                className="run-clarify__options"
                name={`clarify-${clarify.hitlId}-${question.id}`}
                aria-label={question.prompt}
                value={draftOf(question.id).optionId}
                disabled={busy}
                options={question.options.map((opt) => ({ value: opt.id, label: opt.label }))}
                onChange={(optionId) => setDraft(question.id, { optionId })}
              />
            ) : null}
            <Input
              className="run-clarify__custom"
              size="sm"
              value={draftOf(question.id).text}
              disabled={busy}
              aria-label={t("chat.clarifyCustom")}
              placeholder={t("chat.clarifyCustomPlaceholder")}
              onChange={(e) => setDraft(question.id, { text: e.target.value })}
            />
          </section>

          <div className="run-clarify__nav">
            {error ? <p className="run-clarify__error">{error}</p> : <span />}
            <span className="run-clarify__actions">
              {/* 上一步与下一步同侧成组：单题时不出现 */}
              {total > 1 ? (
                <Button variant="ghost" size="sm" disabled={current === 0 || busy} onClick={goPrev}>
                  {t("chat.clarifyPrev")}
                </Button>
              ) : null}
              {isOptional && !isLast ? (
                <Button variant="text" size="sm" disabled={busy} onClick={skip}>
                  {t("chat.clarifySkip")}
                </Button>
              ) : null}
              {isLast ? (
                <Button
                  variant="primary"
                  size="sm"
                  disabled={!ready || busy}
                  onClick={() => void submit()}
                >
                  {t("chat.clarifyContinue")}
                </Button>
              ) : (
                <Button
                  variant="primary"
                  size="sm"
                  disabled={!currentAnswered || busy}
                  onClick={goNext}
                >
                  {t("chat.clarifyNext")}
                </Button>
              )}
            </span>
          </div>
        </>
      ) : null}
    </div>
  );
}
