/**
 * done 正文比流式时间线长时，补上被截掉的尾巴；以及正文与时间线的回声去重。
 */
import assert from "node:assert/strict";
import type { ChatTimelineStep } from "@thinker-workbench/shared";
import { describe, it } from "vitest";
import { reconcileTimelineReply, stripTimelineEcho } from "../../../src/features/chat/timeline";

describe("reconcileTimelineReply", () => {
  it("把截断的最后一句补全", () => {
    const steps: ChatTimelineStep[] = [
      { id: "t1", kind: "text", text: "已记录。\n\n现在等你提供这次" },
    ];
    const next = reconcileTimelineReply(
      steps,
      "已记录。\n\n现在等你提供这次要改的具体内容，我再开始。",
    );
    const step = next[0];
    assert.equal(step?.kind, "text");
    if (step?.kind !== "text") return;
    assert.equal(step.text, "已记录。\n\n现在等你提供这次要改的具体内容，我再开始。");
  });

  it("正文对不上已有叙述时不改时间线", () => {
    const steps: ChatTimelineStep[] = [{ id: "t1", kind: "text", text: "另一段" }];
    const next = reconcileTimelineReply(steps, "完全不同的答复");
    assert.equal(next, steps);
  });
});

describe("stripTimelineEcho", () => {
  it("剔除时间线 transition 已呈现过的段落，保留最终答复", () => {
    const steps: ChatTimelineStep[] = [
      { id: "s1", kind: "transition", text: "逐文件分散修改，先处理每个文件的第一处改动" },
    ];
    const body = ["逐文件分散修改，先处理每个文件的第一处改动", "最终答复：全部改完了。"].join(
      "\n\n",
    );
    assert.equal(stripTimelineEcho(body, steps), "最终答复：全部改完了。");
  });

  it("正文段落是时间线叙述步前缀时同样剔除", () => {
    const steps: ChatTimelineStep[] = [
      { id: "t1", kind: "text", text: "继续对每个文件进行第二处、非连续位置的分散修改" },
    ];
    const body = "继续对每个文件进行第二处、非连续位置的分散修改";
    assert.equal(stripTimelineEcho(body, steps), "");
  });

  it("正文独有段落不受影响", () => {
    const steps: ChatTimelineStep[] = [{ id: "s1", kind: "transition", text: "先看看目录" }];
    const body = "第一段独立的结论。\n\n另一段结论。";
    assert.equal(stripTimelineEcho(body, steps), body);
  });

  it("时间线没有可展示文本时原样返回", () => {
    const steps: ChatTimelineStep[] = [
      { id: "s1", kind: "status", status: "thinking", active: false },
    ];
    assert.equal(stripTimelineEcho("正文", steps), "正文");
  });
});
