/**
 * chatWithFailover：取消时 model.chat output 含 partial 半截正文。
 */
import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, it, vi } from "vitest";
import { chatWithFailover, configureModelCatalog } from "../../src/model/catalog";
import * as openai from "../../src/model/openai";
import type { ChatModel } from "../../src/model/types";
import { configureAgentTrace } from "../../src/trace/emit";

type SpanEnd = {
  channel: string;
  kind: string;
  phase: string;
  spanId: string;
  status?: string;
  output?: { content?: string; partial?: boolean; reasoning?: string };
};

const ends: SpanEnd[] = [];

function installParentPort(): void {
  const proc = process as NodeJS.Process & {
    parentPort?: {
      postMessage: (message: unknown) => void;
      on: (event: "message", listener: (event: { data: unknown }) => void) => void;
    };
  };
  proc.parentPort = {
    postMessage: (message: unknown) => {
      const m = message as SpanEnd;
      if (m && m.kind === "span" && m.phase === "end") ends.push(m);
    },
    on: () => {},
  };
}

describe("chatWithFailover cancel partial", () => {
  beforeEach(() => {
    ends.length = 0;
    installParentPort();
    configureAgentTrace({
      enabled: true,
      sessionId: "sess_partial",
      runId: `run_${Date.now()}`,
      traceId: "tr_partial",
    });
    configureModelCatalog(
      {
        providers: [
          {
            id: "prov_t",
            label: "Test",
            apiKey: "sk-test",
            baseUrl: "http://example.test/v1",
          },
        ],
        models: [
          {
            id: "mdl_t",
            providerId: "prov_t",
            model: "m",
            label: "M",
            tags: ["general"],
            priority: 1,
            enabled: true,
          },
        ],
        selection: { mode: "manual", modelId: "mdl_t" },
        allowEmoji: false,
      },
      { mode: "manual", modelId: "mdl_t" },
    );
  });

  afterEach(() => {
    vi.restoreAllMocks();
    const proc = process as NodeJS.Process & { parentPort?: unknown };
    delete proc.parentPort;
  });

  it("取消前已流式的 content 写入 output.partial", async () => {
    const fake: ChatModel = {
      async chat(request, _signal) {
        request.onToken?.("half-", "reply");
        request.onToken?.("reply", "reply");
        throw new Error("Chat completion cancelled.");
      },
    };
    vi.spyOn(openai, "getChatModelFor").mockReturnValue(fake);

    await assert.rejects(
      () =>
        chatWithFailover(
          { messages: [{ role: "user", content: "x" }] },
          new AbortController().signal,
        ),
      /cancel/i,
    );

    const modelEnd = ends.find((e) => e.output && typeof e.output.partial === "boolean");
    assert.ok(modelEnd, "expected model.chat end with output");
    assert.equal(modelEnd?.status, "cancelled");
    assert.equal(modelEnd?.output?.partial, true);
    assert.equal(modelEnd?.output?.content, "half-reply");
  });
});
