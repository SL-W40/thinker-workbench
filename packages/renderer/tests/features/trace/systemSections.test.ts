/**
 * Trace 入参里的 system 分块。
 */
import assert from "node:assert/strict";
import { describe, it } from "vitest";
import {
  isChipValueList,
  isSystemSectionList,
  parseToolOutput,
  readToolCalls,
  readToolResult,
  readTraceMessages,
  readTraceTools,
  readToolParams,
  summarizeMessageRoles,
} from "../../../src/features/trace/systemSections";

describe("isChipValueList", () => {
  it("短字符串不论多少个都用标签", () => {
    const names = Array.from({ length: 17 }, (_, i) => `tool_${i}`);
    assert.equal(isChipValueList(names), true);
  });

  it("含换行的长文本不用标签", () => {
    assert.equal(isChipValueList(["read_file", "line1\nline2"]), false);
  });
});

describe("readToolParams", () => {
  it("读出名称、类型、必填和默认值", () => {
    const params = readToolParams({
      type: "object",
      properties: {
        path: { type: "string", description: "File path" },
        max_chars: { type: "number", description: "Limit", default: 120000 },
      },
      required: ["path"],
    });
    assert.equal(params?.[0]?.name, "path");
    assert.equal(params?.[0]?.required, true);
    assert.equal(params?.[1]?.defaultText, "120000");
    assert.equal(params?.[1]?.required, false);
  });

  it("没有 properties 时不解析", () => {
    assert.equal(readToolParams(null), null);
    assert.equal(readToolParams({ type: "object" }), null);
  });
});

describe("readTraceTools", () => {
  it("读出名称、说明和参数", () => {
    const cards = readTraceTools([
      {
        type: "function",
        function: {
          name: "read_file",
          description: "Read a file",
          parameters: { type: "object", properties: { path: { type: "string" } } },
        },
      },
    ]);
    assert.equal(cards?.[0]?.name, "read_file");
    assert.equal(cards?.[0]?.description, "Read a file");
    assert.equal((cards?.[0]?.parameters as { type: string }).type, "object");
  });

  it("名字列表不是工具定义", () => {
    assert.equal(readTraceTools(["read_file", "grep"]), null);
  });
});

describe("readTraceMessages", () => {
  it("读出角色、正文和工具调用", () => {
    const cards = readTraceMessages([
      { role: "user", content: "hi" },
      { role: "assistant", content: null, tool_calls: [{ function: { name: "read_file" } }] },
      { role: "tool", content: "ok", tool_call_id: "call_1" },
    ]);
    assert.equal(cards?.length, 3);
    assert.equal(cards?.[1]?.content, null);
    assert.equal(cards?.[2]?.toolCallId, "call_1");
  });

  it("工具定义和空数组不是消息", () => {
    assert.equal(readTraceMessages([{ type: "function", function: { name: "read_file" } }]), null);
    assert.equal(readTraceMessages([]), null);
  });
});

describe("summarizeMessageRoles", () => {
  it("按角色顺序写出条数，没有的角色不出现", () => {
    assert.equal(
      summarizeMessageRoles([
        { role: "tool" },
        { role: "user" },
        { role: "assistant" },
        { role: "user" },
      ]),
      "user 2 · assistant 1 · tool 1",
    );
  });
});

describe("readToolCalls", () => {
  it("读出名称、编号，并把参数 JSON 展开", () => {
    const calls = readToolCalls([
      {
        id: "call_1",
        type: "function",
        function: { name: "read_file", arguments: "{\"path\":\"src/a.ts\"}" },
      },
    ]);
    assert.equal(calls[0]?.name, "read_file");
    assert.equal(calls[0]?.id, "call_1");
    assert.match(calls[0]?.argumentsText ?? "", /"path": "src\/a.ts"/);
  });

  it("没有调用字段时为空", () => {
    assert.deepEqual(readToolCalls([{ role: "user" }]), []);
    assert.deepEqual(readToolCalls(null), []);
  });
});

describe("parseToolOutput", () => {
  it("目录列表拆成路径和条目", () => {
    const result = readToolResult("[tool:list_dir ok]\npath\t.\ndir\t.cursor\nfile\tpackage.json");
    assert.equal(result?.name, "list_dir");
    assert.equal(result?.ok, true);
    const output = parseToolOutput(result?.body ?? "");
    assert.equal(output.kind, "listing");
    if (output.kind !== "listing") return;
    assert.equal(output.path, ".");
    assert.deepEqual(output.entries, [
      { kind: "dir", name: ".cursor" },
      { kind: "file", name: "package.json" },
    ]);
  });

  it("字段头和后续正文分开", () => {
    const output = parseToolOutput("path\tsrc/a.ts\nlines\t1-2\n\nhello");
    assert.equal(output.kind, "fields");
    if (output.kind !== "fields") return;
    assert.equal(output.rows[0]?.value, "src/a.ts");
    assert.equal(output.rest, "hello");
  });
});

describe("isSystemSectionList", () => {
  it("识别 id + text 分块", () => {
    assert.equal(
      isSystemSectionList([
        { id: "base", text: "hello" },
        { id: "rules", text: "r" },
      ]),
      true,
    );
  });

  it("整段字符串和普通消息数组不是分块", () => {
    assert.equal(isSystemSectionList("base\n\nrules"), false);
    assert.equal(isSystemSectionList([{ role: "user", content: "hi" }]), false);
    assert.equal(isSystemSectionList([]), false);
  });
});
