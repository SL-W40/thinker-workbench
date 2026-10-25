/**
 * listChatTools 装配：内置常驻、MCP 超阈值走延迟、loadedToolNames 展开、跨轮缓存。
 *
 * MCP 工具由假 manager 注入（真实 stdio 连接无法在单测里建立）。
 */
import assert from "node:assert/strict";
import { beforeEach, describe, it, vi } from "vitest";
import type { ChatToolDefinition } from "../../src/model/types";
import { invalidateToolsCache } from "../../src/tools/cache";
import { listTools } from "../../src/tools/registry";
import { listChatTools } from "../../src/tools/schema";

const mcpState = vi.hoisted(() => ({
  tools: [] as ChatToolDefinition[],
  fingerprint: "",
}));

vi.mock("../../src/mcp/McpManager", () => ({
  getMcpManager: () => ({
    listChatTools: () => mcpState.tools,
    toolsFingerprint: () => mcpState.fingerprint,
  }),
}));

/** 造 count 条 MCP 工具定义。 */
function makeMcpTools(count: number): ChatToolDefinition[] {
  const out: ChatToolDefinition[] = [];
  for (let i = 0; i < count; i += 1) {
    out.push({
      type: "function",
      function: {
        name: `mcp__srv__tool_${i}`,
        description: `Remote tool number ${i}`,
        parameters: {
          type: "object",
          properties: { target: { type: "string", description: `target ${i}` } },
          required: ["target"],
        },
      },
    });
  }
  return out;
}

function setMcp(tools: ChatToolDefinition[]): void {
  mcpState.tools = tools;
  mcpState.fingerprint = tools.map((tool) => tool.function.name).join(",");
}

const BUILTIN_COUNT = listTools().length;

describe("listChatTools 装配", () => {
  beforeEach(() => {
    setMcp([]);
    invalidateToolsCache();
  });

  it("未接 MCP 时只回内置工具且不生成索引", () => {
    const bundle = listChatTools({ chatMode: "agent" });
    assert.equal(bundle.deferred, false);
    assert.equal(bundle.catalog, "");
    assert.equal(bundle.tools.length, BUILTIN_COUNT);
  });

  it("MCP 数量在阈值内时仍全量并列", () => {
    setMcp(makeMcpTools(3));
    const bundle = listChatTools({ chatMode: "agent" });
    assert.equal(bundle.deferred, false);
    assert.equal(bundle.catalog, "");
    assert.equal(bundle.tools.length, BUILTIN_COUNT + 3);
  });

  it("MCP 超阈值时切延迟：只回索引，工具不进 body.tools", () => {
    setMcp(makeMcpTools(20));
    const bundle = listChatTools({ chatMode: "agent" });
    assert.equal(bundle.deferred, true);
    assert.ok(bundle.catalog.includes("<available_mcp_tools>"));
    assert.equal(bundle.tools.length, BUILTIN_COUNT);
  });

  it("延迟模式下只有 loadedToolNames 里的工具展开完整 schema", () => {
    setMcp(makeMcpTools(20));
    const bundle = listChatTools({
      chatMode: "agent",
      loadedToolNames: ["mcp__srv__tool_5", "mcp__srv__tool_7"],
    });
    assert.equal(bundle.deferred, true);
    const names = bundle.tools.map((tool) => tool.function.name);
    assert.ok(names.includes("mcp__srv__tool_5"));
    assert.ok(names.includes("mcp__srv__tool_7"));
    assert.equal(names.includes("mcp__srv__tool_1"), false);
  });

  it("loadedToolNames 里的未知名字被忽略", () => {
    setMcp(makeMcpTools(20));
    const bundle = listChatTools({
      chatMode: "agent",
      loadedToolNames: ["mcp__srv__nope"],
    });
    assert.equal(bundle.tools.length, BUILTIN_COUNT);
  });

  it("json 与 tools 同源，可直接复用于用量统计", () => {
    setMcp(makeMcpTools(2));
    const bundle = listChatTools({ chatMode: "agent" });
    assert.equal(bundle.json, JSON.stringify(bundle.tools));
  });
});
