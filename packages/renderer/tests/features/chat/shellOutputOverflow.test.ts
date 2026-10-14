/**
 * Shell 卡片折叠行数启发。
 */
import assert from "node:assert/strict";
import { describe, it } from "vitest";
import {
  SHELL_COLLAPSED_LINES,
  shellOutputLikelyOverflows,
} from "../../../src/features/chat/shellOutputOverflow";

describe("shellOutputLikelyOverflows", () => {
  it("空 / 不超过折叠行数 → false", () => {
    assert.equal(shellOutputLikelyOverflows(""), false);
    assert.equal(shellOutputLikelyOverflows("one line"), false);
    assert.equal(
      shellOutputLikelyOverflows(["a", "b", "c", "d"].join("\n"), SHELL_COLLAPSED_LINES),
      false,
    );
  });

  it("超过折叠行数 → true（忽略尾部空行）", () => {
    assert.equal(
      shellOutputLikelyOverflows(["a", "b", "c", "d", "e"].join("\n"), SHELL_COLLAPSED_LINES),
      true,
    );
    assert.equal(shellOutputLikelyOverflows("a\nb\nc\nd\ne\n\n", 4), true);
  });
});
