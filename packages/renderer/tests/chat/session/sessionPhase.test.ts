/**
 * 前台会话阶段：busy 与可恢复是同一次转移，不能互相擦掉。
 */
import assert from "node:assert/strict";
import { describe, it } from "vitest";
import {
  phaseAfterBusy,
  phaseAfterResume,
  sessionBusy,
  sessionResumeKind,
} from "../../../src/features/chat/session/sessionPhase";

describe("session phase", () => {
  it("离开 live 时保留已经记下的可恢复原因", () => {
    const live = phaseAfterBusy({ kind: "idle" }, true);
    const marked = phaseAfterResume(live, "crashed");
    const settled = phaseAfterBusy(marked, false);
    assert.equal(sessionBusy(settled), false);
    assert.equal(sessionResumeKind(settled), "crashed");
  });

  it("live 期间清掉 resume 标记仍保持 live", () => {
    const live = phaseAfterBusy({ kind: "resumable", reason: "cancelled" }, true);
    const cleared = phaseAfterResume(live, false);
    assert.equal(cleared.kind, "live");
    assert.equal(sessionResumeKind(cleared), null);
  });

  it("非 live 时 false 回到 idle", () => {
    const idle = phaseAfterResume({ kind: "resumable", reason: "cancelled" }, false);
    assert.deepEqual(idle, { kind: "idle" });
  });
});
