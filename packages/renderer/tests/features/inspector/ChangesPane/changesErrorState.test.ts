/**
 * 变更面板失败态：文案按失败分类映射，原始报错只在「查看错误详情」弹窗里出现。
 * （renderer 测试为 .ts，故用 createElement 而非 JSX；useT 以桩返回 key。）
 */
import assert from "node:assert/strict";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { GitStatus } from "@thinker-workbench/shared";
import { createElement } from "react";
import { afterEach, describe, it, vi } from "vitest";

vi.mock("../../../../src/ui/i18n/useI18n", () => ({
  useT: () => (key: string) => key,
  useI18n: () => ({ t: (key: string) => key }),
}));

import { ChangesErrorState } from "../../../../src/features/inspector/ChangesPane/ChangesErrorState";

function status(patch: Partial<GitStatus>): GitStatus {
  return {
    isRepo: false,
    gitAvailable: true,
    reason: "git_error",
    branch: null,
    isDefaultBranch: false,
    ahead: 0,
    behind: 0,
    files: [],
    totals: { added: 0, removed: 0 },
    ...patch,
  };
}

function renderState(patch: Partial<GitStatus>, error?: string | null) {
  const onRefresh = vi.fn();
  const onInitRepo = vi.fn();
  render(
    createElement(ChangesErrorState, {
      status: status(patch),
      error: error ?? null,
      onRefresh,
      onInitRepo,
    }),
  );
  return { onRefresh, onInitRepo };
}

afterEach(() => cleanup());

describe("ChangesErrorState", () => {
  it("认不出的失败用兜底文案，原始报错不铺在面板上", () => {
    renderState({ reason: "git_error", detail: "fatal: boom" });

    assert.ok(screen.queryByText("inspector.changes.errorTitle"));
    assert.ok(screen.queryByText("inspector.changes.gitErrorBody"));
    assert.equal(screen.queryByText("fatal: boom"), null);
  });

  it("点「查看错误详情」才展示原始报错", () => {
    renderState({ reason: "git_error", detail: "fatal: boom" });

    fireEvent.click(screen.getByText("inspector.changes.viewDetails"));

    assert.ok(screen.queryByText("fatal: boom"));
    assert.ok(screen.queryByText("inspector.changes.detailsTitle"));
  });

  it("能归类的失败走对应文案，且没有细节就不出现详情入口", () => {
    renderState({ reason: "timeout", detail: "git timed out" });

    assert.ok(screen.queryByText("inspector.changes.timeoutTitle"));
    assert.equal(screen.queryByText("inspector.changes.errorTitle"), null);
  });

  it("不是仓库时主操作是初始化，没有报错原文就不给详情入口", () => {
    const { onInitRepo, onRefresh } = renderState({ reason: "not_a_repo" });

    assert.equal(screen.queryByText("inspector.changes.viewDetails"), null);
    fireEvent.click(screen.getByText("inspector.changes.initRepo"));
    assert.equal(onInitRepo.mock.calls.length, 1);
    assert.equal(onRefresh.mock.calls.length, 0);
  });

  it("状态里的 detail 与 IPC 异常相同时只展示一份", () => {
    renderState({ reason: "git_error", detail: "fatal: boom" }, "fatal: boom");

    fireEvent.click(screen.getByText("inspector.changes.viewDetails"));

    assert.equal(screen.getAllByText("fatal: boom").length, 1);
  });
});
