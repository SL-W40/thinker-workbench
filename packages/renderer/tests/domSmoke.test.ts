/**
 * DOM 测试链路冒烟：jsdom 环境 + workspace alias + React 插件 + Testing Library。
 * 后续 renderer 组件测试都跑在这条链路上，先固定最小可运行样例。
 * 覆盖两类渲染：无状态控件与带 hooks 的 ThemeProvider（验证 react 去重后单副本可用）。
 */
import assert from "node:assert/strict";
import { cleanup, render, screen } from "@testing-library/react";
import { Button, ThemeProvider } from "@thinker-workbench/design/react";
import { createElement } from "react";
import { afterEach, describe, it } from "vitest";

describe("design Button smoke", () => {
  afterEach(() => cleanup());

  it("经 alias 渲染 design 控件并暴露可访问名称", () => {
    render(createElement(Button, { variant: "primary" }, "冒烟"));
    const button = screen.getByRole("button", { name: "冒烟" });
    assert.equal(button.textContent, "冒烟");
    assert.match(button.className, /tw-btn--primary/);
  });

  it("busy 时禁用并标记 aria-busy", () => {
    render(createElement(Button, { busy: true }, "保存中"));
    const button = screen.getByRole("button");
    assert.equal(button.getAttribute("aria-busy"), "true");
    assert.equal((button as HTMLButtonElement).disabled, true);
  });

  it("ThemeProvider 带 hooks 正常挂载（react 单副本）", () => {
    render(createElement(ThemeProvider, null, createElement(Button, null, "主题内按钮")));
    assert.equal(screen.getByRole("button", { name: "主题内按钮" }).textContent, "主题内按钮");
  });
});
