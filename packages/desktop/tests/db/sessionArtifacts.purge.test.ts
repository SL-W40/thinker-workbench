/**
 * purgeSessionArtifacts：标记已清，阻止迟到写入。
 */
import assert from "node:assert/strict";
import { afterEach, describe, it } from "vitest";
import {
  isSessionArtifactsPurged,
  purgeSessionArtifacts,
  resetPurgedSessionArtifactsForTests,
} from "../../src/db/sessionArtifacts";

describe("purgeSessionArtifacts", () => {
  afterEach(() => {
    resetPurgedSessionArtifactsForTests();
  });

  it("marks session purged even if Trace DB cleanup fails", () => {
    const id = `sess_purge_${Date.now()}`;
    assert.equal(isSessionArtifactsPurged(id), false);
    // 无完整 Electron dataDir 时 delete 可能失败，但标记必须先落下
    purgeSessionArtifacts({ sessionId: id, threadId: "th_x" });
    assert.equal(isSessionArtifactsPurged(id), true);
  });
});
