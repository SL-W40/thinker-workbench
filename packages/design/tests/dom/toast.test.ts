/**
 * Toast：入栈 / 语气语义 / 手动与自动关闭 / 上限截断。
 * （design 测试为 .ts，故用 createElement 而非 JSX。）
 */
import assert from "node:assert/strict";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { createElement, type ReactNode } from "react";
import { afterEach, beforeEach, describe, it, vi } from "vitest";
import { ToastProvider, type ToastTone, useToast } from "../../src/components/Toast/Toast";

const DISMISS = "关闭提示";
const PUSH = "push";

type ProbeProps = {
  tone?: ToastTone;
  title?: string;
  duration?: number;
};

/** 触发一条提示的探针；duration 默认 0（常驻），避免计时器干扰断言。 */
function Probe({ tone = "danger", title = "处置失败", duration = 0 }: ProbeProps) {
  const toast = useToast();
  return createElement(
    "button",
    { type: "button", onClick: () => toast[tone]({ title, description: "细节", duration }) },
    PUSH,
  );
}

function renderToast(children: ReactNode, max?: number) {
  return render(createElement(ToastProvider, { dismissLabel: DISMISS, max }, children));
}

function clickPush(index = 0) {
  const buttons = screen.getAllByRole("button", { name: PUSH });
  fireEvent.click(buttons[index]);
}

/** 快进计时器（含 React 状态更新）。 */
async function advance(ms: number) {
  await act(async () => {
    vi.advanceTimersByTime(ms);
  });
}

describe("Toast", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.runOnlyPendingTimers();
    vi.useRealTimers();
    cleanup();
  });

  it("入栈后按语气渲染语义与两级文案", () => {
    renderToast(createElement(Probe));
    clickPush();
    const toast = screen.getByRole("alert");
    assert.match(toast.className, /tw-toast--danger/);
    assert.ok(screen.getByText("处置失败"));
    assert.ok(screen.getByText("细节"));
  });

  it("info 走 status 语义而非 alert", () => {
    renderToast(createElement(Probe, { tone: "info", title: "已保存" }));
    clickPush();
    assert.equal(screen.queryByRole("alert"), null);
    assert.ok(screen.getByRole("status"));
  });

  it("点关闭按钮：离场结束后卸载", async () => {
    renderToast(createElement(Probe));
    clickPush();
    fireEvent.click(screen.getByRole("button", { name: DISMISS }));
    await advance(300); // 离场动画 180ms
    assert.equal(screen.queryByRole("alert"), null);
  });

  it("到点自动关闭", async () => {
    renderToast(createElement(Probe, { tone: "info", title: "临时", duration: 1000 }));
    clickPush();
    assert.ok(screen.getByRole("status"));
    await advance(1400);
    assert.equal(screen.queryByRole("status"), null);
  });

  it("同屏超过 max 时挤掉最旧的一条", () => {
    renderToast(
      createElement(
        "div",
        null,
        createElement(Probe, { title: "第一条" }),
        createElement(Probe, { title: "第二条" }),
      ),
      1,
    );
    clickPush(0);
    clickPush(1);
    assert.equal(screen.getAllByRole("alert").length, 1);
    assert.ok(screen.getByText("第二条"));
    assert.equal(screen.queryByText("第一条"), null);
  });
});
