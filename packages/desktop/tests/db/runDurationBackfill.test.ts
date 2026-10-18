/**
 * 历史耗时回填：按 traceId 聚合 spans 求墙钟，缺证据的消息保持未知。
 * 纯函数部分（DB 侧需 Electron 版 better-sqlite3，Vitest 加载不了，故不在这里开库）。
 */
import assert from "node:assert/strict";
import { describe, it } from "vitest";
import { buildOrphanHealPayload } from "../../src/db/orphanHeal";
import {
  mergeDurationIntoPayload,
  traceIdNeedingBackfill,
  wallClockMsFromSpans,
} from "../../src/db/runDurationMath";

describe("wallClockMsFromSpans", () => {
  it("取最早开始到最晚结束", () => {
    const ms = wallClockMsFromSpans([
      { startTs: 1_000, endTs: 1_500 },
      { startTs: 1_200, endTs: 3_000 },
      { startTs: 800, endTs: 900 },
    ]);
    assert.equal(ms, 2_200);
  });

  it("未结束的 span 用 start_ts 兜底", () => {
    const ms = wallClockMsFromSpans([
      { startTs: 1_000, endTs: null },
      { startTs: 2_000, endTs: 2_500 },
    ]);
    assert.equal(ms, 1_500);
  });

  it("无有效 span 返回 undefined（不猜）", () => {
    assert.equal(wallClockMsFromSpans([]), undefined);
    assert.equal(wallClockMsFromSpans([{ startTs: Number.NaN, endTs: null }]), undefined);
  });
});

describe("traceIdNeedingBackfill", () => {
  it("缺耗时且有 traceId → 需要查", () => {
    assert.equal(traceIdNeedingBackfill({ traceId: "tr-1" }), "tr-1");
    assert.equal(traceIdNeedingBackfill({ traceId: " tr-2 " }), "tr-2");
  });

  it("已有耗时（含 0）不回填，避免覆盖真实值", () => {
    assert.equal(traceIdNeedingBackfill({ traceId: "tr-1", durationMs: 0 }), undefined);
    assert.equal(traceIdNeedingBackfill({ traceId: "tr-1", durationMs: 12_345 }), undefined);
  });

  it("无 traceId 返回 undefined：留空展示「—」，不猜", () => {
    assert.equal(traceIdNeedingBackfill({ durationMs: undefined }), undefined);
    assert.equal(traceIdNeedingBackfill({ traceId: "  " }), undefined);
    assert.equal(traceIdNeedingBackfill(null), undefined);
  });
});

describe("mergeDurationIntoPayload", () => {
  it("浅合并：保留 usage / traceId / timeline", () => {
    const merged = mergeDurationIntoPayload(
      JSON.stringify({ traceId: "tr-1", usage: { inputTokens: 3 }, timeline: [{ id: "s1" }] }),
      1_234.6,
    );
    assert.ok(merged);
    const parsed = JSON.parse(merged as string) as Record<string, unknown>;
    assert.equal(parsed.durationMs, 1235);
    assert.deepEqual(parsed.usage, { inputTokens: 3 });
    assert.deepEqual(parsed.timeline, [{ id: "s1" }]);
    assert.equal(parsed.traceId, "tr-1");
  });

  it("耗时未知或坏 JSON 时不动数据", () => {
    assert.equal(mergeDurationIntoPayload(JSON.stringify({ traceId: "tr-1" }), undefined), null);
    assert.equal(mergeDurationIntoPayload("{not json", 100), null);
  });
});

describe("buildOrphanHealPayload（heal 不再破坏数据）", () => {
  it("保留 durationMs / usage / traceId，并补错误步", () => {
    const merged = buildOrphanHealPayload(
      JSON.stringify({
        traceId: "tr-9",
        durationMs: 7_300,
        usage: { inputTokens: 11 },
        timeline: [
          { id: "queued-wait", kind: "status" },
          { id: "s1", kind: "status", active: true },
        ],
      }),
      "msg-1",
      "Run cancelled.",
      "CANCELLED",
    );
    const parsed = JSON.parse(merged) as {
      pending: boolean;
      durationMs?: number;
      usage?: unknown;
      traceId?: string;
      timeline: Array<{ id?: string; kind?: string; active?: boolean; code?: string }>;
    };
    assert.equal(parsed.pending, false);
    assert.equal(parsed.durationMs, 7_300);
    assert.deepEqual(parsed.usage, { inputTokens: 11 });
    assert.equal(parsed.traceId, "tr-9");
    // 排队等待步被丢掉、活动 thinking 被关掉、错误步补上
    assert.deepEqual(
      parsed.timeline.map((s) => s.id),
      ["s1", "tl_heal_msg-1"],
    );
    assert.equal(parsed.timeline[0]?.active, false);
    assert.equal(parsed.timeline[1]?.code, "CANCELLED");
  });

  it("残留 runStartedAt 先结算再冻结", () => {
    const merged = buildOrphanHealPayload(
      JSON.stringify({ runStartedAt: Date.now() - 4_000 }),
      "msg-2",
      "Exited unexpectedly.",
      "PROCESS_EXIT",
    );
    const parsed = JSON.parse(merged) as { durationMs?: number; runStartedAt?: number };
    assert.equal((parsed.durationMs ?? 0) >= 4_000, true);
    assert.equal("runStartedAt" in parsed, false);
  });

  it("已有耗时时不覆盖", () => {
    const merged = buildOrphanHealPayload(
      JSON.stringify({ runStartedAt: Date.now() - 9_000, durationMs: 500 }),
      "msg-3",
      "Stopped.",
      "CANCELLED",
    );
    assert.equal((JSON.parse(merged) as { durationMs?: number }).durationMs, 500);
  });
});
