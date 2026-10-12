/**
 * 子代理路径：runTool 前后显式打 tool:* span。
 */
import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, it, vi } from "vitest";
import * as catalog from "../../../src/model/catalog";
import { configureAgentTrace } from "../../../src/trace/emit";
import * as runToolMod from "../../../src/tools/runTool";
import { runChildAgent } from "../../../src/tools/task/execute";

type SpanStart = {
  channel: string;
  kind: string;
  phase: string;
  span: { name: string; attrs?: Record<string, unknown> };
};

const starts: SpanStart[] = [];

function installParentPort(): void {
  const proc = process as NodeJS.Process & {
    parentPort?: {
      postMessage: (message: unknown) => void;
      on: (event: "message", listener: (event: { data: unknown }) => void) => void;
    };
  };
  proc.parentPort = {
    postMessage: (message: unknown) => {
      const m = message as SpanStart;
      if (m && m.kind === "span" && m.phase === "start") starts.push(m);
    },
    on: () => {},
  };
}

describe("runChildAgent tool spans", () => {
  beforeEach(() => {
    starts.length = 0;
    installParentPort();
    configureAgentTrace({
      enabled: true,
      sessionId: "sess_child",
      runId: `run_${Date.now()}`,
      traceId: "tr_child",
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    const proc = process as NodeJS.Process & { parentPort?: unknown };
    delete proc.parentPort;
  });

  it("一轮 tool 调用产生 tool:list_dir span 且 attrs.turn=1", async () => {
    let n = 0;
    vi.spyOn(catalog, "chatWithFailover").mockImplementation(async () => {
      n += 1;
      if (n === 1) {
        return {
          content: "",
          toolCalls: [
            {
              id: "call_1",
              type: "function" as const,
              function: { name: "list_dir", arguments: '{"path":"."}' },
            },
          ],
        };
      }
      return { content: "done report", toolCalls: [] };
    });
    vi.spyOn(runToolMod, "runTool").mockResolvedValue({
      ok: true,
      output: '["a.ts"]',
    });

    const result = await runChildAgent({
      systemBody: "You are explorer.",
      prompt: "list files",
      readonly: true,
      signal: new AbortController().signal,
      taskId: "task_span_1",
      subagent: "explorer",
    });

    assert.equal(result.ok, true);
    const toolSpan = starts.find((s) => s.span.name === "tool:list_dir");
    assert.ok(toolSpan, "expected tool:list_dir span");
    assert.equal(toolSpan!.span.attrs?.turn, 1);
    assert.equal(toolSpan!.span.attrs?.callId, "call_1");
  });
});
