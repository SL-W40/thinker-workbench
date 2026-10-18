/**
 * 承上启下小结（[NEXT] 标记行）：
 * 模型在调工具前写 `[NEXT] 一句话` → 解析为独立 transition 步、正文剥离；
 * 没写标记 → 无小结；标记被 token 切开 → 按未完结行续写。
 */
import assert from "node:assert/strict";
import type { ChatTimelineStep } from "@thinker-workbench/shared";
import { describe, it } from "vitest";
import {
  appendReplyText,
  appendThinkingText,
  applyToolEvent,
  extractTransitionLine,
  stripTransitionLines,
} from "../../../src/features/chat/timelineModel";

const toolStart = (callId: string) =>
  ({
    type: "tool",
    phase: "start",
    name: "read_file",
    callId,
    threadId: "th",
    runId: "r",
    ts: Date.now(),
  }) as const;

function kinds(steps: ChatTimelineStep[]): string[] {
  return steps.map((s) => s.kind);
}

describe("extractTransitionLine / stripTransitionLines", () => {
  it("剥离标记行并取出内容；内容截到 50 字", () => {
    const long = "一".repeat(60);
    const r = extractTransitionLine(`前文。\n[NEXT] ${long}\n后文。`);
    assert.equal(r.transition, `${"一".repeat(49)}…`);
    assert.ok(!r.cleaned.includes("[NEXT]"));
    assert.ok(r.cleaned.includes("前文。"));
    assert.ok(r.cleaned.includes("后文。"));
  });

  it("无标记 → 原样返回", () => {
    assert.equal(stripTransitionLines("普通正文。"), "普通正文。");
    assert.equal(extractTransitionLine("普通正文。").transition, undefined);
  });
});

describe("appendReplyText 解析 [NEXT] 标记行", () => {
  it("标记行整体到达 → 转成 transition 步", () => {
    let steps: ChatTimelineStep[] = [];
    steps = appendThinkingText(steps, "第一轮思考");
    steps = appendReplyText(steps, "[NEXT] 定位到问题：切分判定反了。");
    assert.deepEqual(kinds(steps), ["status", "transition"]);
    const t = steps[1];
    assert.ok(t.kind === "transition");
    assert.equal(t.text, "定位到问题：切分判定反了。");
  });

  it("标记被 token 切开（[NE + XT] 内容）→ 补全后转换", () => {
    let steps: ChatTimelineStep[] = [];
    steps = appendThinkingText(steps, "思考");
    steps = appendReplyText(steps, "[NE");
    assert.equal(kinds(steps).includes("transition"), false);
    steps = appendReplyText(steps, "XT] 结论是A方案更优");
    assert.deepEqual(kinds(steps), ["status", "transition"]);
    const t = steps[1];
    assert.ok(t.kind === "transition");
    assert.equal(t.text, "结论是A方案更优");
  });

  it("标记行之后同一片段带换行的叙述 → 换行后另开 text 步", () => {
    let steps: ChatTimelineStep[] = [];
    steps = appendThinkingText(steps, "思考");
    steps = appendReplyText(steps, "[NEXT] 转向：改用方案B。\n具体原因是配置缺失");
    assert.deepEqual(kinds(steps), ["status", "transition", "text"]);
    const t = steps[1];
    assert.ok(t.kind === "transition");
    assert.equal(t.text, "转向：改用方案B。");
    const x = steps[2];
    assert.ok(x.kind === "text");
    assert.equal(x.text, "具体原因是配置缺失");
  });

  it("标记行流式续写跨片段（无换行）→ 内容逐步补全", () => {
    let steps: ChatTimelineStep[] = [];
    steps = appendThinkingText(steps, "思考");
    steps = appendReplyText(steps, "[NEXT] 结论：");
    steps = appendReplyText(steps, "缓存未失效");
    const t = steps[1];
    assert.ok(t.kind === "transition");
    assert.equal(t.text, "结论：缓存未失效");
  });

  it("无标记 → 不产生 transition 步（普通叙述保持 text）", () => {
    let steps: ChatTimelineStep[] = [];
    steps = appendThinkingText(steps, "思考");
    steps = appendReplyText(steps, "我需要先看一下配置文件");
    assert.deepEqual(kinds(steps), ["status", "text"]);
  });

  it("transition 后接工具，随后新一轮叙述正常开 text 步", () => {
    let steps: ChatTimelineStep[] = [];
    steps = appendThinkingText(steps, "思考");
    steps = appendReplyText(steps, "[NEXT] 结论：入口在 agent.ts");
    steps = applyToolEvent(steps, toolStart("c1"));
    steps = appendReplyText(steps, "读完发现还有一层封装");
    assert.deepEqual(kinds(steps), ["status", "transition", "tool", "text"]);
  });
});

describe("气泡正文剥离", () => {
  it("stripTransitionLines 幂等且保留其余内容", () => {
    const raw = "[NEXT] 结论A\n正文第一段。\n正文第二段。";
    const once = stripTransitionLines(raw);
    assert.equal(once, "正文第一段。\n正文第二段。");
    assert.equal(stripTransitionLines(once), once);
  });

  it("未完结的标记片段不被误删", () => {
    assert.equal(stripTransitionLines("正文 [NE"), "正文 [NE");
  });
});
