/**
 * catalog 用量与 Trace 载荷组装（engine/src/model/catalog/usage.ts）。
 */
import assert from "node:assert/strict";
import { describe, it } from "vitest";
import { modelChatInputSummary, modelChatOutput } from "../../../src/model/catalog/usage";
import type { ChatRequest } from "../../../src/model/types";

function request(over: Partial<ChatRequest> = {}): ChatRequest {
  return { messages: [{ role: "user", content: "hi" }], ...over };
}

describe("modelChatInputSummary", () => {
  it("summarizes messages / tools / last content", () => {
    const summary = modelChatInputSummary(
      request({
        system: "SYS",
        tools: [{ type: "function", function: { name: "read" } }] as never,
      }),
    );
    assert.equal(summary.messageCount, 1);
    assert.equal(summary.lastRole, "user");
    assert.equal(summary.lastContentPreview, "hi");
    assert.equal(summary.system, "SYS");
    assert.ok(Array.isArray(summary.tools));
  });

  it("prefers systemSections and truncates preview at 120 chars", () => {
    const long = "x".repeat(200);
    const summary = modelChatInputSummary(
      request({
        messages: [{ role: "user", content: long }],
        systemSections: ["A", "B"],
      }),
    );
    assert.deepEqual(summary.system, ["A", "B"]);
    assert.equal((summary.lastContentPreview as string).length, 120);
  });

  it("joins text parts when content is an array", () => {
    const summary = modelChatInputSummary(
      request({
        messages: [
          {
            role: "user",
            content: [
              { type: "text", text: "a" },
              { type: "text", text: "b" },
            ],
          },
        ],
      } as never),
    );
    assert.equal(summary.lastContentPreview, "a\nb");
  });
});

describe("modelChatOutput", () => {
  it("uses result content when present", () => {
    const output = modelChatOutput({
      modelId: "m1",
      result: {
        content: "done",
        reasoning: "why",
        toolCalls: [],
        usage: {
          inputTokens: 1,
          outputTokens: 2,
          cacheReadTokens: 0,
          cacheWriteTokens: 0,
          reasoningTokens: 0,
        },
        providerResponseId: "resp",
      },
      replyBuf: "",
      thinkingBuf: "",
      partial: false,
    });
    assert.equal(output.content, "done");
    assert.equal(output.reasoning, "why");
    assert.equal(output.partial, false);
    assert.equal(output.contentChars, 4);
    assert.equal(output.providerResponseId, "resp");
    assert.ok(output.usage);
  });

  it("falls back to stream buffers and marks partial", () => {
    const output = modelChatOutput({
      modelId: "m1",
      result: null,
      replyBuf: "half",
      thinkingBuf: "think",
      partial: true,
    });
    assert.equal(output.content, "half");
    assert.equal(output.reasoning, "think");
    assert.equal(output.partial, true);
    assert.deepEqual(output.toolCalls, []);
    assert.equal(output.providerResponseId, undefined);
    assert.equal(output.usage, undefined);
  });
});
