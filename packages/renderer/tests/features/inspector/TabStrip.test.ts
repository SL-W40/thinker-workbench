/**
 * 标签条：不挂悬停 title、右键菜单、右侧文件树按钮、加号菜单不含文件树。
 */
import assert from "node:assert/strict";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { createElement } from "react";
import { afterEach, describe, it, vi } from "vitest";

vi.mock("../../../src/ui/i18n/useI18n", () => ({
  useT: () => (key: string, vars?: Record<string, string>) =>
    vars ? `${key}:${Object.values(vars).join(",")}` : key,
}));

import type { ChangeTreeNode } from "../../../src/features/inspector/changesTree";
import { revealTabScrollDelta, TabStrip } from "../../../src/features/inspector/RightInspector/TabStrip";
import type { StageTab } from "../../../src/features/inspector/types";

const tabs: StageTab[] = [
  { key: "terminal", kind: "terminal", title: "终端" },
  { key: "files", kind: "files", title: "文件树" },
  { key: "file:a.ts", kind: "file", title: "a.ts", path: "src/a.ts" },
];

const treeNodes: ChangeTreeNode[] = [
  {
    kind: "dir",
    name: "src",
    path: "src",
    children: [{ kind: "file", name: "a.ts", path: "src/a.ts", added: 0, removed: 0, status: "" }],
  },
];

function renderStrip(
  fileCount: number | null = 12,
  tabList: StageTab[] = tabs,
  nodes: ChangeTreeNode[] = treeNodes,
) {
  const onCloseTab = vi.fn();
  const onCloseTabs = vi.fn();
  const onOpenFile = vi.fn();
  const onToggleDir = vi.fn();
  const onOpenChanges = vi.fn();
  const onOpenTerminal = vi.fn();
  const onOpenBrowser = vi.fn();
  const onCopyPath = vi.fn();
  const onRevealPath = vi.fn();
  render(
    createElement(TabStrip, {
      tabs: tabList,
      activeTab: "files",
      unsaved: {},
      fileCount,
      treeNodes: nodes,
      openDirs: new Set(["src"]),
      onToggleDir,
      onOpenFile,
      onSelect: vi.fn(),
      onCloseTab,
      onCloseTabs,
      onOpenChanges,
      onOpenTerminal,
      onOpenBrowser,
      onCopyPath,
      onRevealPath,
    }),
  );
  return {
    onCloseTab,
    onCloseTabs,
    onOpenFile,
    onToggleDir,
    onOpenChanges,
    onOpenTerminal,
    onOpenBrowser,
    onCopyPath,
    onRevealPath,
  };
}

function menuLabels(): string[] {
  return screen.queryAllByRole("menuitem").map((el) => el.textContent ?? "");
}

describe("TabStrip", () => {
  afterEach(() => cleanup());

  it("标签没有 title，右键给出关闭和文件操作", () => {
    renderStrip();
    const tab = screen.getByRole("button", { name: /a\.ts/ });
    assert.equal(tab.getAttribute("title"), null);
    assert.equal(screen.getByRole("button", { name: /终端/ }).getAttribute("title"), null);

    fireEvent.contextMenu(tab, { clientX: 20, clientY: 30 });
    assert.ok(menuLabels().includes("inspector.tabs.close"));
    assert.ok(menuLabels().includes("inspector.tabs.closeOthers"));
    assert.ok(menuLabels().includes("inspector.changes.copyPath"));
    assert.ok(menuLabels().includes("inspector.files.revealInFolder"));
    assert.equal(
      screen.getByRole("menuitem", { name: "inspector.tabs.closeRight" }).hasAttribute("disabled"),
      true,
    );

    fireEvent.contextMenu(screen.getByRole("button", { name: /终端/ }));
    assert.equal(menuLabels().includes("inspector.changes.copyPath"), false);
    assert.equal(
      screen.getByRole("menuitem", { name: "inspector.tabs.closeRight" }).hasAttribute("disabled"),
      false,
    );
  });

  it("文件标签的复制路径走该文件", () => {
    const { onCopyPath, onRevealPath, onCloseTabs } = renderStrip();
    fireEvent.contextMenu(screen.getByRole("button", { name: /a\.ts/ }));
    fireEvent.click(screen.getByRole("menuitem", { name: "inspector.changes.copyPath" }));
    assert.deepEqual(onCopyPath.mock.calls[0], ["src/a.ts"]);

    fireEvent.contextMenu(screen.getByRole("button", { name: /文件树/ }));
    fireEvent.click(screen.getByRole("menuitem", { name: "inspector.tabs.closeOthers" }));
    assert.deepEqual(onCloseTabs.mock.calls[0]?.[0], ["terminal", "file:a.ts"]);
    assert.equal(onRevealPath.mock.calls.length, 0);
  });

  it("加号钉在右侧，菜单不含文件树；悬停文件树浮窗里点文件才打开", () => {
    const { onOpenFile, onOpenTerminal } = renderStrip(12);
    const pin = document.querySelector(".agent-inspector__tabs-pin");
    const add = screen.getByRole("button", { name: "inspector.addPanel" });
    const files = screen.getByRole("button", { name: "inspector.section.files" });
    assert.ok(pin?.contains(add));
    assert.ok(pin?.contains(files));
    assert.equal(files.getAttribute("title"), null);

    fireEvent.click(files);
    assert.equal(onOpenFile.mock.calls.length, 0);
    assert.equal(screen.queryByRole("tree"), null);

    fireEvent.mouseEnter(files);
    assert.equal(screen.queryByText(/fileCount/), null);
    fireEvent.click(screen.getByRole("treeitem", { name: "a.ts" }));
    assert.deepEqual(onOpenFile.mock.calls[0], ["src/a.ts"]);

    fireEvent.click(add);
    const labels = menuLabels();
    assert.equal(labels.includes("inspector.section.files"), false);
    assert.ok(labels.includes("inspector.section.terminal"));
    fireEvent.click(screen.getByRole("menuitem", { name: "inspector.section.terminal" }));
    assert.equal(onOpenTerminal.mock.calls.length, 1);
  });

  it("变更标签没有关闭按钮，关闭全部也不会带上它", () => {
    const { onCloseTab, onCloseTabs } = renderStrip(12, [
      { key: "changes", kind: "changes", title: "变更" },
      { key: "terminal", kind: "terminal", title: "终端" },
    ]);
    const changes = screen.getByRole("button", { name: "变更" });
    assert.equal(changes.querySelector(".agent-inspector__tab-close"), null);

    fireEvent.mouseDown(changes, { button: 1 });
    assert.equal(onCloseTab.mock.calls.length, 0);

    fireEvent.contextMenu(changes);
    assert.equal(
      screen.getByRole("menuitem", { name: "inspector.tabs.close" }).hasAttribute("disabled"),
      true,
    );
    fireEvent.click(screen.getByRole("menuitem", { name: "inspector.tabs.closeAll" }));
    assert.deepEqual(onCloseTabs.mock.calls[0]?.[0], ["terminal"]);
  });

  it("文件树还没加载时浮窗不报空列表", () => {
    renderStrip(null, tabs, []);
    const files = screen.getByRole("button", { name: "inspector.section.files" });
    fireEvent.mouseEnter(files);
    assert.equal(screen.queryByText("inspector.files.emptyTree"), null);
    assert.equal(screen.queryByText(/fileCount/), null);
  });

  it("空工作空间显示空状态，不撑成文件列表", () => {
    renderStrip(0, tabs, []);
    fireEvent.mouseEnter(screen.getByRole("button", { name: "inspector.section.files" }));
    assert.ok(screen.getByText("inspector.files.emptyTree"));
    assert.ok(screen.getByText("inspector.files.emptyTreeBody"));
    assert.equal(screen.queryByRole("tree"), null);
  });
});

describe("revealTabScrollDelta", () => {
  it("右侧被钉住的按钮挡住时向右滚，直到标签完整露出", () => {
    assert.equal(
      revealTabScrollDelta({ tabLeft: 200, tabRight: 300, viewLeft: 0, viewRight: 250 }),
      56,
    );
  });

  it("左侧被裁切时向左滚", () => {
    assert.equal(
      revealTabScrollDelta({ tabLeft: -20, tabRight: 80, viewLeft: 0, viewRight: 250 }),
      -26,
    );
  });

  it("已经完整可见则不滚", () => {
    assert.equal(
      revealTabScrollDelta({ tabLeft: 20, tabRight: 120, viewLeft: 0, viewRight: 250 }),
      0,
    );
  });
});
