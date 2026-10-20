/**
 * openai SSE 读取与非流式解析（engine/src/model/openai/sse.ts）。
 */
import assert from "node:assert/strict";
import { describe, it } from "vitest";
import { parseNonStreamMessage, readChatSse } from "../../../src/model/openai/sse";

function sseStream(chunks: string[]): ReadableStream<Uint8Array> {
  const enc = new TextEncoder();
  let i = 0;
  return new ReadableStream<Uint8Array>({
    pull(controller) {
      if (i >= chunks.length) {
        controller.close();
        return;
      }
      controller.enqueue(enc.encode(chunks[i]));
      i += 1;
    },
  });
}

function controller(): AbortController {
  return new AbortController();
}

describe("readChatSse", () => {
  it("accumulates content and usage across chunks", async () => {
    const tokens: Array<[string, string | undefined]> = [];
    const result = await readChatSse(
      sseStream([
        'data: {"id":"resp-1","choices":[{"delta":{"content":"hel"}}]}\n\n',
        'data: {"choices":[{"delta":{"content":"lo"}}]}\n\ndata: {"usage":{"prompt_tokens":3,"completion_tokens":2}}\n\n',
        "data: [DONE]\n\n",
      ]),
      (text, channel) => tokens.push([text, channel]),
      controller().signal,
    );
    assert.equal(result.content, "hello");
    assert.deepEqual(
      tokens.map(([text]) => text),
      ["hel", "lo"],
    );
    assert.deepEqual(result.usage, {
      inputTokens: 3,
      outputTokens: 2,
      cacheReadTokens: 0,
      cacheWriteTokens: 0,
      reasoningTokens: 0,
    });
    assert.equal(result.providerResponseId, "resp-1");
  });

  it("separates reasoning channel and merges tool_calls by index", async () => {
    const tokens: Array<[string, string | undefined]> = [];
    const result = await readChatSse(
      sseStream([
        'data: {"choices":[{"delta":{"reasoning_content":"think"}}]}\n\n',
        'data: {"choices":[{"delta":{"tool_calls":[{"index":0,"id":"c1","function":{"name":"read","arguments":"{\\"a\\":"}}]}}]}\n\n',
        'data: {"choices":[{"delta":{"tool_calls":[{"index":0,"function":{"arguments":"1}"}}]}}]}\n\n',
      ]),
      (text, channel) => tokens.push([text, channel]),
      controller().signal,
    );
    assert.equal(result.reasoning, "think");
    assert.deepEqual(tokens[0], ["think", "thinking"]);
    assert.equal(result.toolCalls.length, 1);
    assert.equal(result.toolCalls[0]?.id, "c1");
    assert.equal(result.toolCalls[0]?.function.name, "read");
    assert.equal(result.toolCalls[0]?.function.arguments, '{"a":1}');
  });

  it("skips malformed data lines instead of throwing", async () => {
    const result = await readChatSse(
      sseStream(["data: not-json\n\n", "data: [1,2]\n\n", 'data: {"choices":[]}\n\n']),
      undefined,
      controller().signal,
    );
    assert.equal(result.content, "");
    assert.deepEqual(result.toolCalls, []);
  });

  it("throws when aborted before reading", async () => {
    const ac = controller();
    ac.abort();
    await assert.rejects(
      () => readChatSse(sseStream(["data: {}\n\n"]), undefined, ac.signal),
      /cancelled/i,
    );
  });
});

describe("parseNonStreamMessage", () => {
  it("reads content, reasoning and filters invalid tool_calls", () => {
    const result = parseNonStreamMessage({
      content: "hi",
      reasoning: "why",
      tool_calls: [
        { id: "t1", type: "function", function: { name: "read", arguments: "{}" } },
        // 缺 id / type 不是 function / 缺 name → 丢弃（注意空字符串 id 仍算 string，不会被过滤）
        { type: "function", function: { name: "bad", arguments: "{}" } },
        { id: "t2", type: "other", function: { name: "bad", arguments: "{}" } },
        { id: "t3", type: "function", function: { arguments: "{}" } },
      ] as never,
    });
    assert.equal(result.content, "hi");
    assert.equal(result.reasoning, "why");
    assert.equal(result.toolCalls.length, 1);
    assert.equal(result.toolCalls[0]?.id, "t1");
  });

  it("defaults content and tool_calls", () => {
    const result = parseNonStreamMessage({});
    assert.equal(result.content, "");
    assert.deepEqual(result.toolCalls, []);
    assert.equal(result.reasoning, undefined);
  });
});
