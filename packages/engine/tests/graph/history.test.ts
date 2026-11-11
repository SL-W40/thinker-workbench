/**
 * 新轮次的模型历史只保留有正文或附图的 user / assistant。
 */
import assert from "node:assert/strict";
import { describe, it } from "vitest";
import { projectModelHistory } from "../../src/graph/history";

describe("projectModelHistory", () => {
  it("丢掉 tool 角色和空正文，保留附图", () => {
    const history = projectModelHistory([
      { role: "user", content: "hello" },
      { role: "tool", content: "file contents" },
      { role: "assistant", content: "   " },
      { role: "assistant", content: "done" },
      {
        role: "user",
        content: "",
        images: [{ id: "img1", mime: "image/png", path: "a.png", width: 1, height: 1 }],
      },
    ]);
    assert.deepEqual(
      history.map((turn) => turn.role),
      ["user", "assistant", "user"],
    );
    assert.equal(history[0]?.content, "hello");
    assert.equal(history[1]?.content, "done");
    assert.ok(Array.isArray(history[2]?.content));
  });
});
