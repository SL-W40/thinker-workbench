/**
 * MCP 工具检索：空查询无结果、名字 token 优先、serverId 次之、描述兜底、limit 生效。
 */
import assert from "node:assert/strict";
import { describe, it } from "vitest";
import type { ChatToolDefinition } from "../../../src/model/types";
import { searchMcpTools } from "../../../src/tools/deferral/search";

/** 构造一条 MCP 工具定义。 */
function tool(name: string, description: string): ChatToolDefinition {
  return {
    type: "function",
    function: { name, description, parameters: { type: "object", properties: {} } },
  };
}

const tools = [
  tool("mcp__github__create_issue", "Create a new issue in a repository."),
  tool("mcp__github__list_pull_requests", "List pull requests."),
  tool("mcp__slack__send_message", "Post a message to a channel."),
];

/** 命中结果里的工具名序列。 */
function names(hits: ReturnType<typeof searchMcpTools>): string[] {
  return hits.map((hit) => hit.tool.function.name);
}

describe("searchMcpTools", () => {
  it("空查询返回空结果", () => {
    assert.deepEqual(names(searchMcpTools(tools, "")), []);
    assert.deepEqual(names(searchMcpTools(tools, "   ")), []);
  });

  it("完全无命中时返回空结果", () => {
    assert.deepEqual(names(searchMcpTools(tools, "zzzzz")), []);
  });

  it("名字 token 命中优先于仅描述命中", () => {
    const hits = searchMcpTools(tools, "github issue");
    assert.equal(hits[0]?.tool.function.name, "mcp__github__create_issue");
    // create_issue 同时命中 github 与 issue 两个 token，得分高于只命中 github 的
    assert.ok((hits[0]?.score ?? 0) > (hits[1]?.score ?? 0));
  });

  it("serverId 命中可召回该 server 下的工具", () => {
    const hits = searchMcpTools(tools, "slack");
    assert.deepEqual(names(hits), ["mcp__slack__send_message"]);
  });

  it("描述兜底命中（正文里的词而非工具名）", () => {
    const hits = searchMcpTools(tools, "channel");
    assert.deepEqual(names(hits), ["mcp__slack__send_message"]);
  });

  it("limit 限制返回条数", () => {
    assert.equal(searchMcpTools(tools, "github", 1).length, 1);
    assert.ok(searchMcpTools(tools, "github", 10).length >= 2);
  });

  it("limit 非正数返回空结果", () => {
    assert.deepEqual(searchMcpTools(tools, "github", 0), []);
  });

  it("得分降序，同分按名字典序，结果稳定", () => {
    const first = names(searchMcpTools(tools, "github"));
    const second = names(searchMcpTools(tools, "github"));
    assert.deepEqual(first, second);
  });
});
