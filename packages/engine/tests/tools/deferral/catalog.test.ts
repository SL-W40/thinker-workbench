/**
 * MCP 工具索引文本：空列表返回空串、XML 包裹、逐行列出、单行化与截断。
 */
import assert from "node:assert/strict";
import { describe, it } from "vitest";
import type { ChatToolDefinition } from "../../../src/model/types";
import { buildMcpCatalog } from "../../../src/tools/deferral/catalog";

/** 把扁平条目包装成 ChatToolDefinition。 */
function tool(name: string, description: string): ChatToolDefinition {
  return {
    type: "function",
    function: { name, description, parameters: { type: "object", properties: {} } },
  };
}

describe("buildMcpCatalog", () => {
  it("无工具时返回空串（调用方据此不生成 system section）", () => {
    assert.equal(buildMcpCatalog([]), "");
  });

  it("XML 包裹并逐行列出工具名与描述", () => {
    const text = buildMcpCatalog([
      tool("mcp__github__create_issue", "Create an issue."),
      tool("mcp__slack__send_message", "Post a message."),
    ]);
    assert.ok(text.startsWith("<available_mcp_tools>"));
    assert.ok(text.endsWith("</available_mcp_tools>"));
    assert.ok(text.includes("- mcp__github__create_issue — Create an issue."));
    assert.ok(text.includes("- mcp__slack__send_message — Post a message."));
  });

  it("提示模型用 tool_search 展开", () => {
    const text = buildMcpCatalog([tool("mcp__x__y", "d")]);
    assert.ok(text.includes("tool_search"));
  });

  it("折叠换行与多余空白成单行", () => {
    const text = buildMcpCatalog([tool("mcp__x__y", "first\nsecond\t\tthird")]);
    const line = text.split("\n").find((item) => item.startsWith("- mcp__x__y")) ?? "";
    assert.ok(line.includes("first second third"));
    assert.equal(line.includes("\n"), false);
  });

  it("超长描述截断到上限并带省略号", () => {
    const text = buildMcpCatalog([tool("mcp__x__y", `A${"b".repeat(300)}`)]);
    const line = text.split("\n").find((item) => item.startsWith("- mcp__x__y")) ?? "";
    assert.ok(line.endsWith("…"));
    assert.ok(line.length <= "- mcp__x__y — ".length + 160);
  });

  it("描述为空时只输出工具名", () => {
    const text = buildMcpCatalog([tool("mcp__x__y", "")]);
    assert.ok(text.includes("- mcp__x__y\n") || text.includes("- mcp__x__y\r\n"));
  });
});
