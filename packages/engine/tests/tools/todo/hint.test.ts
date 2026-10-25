/**
 * todo 工具的时间线提示（hint.ts）：动作识别、读 / 写、条目数与文案截断。
 */
import assert from "node:assert/strict";
import { describe, it } from "vitest";
import { TODO_HINT_LABEL_LIMIT, todoUiHint } from "../../../src/tools/todo/hint";

describe("todoUiHint", () => {
  it("list 是只读动作，不带条目", () => {
    assert.deepEqual(todoUiHint({ action: "list" }), { action: "list" });
  });

  it("写入动作带上条目数与文案", () => {
    const hint = todoUiHint({
      action: "complete",
      items: [
        { id: "t1", label: "搭骨架" },
        { id: "t2", label: "跑起来" },
      ],
    });
    assert.equal(hint?.action, "complete");
    assert.equal(hint?.count, 2);
    assert.deepEqual(hint?.labels, ["搭骨架", "跑起来"]);
  });

  it("条目文案按上限截断，超出部分由 count 折算", () => {
    const items = Array.from({ length: 5 }, (_, i) => ({ id: `t${i + 1}`, label: `步骤${i + 1}` }));
    const hint = todoUiHint({ action: "add", items });
    assert.equal(hint?.count, 5);
    assert.equal(hint?.labels?.length, TODO_HINT_LABEL_LIMIT);
    assert.deepEqual(hint?.labels, ["步骤1", "步骤2", "步骤3"]);
  });

  it("缺 label 时退回 id 作展示文案", () => {
    const hint = todoUiHint({ action: "update", items: [{ id: "t3", status: "done" }] });
    assert.deepEqual(hint?.labels, ["t3"]);
  });

  it("items 缺失时只带动作", () => {
    assert.deepEqual(todoUiHint({ action: "remove" }), { action: "remove" });
  });

  it("动作非法则不给提示（交给通用工具行渲染）", () => {
    assert.equal(todoUiHint({ action: "nope", items: ["x"] }), undefined);
    assert.equal(todoUiHint({}), undefined);
  });
});
