/**
 * 文案查找：当前语言、缺键回退英文、占位符。
 */
import assert from "node:assert/strict";
import { describe, it } from "vitest";
import { getCatalog, type MessageKey, translate } from "../../../src/ui/i18n/translate";

describe("translate", () => {
  it("中文命中，缺键回英文，再缺就返回 key 本身", () => {
    assert.equal(translate("zh", "workspaces.aliasFolder", { path: "D:/a" }), "目录：D:/a");
    assert.equal(translate("en", "workspaces.aliasFolder", {}), "Folder: {path}");
    assert.equal(translate("zh", "not.a.real.key" as MessageKey), "not.a.real.key");
    assert.equal(getCatalog("zh").brand.name, "Thinker Workbench");
  });
});
