/**
 * FilesHome 组件：搜索过滤、回车打开、Esc 清空、新建与行点击；
 * 同时覆盖迁移到 design Input / Button 后的可访问性与交互。
 * （renderer 测试为 .ts，故用 createElement 而非 JSX；useT 以桩返回 key。）
 */
import assert from "node:assert/strict";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { createElement } from "react";
import { afterEach, describe, it, vi } from "vitest";

vi.mock("../../../src/ui/i18n/useI18n", () => ({
  useT: () => (key: string) => key,
  useI18n: () => ({ t: (key: string) => key }),
}));

import { FilesHome } from "../../../src/features/inspector/FilesHome";

const SEARCH = "inspector.files.searchPlaceholder";

function renderHome(overrides: Partial<Parameters<typeof FilesHome>[0]> = {}) {
  const onOpenFile = vi.fn();
  const onNewFile = vi.fn();
  const utils = render(
    createElement(FilesHome, {
      recents: ["src/a.ts", "src/b.tsx", "README.md"],
      onOpenFile,
      onNewFile,
      ...overrides,
    }),
  );
  return { onOpenFile, onNewFile, ...utils };
}

describe("FilesHome", () => {
  afterEach(() => cleanup());

  it("默认列出最近文件；点击行打开对应路径", () => {
    const { onOpenFile } = renderHome();
    fireEvent.click(screen.getByRole("button", { name: /a\.ts/ }));
    assert.equal(onOpenFile.mock.calls[0]?.[0], "src/a.ts");
  });

  it("搜索按子串过滤；回车打开首个命中", () => {
    const { onOpenFile } = renderHome();
    const input = screen.getByRole("textbox", { name: SEARCH });
    fireEvent.change(input, { target: { value: "readme" } });
    assert.equal(screen.queryByRole("button", { name: /a\.ts/ }), null);
    fireEvent.keyDown(input, { key: "Enter" });
    assert.equal(onOpenFile.mock.calls[0]?.[0], "README.md");
  });

  it("无命中显示空态；Esc 清空恢复最近列表", () => {
    renderHome();
    const input = screen.getByRole("textbox", { name: SEARCH }) as HTMLInputElement;
    fireEvent.change(input, { target: { value: "zzz-nomatch" } });
    assert.ok(screen.queryByText("inspector.files.noMatch"));
    fireEvent.keyDown(input, { key: "Escape" });
    assert.equal(input.value, "");
    assert.ok(screen.getByRole("button", { name: /a\.ts/ }));
  });

  it("点击新建按钮触发 onNewFile", () => {
    const { onNewFile } = renderHome();
    fireEvent.click(screen.getByRole("button", { name: "inspector.files.newFile" }));
    assert.equal(onNewFile.mock.calls.length, 1);
  });
});
