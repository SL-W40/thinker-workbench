/**
 * 会话待办条：清除已完成入口 —— 只在「有已完成项且提供回调」时出现，
 * 点击回调触发一次且不冒泡触发折叠。
 */
import assert from "node:assert/strict";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { ChatTodo } from "@thinker-workbench/shared";
import { createElement } from "react";
import { afterEach, describe, it, vi } from "vitest";
import { SessionTodoBar } from "../../../src/features/chat/panels/SessionTodoBar";
import { I18nContext } from "../../../src/ui/i18n/context";
import { translate } from "../../../src/ui/i18n/translate";

/** 用真实目录的 t + 与 I18nProvider 同构的最小上下文，避免在 jsdom 里拉起 IPC 取设置。 */
function wrap(children: unknown) {
  return createElement(
    I18nContext.Provider,
    {
      value: {
        locale: "en" as const,
        setLocale: () => undefined,
        applyGeneral: () => undefined,
        t: (key: Parameters<typeof translate>[1], vars?: Record<string, string>) =>
          translate("en", key, vars),
      },
    },
    children,
  );
}

const TODOS: ChatTodo[] = [
  { id: "a", label: "打骨架", status: "done" },
  { id: "b", label: "跑起来", status: "in_progress" },
  { id: "c", label: "收尾", status: "pending" },
];

describe("SessionTodoBar clear completed", () => {
  afterEach(() => cleanup());

  it("有已完成项且提供回调时渲染清除按钮", () => {
    const onClearCompleted = vi.fn();
    render(wrap(createElement(SessionTodoBar, { todos: TODOS, onClearCompleted, running: false })));
    const button = screen.queryByRole("button", { name: "Clear completed" });
    assert.ok(button, "应有清除已完成按钮");
    assert.equal(onClearCompleted.mock.calls.length, 0);
  });

  it("点击清除按钮只触发一次回调", () => {
    const onClearCompleted = vi.fn();
    render(wrap(createElement(SessionTodoBar, { todos: TODOS, onClearCompleted, running: false })));
    fireEvent.click(screen.getByRole("button", { name: "Clear completed" }));
    assert.equal(onClearCompleted.mock.calls.length, 1);
  });

  it("无已完成项时不显示清除按钮", () => {
    const pending: ChatTodo[] = [{ id: "a", label: "待开始", status: "pending" }];
    render(
      wrap(createElement(SessionTodoBar, { todos: pending, onClearCompleted: () => undefined })),
    );
    assert.equal(screen.queryByRole("button", { name: "Clear completed" }), null);
  });

  it("未提供回调时不显示清除按钮（即使有已完成项）", () => {
    render(wrap(createElement(SessionTodoBar, { todos: TODOS, running: false })));
    assert.equal(screen.queryByRole("button", { name: "Clear completed" }), null);
  });
});
