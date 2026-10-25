/**
 * tool_search 执行：空 query 报错、无工具报错、命中回传完整参数定义。
 */
import assert from "node:assert/strict";
import { beforeEach, describe, it, vi } from "vitest";
import type { ChatToolDefinition } from "../../../src/model/types";
import { toolSearchTool } from "../../../src/tools/toolSearch/execute";

const mcpState = vi.hoisted(() => ({ tools: [] as ChatToolDefinition[] }));

vi.mock("../../../src/mcp/McpManager", () => ({
  getMcpManager: () => ({ listChatTools: () => mcpState.tools }),
}));

/** 构造一条 MCP 工具定义。 */
function tool(name: string, description: string): ChatToolDefinition {
  return {
    type: "function",
    function: {
      name,
      description,
      parameters: { type: "object", properties: { id: { type: "string", description: "the id" } } },
    },
  };
}

/** 取结果里的 output 文本（兼容字符串返回）。 */
function outputOf(result: Awaited<ReturnType<typeof toolSearchTool>>): string {
  return typeof result === "string" ? result : result.output;
}

function okOf(result: Awaited<ReturnType<typeof toolSearchTool>>): boolean {
  return typeof result === "string" ? true : result.ok !== false;
}

describe("toolSearchTool", () => {
  beforeEach(() => {
    mcpState.tools = [];
  });

  it("query 缺失或空白时返回失败", async () => {
    const missing = await toolSearchTool({});
    assert.equal(okOf(missing), false);
    assert.ok(outputOf(missing).includes("query"));

    const blank = await toolSearchTool({ query: "   " });
    assert.equal(okOf(blank), false);
  });

  it("无 MCP 工具时返回失败", async () => {
    const result = await toolSearchTool({ query: "github" });
    assert.equal(okOf(result), false);
    assert.ok(outputOf(result).includes("No MCP tools"));
  });

  it("无命中时返回失败并提示换关键词", async () => {
    mcpState.tools = [tool("mcp__srv__list_issues", "List issues.")];
    const result = await toolSearchTool({ query: "zzzzz" });
    assert.equal(okOf(result), false);
    assert.ok(outputOf(result).includes("No MCP tool matched"));
  });

  it("命中时回传工具名与完整 parameters", async () => {
    mcpState.tools = [
      tool("mcp__github__create_issue", "Create an issue."),
      tool("mcp__slack__send_message", "Post a message."),
    ];
    const result = await toolSearchTool({ query: "github issue" });
    assert.equal(okOf(result), true);
    const output = outputOf(result);
    assert.ok(output.includes("mcp__github__create_issue"));
    assert.ok(output.includes("Create an issue."));
    assert.ok(output.includes('"type": "object"'));
  });

  it("limit 限制返回的工具条数", async () => {
    mcpState.tools = [
      tool("mcp__srv__tool_0", "Remote tool number 0"),
      tool("mcp__srv__tool_1", "Remote tool number 1"),
      tool("mcp__srv__tool_2", "Remote tool number 2"),
    ];
    const result = await toolSearchTool({ query: "srv tool", limit: 1 });
    assert.equal(okOf(result), true);
    const output = outputOf(result);
    const listed = ["mcp__srv__tool_0", "mcp__srv__tool_1", "mcp__srv__tool_2"].filter((name) =>
      output.includes(name),
    );
    assert.equal(listed.length, 1);
  });

  it("非法 limit 退回默认值", async () => {
    mcpState.tools = [tool("mcp__srv__tool_0", "Remote tool number 0")];
    const result = await toolSearchTool({ query: "srv", limit: "not-a-number" });
    assert.equal(okOf(result), true);
  });
});
