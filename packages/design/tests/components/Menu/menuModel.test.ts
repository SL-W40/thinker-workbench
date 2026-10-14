/**
 * 菜单键盘移动与分组拍平。
 */
import assert from "node:assert/strict";
import { describe, it } from "vitest";
import { flattenMenuGroups } from "../../../src/components/Menu/flatten";
import { nextEnabledIndex } from "../../../src/components/Menu/nav";

describe("nextEnabledIndex", () => {
  const items = [{}, { disabled: true }, {}];

  it("skips disabled items and wraps", () => {
    assert.equal(nextEnabledIndex(items, 0, 1), 2);
    assert.equal(nextEnabledIndex(items, 2, 1), 0);
    assert.equal(nextEnabledIndex(items, 2, -1), 0);
  });

  it("returns -1 when every item is disabled", () => {
    assert.equal(nextEnabledIndex([{ disabled: true }], 0, 1), -1);
  });
});

describe("flattenMenuGroups", () => {
  it("puts the group label on the first item and separates later groups", () => {
    const flat = flattenMenuGroups([
      { label: "文件", items: [{ label: "重命名" }, { label: "复制" }] },
      { items: [{ label: "删除", separatorBefore: true }] },
    ]);
    assert.equal(flat[0]?.groupLabel, "文件");
    assert.equal(flat[0]?.separatorBefore, false);
    assert.equal(flat[1]?.groupLabel, undefined);
    assert.equal(flat[2]?.separatorBefore, true);
    assert.equal(flat[2]?.label, "删除");
  });

  it("drops empty groups", () => {
    assert.deepEqual(
      flattenMenuGroups([{ label: "空", items: [] }, { items: [{ label: "留下" }] }]),
      [{ label: "留下", separatorBefore: false, groupLabel: undefined }],
    );
  });
});
