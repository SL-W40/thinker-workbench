/**
 * 模型补全证据：providerResponseId / reasoning（SSE 与 JSON）。
 */
import assert from "node:assert/strict";
import { afterEach, describe, it, vi } from "vitest";
import { createOpenAIModel } from "../../src/model/openai";
import * as httpFetch from "../../src/model/httpFetch";

function sseBody(chunks: string[]): ReadableStream<Uint8Array> {
  const enc = new TextEncoder();
  let i = 0;
  return new ReadableStream({
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

describe("openai chat evidence", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("SSE 提取 id 与 reasoning_content", async () => {
    vi.spyOn(httpFetch, "modelFetch").mockResolvedValue({
      ok: true,
      status: 200,
      headers: new Headers({ "content-type": "text/event-stream" }),
      body: sseBody([
        'data: {"id":"chatcmpl-abc","choices":[{"delta":{"reasoning_content":"think "}}]}\n\n',
        'data: {"id":"chatcmpl-abc","choices":[{"delta":{"content":"hello"}}]}\n\n',
        "data: [DONE]\n\n",
      ]),
    } as unknown as Response);

    const model = createOpenAIModel({
      apiKey: "sk-test",
      baseUrl: "http://example.test/v1",
      model: "gpt-test",
    });
    const tokens: Array<{ text: string; ch?: string }> = [];
    const result = await model.chat(
      {
        messages: [{ role: "user", content: "hi" }],
        onToken: (text, channel) => {
          tokens.push({ text, ch: channel });
        },
      },
      new AbortController().signal,
    );

    assert.equal(result.providerResponseId, "chatcmpl-abc");
    assert.equal(result.reasoning, "think ");
    assert.equal(result.content, "hello");
    assert.ok(tokens.some((t) => t.ch === "thinking"));
  });

  it("非流式 JSON 提取 id 与 reasoning", async () => {
    vi.spyOn(httpFetch, "modelFetch").mockResolvedValue({
      ok: true,
      status: 200,
      headers: new Headers({ "content-type": "application/json" }),
      json: async () => ({
        id: "chatcmpl-json-1",
        choices: [
          {
            message: {
              content: "done",
              reasoning_content: "why",
            },
          },
        ],
        usage: {
          prompt_tokens: 1,
          completion_tokens: 2,
          total_tokens: 3,
        },
      }),
    } as unknown as Response);

    const model = createOpenAIModel({
      apiKey: "sk-test",
      baseUrl: "http://example.test/v1",
      model: "gpt-test",
    });
    const result = await model.chat(
      { messages: [{ role: "user", content: "hi" }] },
      new AbortController().signal,
    );

    assert.equal(result.providerResponseId, "chatcmpl-json-1");
    assert.equal(result.reasoning, "why");
    assert.equal(result.content, "done");
  });
});
