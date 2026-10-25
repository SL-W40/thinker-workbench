/**
 * shell HITL 应合并进已有 Running 卡片，不另开一张。
 */
import assert from "node:assert/strict";
import type { ChatTimelineStep, HitlRequest } from "@thinker-workbench/shared";
import { describe, it } from "vitest";
import { applyHitlRequest, applyToolEvent } from "../../../src/features/chat/timeline";

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
    const s = next[0];
    assert.ok(s);
    assert.equal(s.kind, "tool");
    if (s.kind !== "tool") return;
    assert.equal(s.hitl?.hitlId, "hitl_1");
    assert.equal(s.command, 'Read-Host "请输入内容"');
  });

  it("研判理由写入 purpose，迟到的 tool start 仍保留审批卡", () => {
    const steps: ChatTimelineStep[] = [
      {
        id: "tl1",
        kind: "tool",
        name: "shell",
        command: "npx tsc --noEmit",
        phase: "start",
        active: true,
      },
    ];
    const req: HitlRequest = {
      hitlId: "hitl_3",
      kind: "shell_approval",
      threadId: "t",
      runId: "r",
      title: "Allow shell command?",
      body: "npx tsc --noEmit\n\n(typecheck)",
      payload: { command: "npx tsc --noEmit", reviewReason: "typecheck" },
      actions: [{ id: "allow", label: "Allow", style: "primary" }],
    };
    const withHitl = applyHitlRequest(steps, req);
    const card = withHitl[0];
    assert.equal(card?.kind, "tool");
    if (card?.kind !== "tool") return;
    assert.equal(card.hitl?.purpose, "typecheck");

    const afterStart = applyToolEvent(withHitl, {
      type: "tool",
      phase: "start",
      name: "shell",
      callId: "call_1",
      command: "npx tsc --noEmit",
      threadId: "t",
      runId: "r",
      ts: 1,
    });
    const kept = afterStart[0];
    assert.equal(kept?.kind, "tool");
    if (kept?.kind !== "tool") return;
    assert.equal(kept.hitl?.hitlId, "hitl_3");
    assert.equal(kept.hitl?.purpose, "typecheck");
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
    const s = next[1];
    assert.ok(s);
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
