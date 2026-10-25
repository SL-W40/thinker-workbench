/**
 * onContextUsage：上限取主进程下发值、失败仍回包（UI 不能用 0 冒充「没占用」）。
 */
import assert from "node:assert/strict";
import {
  type ContextUsageSegmentId,
  type ContextUsageSnapshot,
  DEFAULT_CONTEXT_WINDOW,
  type UtilityContextUsage,
  type UtilityToParent,
} from "@thinker-workbench/shared";
import { beforeEach, describe, it, vi } from "vitest";
import { onContextUsage } from "../../src/host/handlers/contextUsage";

const state = vi.hoisted(() => ({
  /** 让 assembleContext 抛错，验证失败仍回包。 */
  failAssemble: false,
  posted: [] as UtilityToParent[],
}));

vi.mock("../../src/host/port", () => ({
  getParentPort: () => ({ postMessage: () => {}, on: () => {} }),
  postToParent: (message: UtilityToParent) => {
    state.posted.push(message);
  },
}));

vi.mock("../../src/context/assembleContext", () => ({
  assembleContext: async () => {
    if (state.failAssemble) throw new Error("assemble boom");
    const ids: ContextUsageSegmentId[] = [
      "system",
      "tools",
      "rules",
      "skills",
      "contextFiles",
      "memory",
      "conversation",
    ];
    const usage: ContextUsageSnapshot = {
      limit: 999,
      used: 42,
      segments: ids.map((id) => ({ id, tokens: 6 })),
    };
    return {
      system: "",
      systemSections: [],
      tools: [],
      toolsJson: "[]",
      messages: [],
      segments: usage.segments,
      usage,
    };
  },
}));

/** 构造一条主进程下发的估算请求。 */
function message(overrides?: Partial<UtilityContextUsage>): UtilityContextUsage {
  return {
    channel: "utility",
    kind: "contextUsage",
    requestId: "ctx_test",
    request: { messages: [{ role: "user", content: "hi" }] },
    ...overrides,
  };
}

/** 取最近一次 contextUsageResult。 */
function lastUsage() {
  const last = state.posted.at(-1);
  assert.ok(last && last.kind === "contextUsageResult", "应有一次回包");
  return last.usage;
}

describe("onContextUsage", () => {
  beforeEach(() => {
    state.failAssemble = false;
    state.posted = [];
  });

  it("主进程下发的上下文窗口优先于进程全局", async () => {
    await onContextUsage(message({ contextWindow: 1_049_000 }));
    const usage = lastUsage();
    assert.equal(usage.limit, 1_049_000);
    assert.equal(usage.used, 42);
    assert.equal(usage.error, undefined);
  });

  it("未下发窗口时回退默认窗口", async () => {
    await onContextUsage(message());
    assert.equal(lastUsage().limit, DEFAULT_CONTEXT_WINDOW);
  });

  it("组装异常仍回包并带 error，避免 UI 停在假的 0", async () => {
    state.failAssemble = true;
    await onContextUsage(message({ contextWindow: 200_000 }));
    const usage = lastUsage();
    assert.equal(usage.error, "assemble_failed");
    assert.equal(usage.limit, 200_000);
  });

  it("非数字窗口被忽略", async () => {
    await onContextUsage(message({ contextWindow: Number.NaN }));
    assert.equal(lastUsage().limit, DEFAULT_CONTEXT_WINDOW);
  });
});
