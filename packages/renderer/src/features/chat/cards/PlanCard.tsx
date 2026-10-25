/**
 * 计划卡片：时间线内 `create_plan` 这次工具调用的呈现形态。
 * 工具标识 + 标题 + 描述 + 状态徽标 + 待办进度，只读；
 * 参数还在流式生成时按草稿态展示（进度条呼吸），全文经「查看计划」在右侧面板打开。
 */
import { Badge, Button, ChevronRightIcon, PlanModeIcon } from "@thinker-workbench/design/react";
import type { ChatPlan, ChatPlanStatus } from "@thinker-workbench/shared";
import type { MessageKey } from "../../../ui/i18n/translate";
import { useT } from "../../../ui/i18n/useI18n";
import "./PlanCard.less";

/** 计划状态 → 文案键。 */
const STATUS_KEY: Record<ChatPlanStatus, MessageKey> = {
  draft: "chat.plan.status.draft",
  ready: "chat.plan.status.ready",
  building: "chat.plan.status.building",
  done: "chat.plan.status.done",
};

/** 计划状态 → 徽标语气。 */
const STATUS_VARIANT: Record<ChatPlanStatus, "neutral" | "accent" | "success"> = {
  draft: "neutral",
  ready: "accent",
  building: "accent",
  done: "success",
};

type Props = {
  plan: ChatPlan;
  /** 参数仍在流式生成：卡片按草稿态渲染，暂不提供全文入口。 */
  drafting?: boolean;
  /** 在右侧面板以预览方式打开该计划。 */
  onOpen: () => void;
};

export function PlanCard({ plan, drafting = false, onOpen }: Props) {
  const t = useT();
  const total = plan.todos.length;
  const done = plan.todos.filter((todo) => todo.status === "done").length;
  const percent = total > 0 ? Math.round((done / total) * 100) : 0;
  // 标题由 create_plan 工具给出；草稿态还没吐出标题时给一句占位
  const title =
    plan.title?.trim() || (drafting ? t("chat.plan.drafting") : t("chat.plan.cardLabel"));
  const description = plan.description?.trim();
  const progressText =
    total > 0
      ? t("chat.plan.progress", { done: String(done), total: String(total) })
      : t("chat.plan.empty");

  return (
    <section
      className={`plan-card${drafting ? " is-drafting" : ""}`}
      aria-label={t("chat.toolNames.createPlan")}
    >
      <header className="plan-card__head">
        <span className="plan-card__kicker">
          <PlanModeIcon size="sm" />
          {t("chat.toolNames.createPlan")}
        </span>
        <Badge variant={drafting ? "neutral" : STATUS_VARIANT[plan.status]}>
          {drafting ? t("chat.plan.draftingBadge") : t(STATUS_KEY[plan.status])}
        </Badge>
      </header>

      <h4 className="plan-card__title">{title}</h4>
      {description ? <p className="plan-card__desc">{description}</p> : null}

      <div className="plan-card__progress">
        <span className="plan-card__bar" aria-hidden="true">
          <span className="plan-card__bar-fill" style={{ width: `${percent}%` }} />
        </span>
        <span className="plan-card__count">{progressText}</span>
      </div>

      <footer className="plan-card__foot">
        {drafting ? (
          <span className="plan-card__drafting">{t("chat.plan.drafting")}</span>
        ) : (
          <Button
            variant="text"
            size="sm"
            className="plan-card__view"
            endIcon={<ChevronRightIcon size="sm" />}
            onClick={onOpen}
          >
            {t("chat.plan.viewPlan")}
          </Button>
        )}
      </footer>
    </section>
  );
}
