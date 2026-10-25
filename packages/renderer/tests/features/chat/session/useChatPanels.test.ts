/**
 * 侧栏宽度：提交态以 CSS 变量下发，拖拽预览只改 DOM 变量、不触发 React 渲染。
 * 这条契约一旦破掉（预览改成 setState），拖面板就会回到每帧整树重渲染的卡顿状态。
 */
import assert from "node:assert/strict";
import { act, cleanup, render, screen } from "@testing-library/react";
import { createElement } from "react";
import { afterEach, beforeEach, describe, it } from "vitest";
import { useChatPanels } from "../../../../src/features/chat/session/useChatPanels";

type Panels = ReturnType<typeof useChatPanels>;

let panels: Panels | null = null;
let renders = 0;

function Harness() {
  renders += 1;
  const api = useChatPanels();
  panels = api;
  return createElement("div", {
    ref: api.shellRef,
    style: api.shellVars,
    "data-testid": "shell",
  });
}

/** 取已挂载的 hook 返回值。 */
function api(): Panels {
  assert.ok(panels, "Harness 未渲染");
  return panels;
}

/** 读壳节点上的宽度变量；未下发时为空串。 */
function widthVar(name: string): string {
  return screen.getByTestId("shell").style.getPropertyValue(name);
}

describe("useChatPanels 三栏宽度变量", () => {
  beforeEach(() => {
    localStorage.clear();
    renders = 0;
    panels = null;
  });

  afterEach(() => {
    cleanup();
    localStorage.clear();
  });

  it("提交态下发左右宽度，壳宽未量到时不下发中间列", () => {
    render(createElement(Harness));
    assert.equal(widthVar("--chat-left-width"), "260px");
    assert.equal(widthVar("--chat-right-width"), "380px");
    assert.equal(widthVar("--chat-main-width"), "");
  });

  it("拖拽预览只改 DOM 变量，不触发任何 React 渲染", () => {
    render(createElement(Harness));
    const before = renders;
    api().previewWidth("left", 300);
    assert.equal(widthVar("--chat-left-width"), "300px");
    assert.equal(renders, before);
  });

  it("预览仍受上限钳制，不会盖住中间聊天列", () => {
    render(createElement(Harness));
    api().previewWidth("left", 900);
    assert.equal(widthVar("--chat-left-width"), "360px");
  });

  it("松手提交后变量与 state 一致", () => {
    render(createElement(Harness));
    act(() => {
      api().setLeftWidth(300);
    });
    assert.equal(api().leftWidth, 300);
    assert.equal(widthVar("--chat-left-width"), "300px");
  });

  it("起手只打拖拽标记，不再写入冻结宽度变量", () => {
    render(createElement(Harness));
    const shell = screen.getByTestId("shell");
    act(() => {
      api().beginResize("right");
    });
    assert.ok(shell.classList.contains("is-resizing"), "拖拽期要有 is-resizing");
    assert.equal(shell.dataset.resizeSide, "right");
    // 内容宽度改为实时跟随，冻结变量必须彻底消失，否则面板变宽处会空一片
    assert.equal(shell.style.getPropertyValue("--chat-frozen-side"), "");
    assert.equal(shell.style.getPropertyValue("--chat-frozen-main"), "");
  });

  it("松手清掉拖拽标记，不让文件列表自动开合永久停摆", () => {
    render(createElement(Harness));
    const shell = screen.getByTestId("shell");
    act(() => {
      api().beginResize("left");
    });
    act(() => {
      api().endResize();
    });
    assert.equal(shell.classList.contains("is-resizing"), false);
    assert.equal(shell.dataset.resizeSide, undefined);
  });
});
