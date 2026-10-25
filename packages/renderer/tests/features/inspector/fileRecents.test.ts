/**
 * 最近文件列表（fileRecents.ts）：pruneFileRecents 清理已删除路径。
 */
import assert from "node:assert/strict";
import { afterEach, describe, it } from "vitest";
import {
  loadFileRecents,
  pruneFileRecents,
  pushFileRecent,
} from "../../../src/features/inspector/fileRecents";

const WS = "ws-test-prune";

afterEach(() => {
  localStorage.clear();
});

describe("pruneFileRecents", () => {
  it("drops paths missing from the candidate list and persists the result", () => {
    pushFileRecent(WS, "a.ts");
    pushFileRecent(WS, "b.ts");
    const recents = loadFileRecents(WS);
    assert.deepEqual(recents, ["b.ts", "a.ts"]);

    const pruned = pruneFileRecents(WS, recents, ["a.ts"]);
    assert.deepEqual(pruned, ["a.ts"]);
    assert.deepEqual(loadFileRecents(WS), ["a.ts"]);
  });

  it("returns the same array when nothing to prune", () => {
    pushFileRecent(WS, "a.ts");
    const recents = loadFileRecents(WS);
    assert.equal(pruneFileRecents(WS, recents, ["a.ts"]), recents);
  });

  it("matches backslash paths against forward-slash candidates", () => {
    const pruned = pruneFileRecents(WS, ["a\\b.ts"], ["a/b.ts"]);
    assert.deepEqual(pruned, ["a\\b.ts"]);
  });

  it("prunes everything against an empty candidate list", () => {
    pushFileRecent(WS, "a.ts");
    const pruned = pruneFileRecents(WS, ["a.ts", "b.ts"], []);
    assert.deepEqual(pruned, []);
    assert.deepEqual(loadFileRecents(WS), []);
  });

  it("skips persistence when workspaceId is null", () => {
    const pruned = pruneFileRecents(null, ["a.ts"], []);
    assert.deepEqual(pruned, []);
  });
});
