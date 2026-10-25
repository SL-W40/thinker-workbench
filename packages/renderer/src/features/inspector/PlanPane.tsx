/**
 * 右侧面板的计划文档预览：标题 + 正文 + 底部只读待办。
 * 虚拟文档——内容取自会话活跃计划，不落用户工作空间。
 *
 * 标题是结构化字段（`plan.title`），正文 markdown 里刻意不重复写，
 * 所以这里必须自己渲染，否则文档看起来「没有标题」。
 */
import { useDesignTheme } from "@thinker-workbench/design/react";
import { MarkdownView } from "@thinker-workbench/markdown/react";
import type { ChatPlan } from "@thinker-workbench/shared";
import { useT } from "../../ui/i18n/useI18n";
import { TodoList } from "../chat";
import "./PlanPane.less";

/** 计划文档预览（plan.md 正文 + 底部待办，与会话待办同一套展示）。 */
export function PlanPane({ plan, running = false }: { plan: ChatPlan | null; running?: boolean }) {
  const t = useT();
  const { markdownTheme } = useDesignTheme();
  if (!plan) {
    return <div className="plan-pane plan-pane--empty">{t("inspector.plan.empty")}</div>;
  }
  return (
    <div className="plan-pane">
      <header className="plan-pane__head">
        <h1 className="plan-pane__title">{plan.title?.trim() || t("inspector.plan.untitled")}</h1>
        {plan.description?.trim() ? <p className="plan-pane__desc">{plan.description}</p> : null}
      </header>
      <div className="plan-pane__body tw-md">
        <MarkdownView
          markdown={plan.markdown}
          theme={markdownTheme}
          footer={
            plan.todos.length > 0 ? (
              <TodoList todos={plan.todos} title={t("chat.todos.title")} running={running} />
            ) : undefined
          }
        />
      </div>
    </div>
  );
}
