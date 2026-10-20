/**
 * 终态事件结算（engine/src/runtime/terminal.ts）。
 */
import assert from "node:assert/strict";
import { describe, it } from "vitest";
import { emitTerminal, terminalExtras } from "../../src/runtime/terminal";
import { bookUsage, createUsageLedger } from "../../src/runtime/usageLedger";

const now = 10_000;

describe("terminalExtras", () => {
  it("omits durationMs when the run never started (clock === null)", () => {
    const extras = terminalExtras(now, null);
    assert.equal("durationMs" in extras, false);
    assert.equal("usage" in extras, false);
  });

  it("adds durationMs = elapsed + queuedMs", () => {
    const extras = terminalExtras(now, { startedAt: 9_000, queuedMs: 700 });
    assert.equal(extras.durationMs, 1_700);
  });

  it("omits usage when the ledger has no call", () => {
    const extras = terminalExtras(now, null, createUsageLedger());
    assert.equal("usage" in extras, false);
  });

  it("settles usage once at least one call was booked", () => {
    const ledger = createUsageLedger();
    bookUsage(
      ledger,
      {
        inputTokens: 10,
        outputTokens: 5,
        cacheReadTokens: 0,
        cacheWriteTokens: 0,
        reasoningTokens: 0,
      },
      false,
    );
    const official = terminalExtras(now, null, ledger);
    assert.ok(official.usage);
    // 官方值不标 estimated
    assert.equal("usageEstimated" in official, false);

    const ledger2 = createUsageLedger();
    bookUsage(
      ledger2,
      {
        inputTokens: 1,
        outputTokens: 1,
        cacheReadTokens: 0,
        cacheWriteTokens: 0,
        reasoningTokens: 0,
      },
      true,
    );
    assert.equal(terminalExtras(now, null, ledger2).usageEstimated, true);
  });
});

describe("emitTerminal", () => {
  it("merges extras into the event and emits once", () => {
    const seen: Array<Record<string, unknown>> = [];
    // emitTerminal 内部取 Date.now()，故锚点相对当前时间
    emitTerminal(
      (e) => seen.push(e as unknown as Record<string, unknown>),
      { type: "done", threadId: "t", runId: "r", ts: now, text: "hi" },
      { startedAt: Date.now() - 1_000, queuedMs: 250 },
    );
    assert.equal(seen.length, 1);
    assert.equal(seen[0]?.type, "done");
    assert.ok((seen[0]?.durationMs as number) >= 1_250);
    assert.ok((seen[0]?.durationMs as number) < 5_000);
  });
});
