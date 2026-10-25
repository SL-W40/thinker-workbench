/**
 * CommandPalette 组件：分组渲染顺序、输入过滤、↑↓/Enter/Esc 键盘操作。
 * （renderer 测试为 .ts，故用 createElement；useI18n 以桩返回 key 本身。）
 */
import assert from "node:assert/strict";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { createElement } from "react";
import { afterEach, describe, it, vi } from "vitest";

vi.mock("../../../src/ui/i18n/useI18n", () => ({
  useT: () => (key: string) => key,
  useI18n: () => ({ t: (key: string) => key }),
}));

import { CommandPalette } from "../../../src/features/palette/CommandPalette";
import type { PaletteItem } from "../../../src/features/palette/paletteModel";

const INPUT_LABEL = "palette.title";

const COMMANDS: PaletteItem[] = [{ id: "c:new", group: "command", title: "新建会话" }];
const SESSIONS: PaletteItem[] = [{ id: "s:1", group: "session", title: "修复构建" }];
const FILES: PaletteItem[] = [{ id: "f:src/a.ts", group: "file", title: "src/a.ts" }];
const SETTINGS: PaletteItem[] = [{ id: "setting:data", group: "setting", title: "数据" }];

function renderPalette(overrides: Partial<Parameters<typeof CommandPalette>[0]> = {}) {
  const onPick = vi.fn();
  const onClose = vi.fn();
  render(
    createElement(CommandPalette, {
      open: true,
      onClose,
      commands: COMMANDS,
      sessions: SESSIONS,
      files: FILES,
      settings: SETTINGS,
      onPick,
      ...overrides,
    }),
  );
  return { onPick, onClose };
}

/** 面板里可见的候选题名（按渲染顺序）。 */
function optionNames(): string[] {
  return screen.queryAllByRole("option").map((el) => el.textContent ?? "");
}

describe("CommandPalette", () => {
  afterEach(() => cleanup());

  it("四类候选按 命令 → 会话 → 文件 → 设置 的顺序渲染", () => {
    renderPalette();
    assert.deepEqual(optionNames(), ["新建会话", "修复构建", "src/a.ts", "数据"]);
  });

  it("输入即过滤：只保留命中项", () => {
    renderPalette();
    fireEvent.change(screen.getByRole("textbox", { name: INPUT_LABEL }), {
      target: { value: "a.ts" },
    });
    assert.deepEqual(optionNames(), ["src/a.ts"]);
  });

  it("无命中时给出空态且不抛错", () => {
    renderPalette();
    fireEvent.change(screen.getByRole("textbox", { name: INPUT_LABEL }), {
      target: { value: "zzzzzz" },
    });
    assert.deepEqual(optionNames(), []);
    assert.ok(screen.getByText("palette.empty"));
  });

  it("↓ 移动光标后 Enter 选中对应候选并关闭", () => {
    const { onPick, onClose } = renderPalette();
    const input = screen.getByRole("textbox", { name: INPUT_LABEL });
    fireEvent.keyDown(input, { key: "ArrowDown" });
    fireEvent.keyDown(input, { key: "Enter" });
    assert.equal(onPick.mock.calls[0]?.[0]?.id, "s:1");
    assert.equal(onClose.mock.calls.length, 1);
  });

  it("↑ 从首项回卷到末项", () => {
    const { onPick } = renderPalette();
    const input = screen.getByRole("textbox", { name: INPUT_LABEL });
    fireEvent.keyDown(input, { key: "ArrowUp" });
    fireEvent.keyDown(input, { key: "Enter" });
    assert.equal(onPick.mock.calls[0]?.[0]?.id, "setting:data");
  });

  it("Esc 关闭且不触发选中", () => {
    const { onPick, onClose } = renderPalette();
    fireEvent.keyDown(screen.getByRole("textbox", { name: INPUT_LABEL }), { key: "Escape" });
    assert.equal(onClose.mock.calls.length, 1);
    assert.equal(onPick.mock.calls.length, 0);
  });

  it("未打开时不渲染", () => {
    renderPalette({ open: false });
    assert.equal(screen.queryByRole("textbox"), null);
  });
});
