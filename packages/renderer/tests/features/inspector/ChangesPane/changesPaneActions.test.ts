/**
 * Changes 面板的提交入口：头部「提交」按钮 + 「⋯」菜单里的全部动作。
 * 常态面板上没有处置条 —— 只有菜单里选了「手动提交」才长出提交表单。
 * （renderer 测试为 .ts，故用 createElement 而非 JSX；useT 以桩返回 key。）
 */
import assert from "node:assert/strict";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { GitStatus } from "@thinker-workbench/shared";
import { createElement } from "react";
import { afterEach, beforeEach, describe, it, vi } from "vitest";

vi.mock("../../../../src/ui/i18n/useI18n", () => ({
  useT: () => (key: string) => key,
  useI18n: () => ({ t: (key: string) => key }),
}));

type DisposeInput = { workspaceId: string; kind: "revert" | "keep"; paths: string[] };
const applyChangeDisposition = vi.fn(async (_input: DisposeInput) => ({ ok: true, items: [] }));
vi.mock("../../../../src/platform/ipc/checkpoints", () => ({
  applyChangeDisposition: (input: DisposeInput) => applyChangeDisposition(input),
}));
vi.mock("../../../../src/platform/ipc/git", () => ({
  gitCommit: vi.fn(async () => ({ ok: true })),
  gitPush: vi.fn(async () => ({ ok: true })),
}));

import { ChangesPane } from "../../../../src/features/inspector/ChangesPane/ChangesPane";
import { flushInspectorUi } from "../../../../src/features/inspector/inspectorUi";

const WS = "ws-changes-actions";
// 主按钮标签复用默认动作的文案（createBranchAndCommit），不再是泛泛的「提交」
const COMMIT = "inspector.changes.cta.createBranchAndCommit";
const COMMIT_MENU = "inspector.changes.commitMenu";
const VIEW_MENU = "inspector.changes.viewOptions";
const AI_GROUP = "inspector.changes.aiGroup";
const MANUAL = "inspector.changes.manualCommit";
const CANCEL = "inspector.changes.cancel";
const PLACEHOLDER = "inspector.changes.commitPlaceholder";
const REVERT_ALL = "inspector.changes.revertAll";
const KEEP_ALL = "inspector.changes.keepAll";
const PATHS = ["src/a.ts"];

const STATUS: GitStatus = {
  isRepo: true,
  gitAvailable: true,
  reason: "ok",
  branch: "feat/langgraph-agent",
  isDefaultBranch: false,
  ahead: 0,
  behind: 0,
  files: [{ path: "src/a.ts", status: "modified", added: 2, removed: 1 }],
  totals: { added: 2, removed: 1 },
};

function renderPane() {
  const onSendAction = vi.fn();
  render(
    createElement(ChangesPane, {
      workspaceId: WS,
      status: STATUS,
      loading: false,
      error: null,
      tree: null,
      onRefresh: () => {},
      onInitRepo: () => {},
      onOpenFile: () => {},
      onSendAction,
    }),
  );
  return { onSendAction };
}

function openMenu() {
  fireEvent.click(screen.getByRole("button", { name: COMMIT_MENU }));
}

describe("Changes 面板提交入口", () => {
  beforeEach(() => {
    localStorage.clear();
    applyChangeDisposition.mockClear();
    // 面板宽度与虚拟列表依赖 ResizeObserver，jsdom 里没有
    vi.stubGlobal(
      "ResizeObserver",
      class {
        observe() {}
        unobserve() {}
        disconnect() {}
      },
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    flushInspectorUi();
    cleanup();
    localStorage.clear();
  });

  it("常态：头部只有一个提交按钮，标签就是它执行的默认动作", () => {
    renderPane();
    assert.ok(screen.getByRole("button", { name: COMMIT }));
    assert.equal(screen.queryByRole("textbox", { name: PLACEHOLDER }), null);
  });

  it("文件行同时显示状态与 +/− 行数，头部有总计", () => {
    renderPane();
    assert.ok(screen.getByText("modified"));
    // 行内一处、头部总计一处：状态与行数并存，且两处都要有数字
    assert.equal(screen.getAllByText("+2").length, 2);
    assert.equal(screen.getAllByText("−1").length, 2);
  });

  it("头部按钮直接下发默认 AI 动作", () => {
    const { onSendAction } = renderPane();
    fireEvent.click(screen.getByRole("button", { name: COMMIT }));
    assert.deepEqual(onSendAction.mock.calls[0]?.[0], "createBranchAndCommit");
  });

  it("提交按钮的 chev 下拉里是全套动作：AI 代办分组 + 手动提交", () => {
    const { onSendAction } = renderPane();
    openMenu();
    assert.ok(screen.getByText(AI_GROUP));
    // 菜单项就是纯标签，没有额外小标
    assert.ok(
      screen.getByRole("menuitem", { name: "inspector.changes.cta.createBranchAndCommit" }),
    );
    fireEvent.click(
      screen.getByRole("menuitem", { name: "inspector.changes.cta.commitAndCreatePr" }),
    );
    assert.deepEqual(onSendAction.mock.calls[0]?.[0], "commitAndCreatePr");
  });

  it("「⋯」只管视图选项，不含提交动作", () => {
    renderPane();
    fireEvent.click(screen.getByRole("button", { name: VIEW_MENU }));
    assert.ok(screen.getByRole("menuitemcheckbox", { name: "inspector.changes.wordWrap" }));
    assert.equal(screen.queryByRole("menuitem", { name: MANUAL }), null);
  });

  it("菜单里选手动提交：长出表单，头部按钮让位", () => {
    renderPane();
    openMenu();
    fireEvent.click(screen.getByRole("menuitem", { name: MANUAL }));
    assert.ok(screen.getByRole("textbox", { name: PLACEHOLDER }));
    assert.equal(screen.queryByRole("button", { name: COMMIT }), null);
    fireEvent.click(screen.getByRole("button", { name: CANCEL }));
    assert.ok(screen.getByRole("button", { name: COMMIT }));
    assert.equal(screen.queryByRole("textbox", { name: PLACEHOLDER }), null);
  });

  it("表单里 Esc 也收起", () => {
    renderPane();
    openMenu();
    fireEvent.click(screen.getByRole("menuitem", { name: MANUAL }));
    fireEvent.keyDown(screen.getByRole("textbox", { name: PLACEHOLDER }), { key: "Escape" });
    assert.equal(screen.queryByRole("textbox", { name: PLACEHOLDER }), null);
  });

  it("菜单里的批量处置：确认才执行，取消不执行", () => {
    renderPane();
    const confirmSpy = vi.fn(() => true);
    vi.stubGlobal("confirm", confirmSpy);
    openMenu();
    fireEvent.click(screen.getByRole("menuitem", { name: REVERT_ALL }));
    assert.equal(confirmSpy.mock.calls.length, 1);
    assert.deepEqual(applyChangeDisposition.mock.calls[0]?.[0], {
      workspaceId: WS,
      kind: "revert",
      paths: PATHS,
    });

    applyChangeDisposition.mockClear();
    vi.stubGlobal("confirm", () => false);
    openMenu();
    fireEvent.click(screen.getByRole("menuitem", { name: KEEP_ALL }));
    assert.equal(applyChangeDisposition.mock.calls.length, 0);
  });

  it("手动态按工作空间记住：重挂载后表单还在", () => {
    renderPane();
    openMenu();
    fireEvent.click(screen.getByRole("menuitem", { name: MANUAL }));
    flushInspectorUi();
    cleanup();
    renderPane();
    assert.ok(screen.getByRole("textbox", { name: PLACEHOLDER }));
  });
});
