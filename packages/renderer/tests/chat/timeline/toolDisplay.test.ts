/**
 * 工具展示名与 MCP 短名（toolDisplay.tsx）。
 */
import assert from "node:assert/strict";
import { describe, it } from "vitest";
import type { Translate } from "../../../src/features/chat/timeline/format";
import {
  isMcpTool,
  shortToolName,
  toolDisplayName,
} from "../../../src/features/chat/timeline/toolDisplay";

/** 假翻译：命中返回可读值，未命中返回键本身（与真实 translate 的兜底一致）。 */
const messages: Record<string, string> = {
  "chat.toolNames.readFile": "READ_FILE",
  "chat.toolNames.shell": "SHELL",
  "chat.toolNames.browserNavigate": "OPEN_PAGE",
};
const t = ((key: string) => messages[key] ?? key) as Translate;

/** engine 注册的内置工具全量（registry.ts 变动时同步这里）。 */
const BUILTIN_TOOLS = [
  "read_file",
  "edit_file",
  "write_file",
  "delete_file",
  "grep",
  "list_dir",
  "search_files",
  "time",
  "ask_user",
  "shell",
  "shell_await",
  "shell_write",
  "Task",
  "task_await",
  "task_cancel",
  "browser_navigate",
  "browser_lock",
  "browser_snapshot",
  "browser_click",
  "browser_type",
  "browser_fill",
  "browser_press_key",
  "browser_scroll",
  "browser_evaluate",
  "browser_resize",
  "browser_get_styles",
  "browser_screenshot",
];

describe("toolDisplayName", () => {
  it("用本地化展示名替换原始工具名", () => {
    assert.equal(toolDisplayName(t, "read_file"), "READ_FILE");
    assert.equal(toolDisplayName(t, "shell"), "SHELL");
    assert.equal(toolDisplayName(t, "browser_navigate"), "OPEN_PAGE");
  });

  it("MCP 工具剥掉 mcp__server__ 前缀", () => {
    assert.equal(toolDisplayName(t, "mcp__github__create_issue"), "create_issue");
  });

  it("未登记工具回退原始名", () => {
    assert.equal(toolDisplayName(t, "brand_new_tool"), "brand_new_tool");
  });

  it("内置工具全部配了展示名", () => {
    for (const name of BUILTIN_TOOLS) {
      assert.notEqual(toolDisplayName(t, name), name, `${name} 缺少展示名`);
    }
  });
});

describe("shortToolName / isMcpTool", () => {
  it("只剥 MCP 前缀", () => {
    assert.equal(shortToolName("read_file"), "read_file");
    assert.equal(shortToolName("mcp__srv__tool_name"), "tool_name");
  });

  it("前缀不完整时不算 MCP", () => {
    assert.equal(isMcpTool("mcp__broken"), false);
    assert.equal(isMcpTool("mcp__"), false);
    assert.equal(isMcpTool("read_file"), false);
  });
});
