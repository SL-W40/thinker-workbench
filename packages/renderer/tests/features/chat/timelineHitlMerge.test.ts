/**
 * shell HITL 应合并进已有 Running 卡片，不另开一张。
 */
import assert from "node:assert/strict";
import { describe, it } from "vitest";
import type { ChatTimelineStep, HitlRequest } from "@thinker-workbench/shared";
import { applyHitlRequest } from "../../../src/features/chat/timelineModel";

describe("applyHitlRequest merge", () => {
  it("shell_approval 挂到已有 Running shell 卡", () => {
    const steps: ChatTimelineStep[] = [
      {
        id: "tl1",
        kind: "tool",
        name: "shell",
        command: 'Read-Host "请输入内容"',
        phase: "start",
        active: true,
      },
    ];
    const req: HitlRequest = {
      hitlId: "hitl_1",
      kind: "shell_approval",
      threadId: "t",
      runId: "r",
      title: "Allow shell command?",
      body: 'Read-Host "请输入内容"',
      payload: { command: 'Read-Host "请输入内容"' },
      actions: [
        { id: "allow", label: "Allow", style: "primary" },
        { id: "deny", label: "Deny", style: "danger" },
      ],
    };
    const next = applyHitlRequest(steps, req);
    assert.equal(next.length, 1);
    const s = next[0]!;
    assert.equal(s.kind, "tool");
    if (s.kind !== "tool") return;
    assert.equal(s.hitl?.hitlId, "hitl_1");
    assert.equal(s.command, 'Read-Host "请输入内容"');
  });

  it("shell_write_approval 挂到已有 shell_write 卡并带上父命令", () => {
    const steps: ChatTimelineStep[] = [
      {
        id: "tl0",
        kind: "tool",
        name: "shell",
        command: 'Read-Host "请输入内容"',
        sessionId: "term_x",
        phase: "end",
        active: false,
        backgrounded: true,
      },
      {
        id: "tl1",
        kind: "tool",
        name: "shell_write",
        phase: "start",
        active: true,
        sessionId: "term_x",
      },
    ];
    const req: HitlRequest = {
      hitlId: "hitl_2",
      kind: "shell_write_approval",
      threadId: "t",
      runId: "r",
      title: "Allow writing?",
      body: "y",
      payload: {
        sessionId: "term_x",
        dataPreview: "y",
        parentCommand: 'Read-Host "请输入内容"',
      },
      actions: [{ id: "allow", label: "Allow", style: "primary" }],
    };
    const next = applyHitlRequest(steps, req);
    assert.equal(next.length, 2);
    const s = next[1]!;
    assert.equal(s.kind, "tool");
    if (s.kind !== "tool") return;
    assert.equal(s.name, "shell_write");
    assert.equal(s.hitl?.hitlId, "hitl_2");
    assert.equal(s.hitl?.parentCommand, 'Read-Host "请输入内容"');
    assert.equal(s.hitl?.dataPreview, "y");
    assert.match(s.command ?? "", /Read-Host/);
    assert.match(s.command ?? "", /← y/);
  });
});
