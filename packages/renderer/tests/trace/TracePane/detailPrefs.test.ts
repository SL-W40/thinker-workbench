/**
 * TracePane 详情偏好与纯函数（detailPrefs.ts，jsdom localStorage）。
 */
import assert from "node:assert/strict";
import type { TraceSpanRecord } from "@thinker-workbench/shared";
import { afterEach, describe, it } from "vitest";
import type { TraceRunGroup } from "../../../src/features/trace/callTreeModel";
import {
  DETAIL_WIDTH_DEFAULT,
  DETAIL_WIDTH_KEY,
  DETAIL_WIDTH_MAX,
  DETAIL_WIDTH_MIN,
  defaultSpanId,
  formatShortTs,
  latestRunId,
  readDetailCollapsed,
  readDetailWidth,
} from "../../../src/features/trace/TracePane/detailPrefs";

afterEach(() => {
  localStorage.removeItem(DETAIL_WIDTH_KEY);
  localStorage.removeItem("tw.trace.detailCollapsed");
});

function span(id: string): TraceSpanRecord {
  return {
    id,
    sessionId: "sess",
    name: "graph.node",
    runType: "chain",
    source: "app",
    startTs: 0,
  };
}

function group(runId: string, startTs: number): TraceRunGroup {
  return { runId, spans: [span(`${runId}-s`)], startTs };
}

describe("readDetailWidth", () => {
  it("falls back to default when unset or invalid", () => {
    assert.equal(readDetailWidth(), DETAIL_WIDTH_DEFAULT);
    localStorage.setItem(DETAIL_WIDTH_KEY, "not-a-number");
    assert.equal(readDetailWidth(), DETAIL_WIDTH_DEFAULT);
  });

  it("clamps into [min, max] and floors", () => {
    localStorage.setItem(DETAIL_WIDTH_KEY, "9999");
    assert.equal(readDetailWidth(), DETAIL_WIDTH_MAX);
    localStorage.setItem(DETAIL_WIDTH_KEY, "10");
    assert.equal(readDetailWidth(), DETAIL_WIDTH_MIN);
    localStorage.setItem(DETAIL_WIDTH_KEY, "412.7");
    assert.equal(readDetailWidth(), 412);
  });
});

describe("readDetailCollapsed", () => {
  it("reads the 1 flag", () => {
    assert.equal(readDetailCollapsed(), false);
    localStorage.setItem("tw.trace.detailCollapsed", "1");
    assert.equal(readDetailCollapsed(), true);
    localStorage.setItem("tw.trace.detailCollapsed", "0");
    assert.equal(readDetailCollapsed(), false);
  });
});

describe("defaultSpanId", () => {
  it("takes the first row id or null", () => {
    assert.equal(defaultSpanId([]), null);
    assert.equal(defaultSpanId([span("a"), span("b")]), "a");
  });
});

describe("latestRunId", () => {
  it("picks max startTs or null", () => {
    assert.equal(latestRunId([]), null);
    assert.equal(latestRunId([group("r1", 100), group("r2", 300), group("r3", 200)]), "r2");
  });
});

describe("formatShortTs", () => {
  it("formats a timestamp without throwing", () => {
    const label = formatShortTs(Date.UTC(2026, 0, 2, 3, 4));
    assert.ok(label.length > 0);
    assert.notEqual(label, "0");
  });
});
