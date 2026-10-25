/**
 * Trace 顶部卡片的字段名和去重。
 */
import assert from "node:assert/strict";
import type { TraceSpanRecord } from "@thinker-workbench/shared";
import { describe, it } from "vitest";
import {
  buildSpanOverview,
  englishLabel,
  fieldLabel,
  omitOutputOverview,
} from "../../../src/features/trace/overviewModel";

function span(partial: Partial<TraceSpanRecord> = {}): TraceSpanRecord {
  return {
    id: "span_1",
    sessionId: "ses_1",
    name: "model.chat",
    runType: "llm",
    source: "agent",
    status: "ok",
    startTs: 1,
    ...partial,
  };
}

describe("englishLabel", () => {
  it("已知字段用当前语言的单词", () => {
    assert.equal(fieldLabel("en", "providerResponseId"), "Provider response ID");
    assert.equal(fieldLabel("zh", "inputTokens"), "输入");
    assert.equal(fieldLabel("en", "sessionTitle"), "Session title");
  });

  it("未知驼峰拆成单词", () => {
    assert.equal(englishLabel("cacheHitRate"), "Cache hit rate");
  });
});

describe("buildSpanOverview", () => {
  it("合并 attrs 和 output 用量，模型号只出现一次", () => {
    const model = buildSpanOverview(
      span({
        endTs: 2501,
        attrs: { turn: 1, modelId: "mdl_a", sessionTitle: "Tour" },
      }),
      {
        modelId: "mdl_a",
        providerResponseId: "resp_1",
        partial: false,
        usage: { inputTokens: 10, outputTokens: 2 },
      },
    );
    assert.deepEqual(model.chips, ["Model call", "From the agent", "2.5 s", "Chat turn 1"]);
    assert.deepEqual(
      model.rows.map((row) => row.label),
      ["Model ID", "Session ID", "Session title", "Provider response ID"],
    );
    assert.equal(
      model.rows.some((row) => row.label === "Chat turn"),
      false,
    );
    assert.deepEqual(
      model.stats.map((stat) => stat.label),
      ["Input", "Output"],
    );
    assert.equal(model.partial, false);
  });

  it("中文模式用中文单词", () => {
    const model = buildSpanOverview(
      span({
        endTs: 2501,
        attrs: { turn: 1, threadId: "thread_a", background: true },
      }),
      { usage: { inputTokens: 10 } },
      "zh",
    );
    assert.deepEqual(model.chips, ["模型调用", "来自代理", "2.5 秒", "对话第 1 轮"]);
    assert.equal(model.rows.find((row) => row.value === "thread_a")?.label, "会话线程 ID");
    assert.equal(model.rows.find((row) => row.value === "是")?.label, "后台任务");
    assert.equal(model.stats[0]?.label, "输入");
  });

  it("不展示候选序号，模型和工作区带名称", () => {
    const model = buildSpanOverview(
      span({
        attrs: { index: 0, modelId: "mdl_a", workspaceId: "ws_a" },
      }),
      undefined,
      "zh",
      { models: { mdl_a: "GPT" }, workspaces: { ws_a: "工作台" } },
    );
    assert.equal(
      model.rows.some((row) => row.value === "0"),
      false,
    );
    assert.equal(model.rows.find((row) => row.value === "mdl_a")?.name, "GPT");
    assert.equal(model.rows.find((row) => row.value === "ws_a")?.name, "工作台");
  });
});

describe("omitOutputOverview", () => {
  it("去掉已经放到顶部的字段", () => {
    assert.deepEqual(
      omitOutputOverview({
        modelId: "mdl_a",
        providerResponseId: "resp_1",
        partial: false,
        usage: { inputTokens: 1 },
        content: "hi",
      }),
      { content: "hi" },
    );
  });
});
