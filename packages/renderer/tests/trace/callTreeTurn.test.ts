/**
 * Call Tree：attrs.turn → spanTurn。
 */
import assert from "node:assert/strict";
import type { TraceSpanRecord } from "@thinker-workbench/shared";
import { describe, it } from "vitest";
import { spanTurn } from "../../src/features/trace/callTreeModel";

function span(attrs?: Record<string, unknown>): TraceSpanRecord {
  return {
    spanId: "s",
    sessionId: "sess",
    name: "model.chat",
    kind: "model",
    source: "agent",
    startTs: 1,
    attrs,
  };
}

describe("spanTurn", () => {
  it("读取正整数 turn", () => {
    assert.equal(spanTurn(span({ turn: 3 })), 3);
    assert.equal(spanTurn(span({ turn: "2" })), 2);
  });

  it("非法值返回 undefined", () => {
    assert.equal(spanTurn(span()), undefined);
    assert.equal(spanTurn(span({ turn: 0 })), undefined);
    assert.equal(spanTurn(span({ turn: -1 })), undefined);
    assert.equal(spanTurn(span({ turn: "x" })), undefined);
  });
});
