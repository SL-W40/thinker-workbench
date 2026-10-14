/**
 * 简易 unified diff：相同文本、增删、上下文、超长截断。
 */
import assert from "node:assert/strict";
import { describe, it } from "vitest";
import { buildUnifiedDiff } from "../../../src/tools/shared/diff";

describe("buildUnifiedDiff", () => {
  it("全文相同返回空串", () => {
    assert.equal(buildUnifiedDiff("a.txt", "same\n", "same\n"), "");
  });

  it("新建文件只有新增行，且空串不算一行", () => {
    const diff = buildUnifiedDiff("new.txt", "", "hello\n");
    assert.match(diff, /^--- a\/new\.txt\n\+\+\+ b\/new\.txt\n@@ -1,0 \+1,2 @@\n\+hello\n\+$/);
  });

  it("中间改一行时保留最多 3 行上下文", () => {
    const before = ["a", "b", "c", "d", "e", "f", "g"].join("\n");
    const after = ["a", "b", "c", "D", "e", "f", "g"].join("\n");
    const diff = buildUnifiedDiff("f.txt", before, after);
    assert.match(diff, /@@ -1,7 \+1,7 @@/);
    assert.match(diff, /-d\n\+D/);
    assert.match(diff, / c\n-d/);
    assert.match(diff, /\+D\n e/);
  });

  it("超过 2000 行的 hunk 截断并加标记", () => {
    const before = "";
    const after = Array.from({ length: 2001 }, (_, i) => `L${i}`).join("\n");
    const diff = buildUnifiedDiff("big.txt", before, after);
    const body = diff.split("\n").slice(3);
    assert.equal(body.filter((line) => line.startsWith("+")).length, 2000);
    assert.equal(body.at(-1), "\\ Diff truncated at 2000 lines");
  });
});
