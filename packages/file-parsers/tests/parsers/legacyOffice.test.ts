/**
 * legacyOffice 解析器（doc / xls / ppt 等老式二进制格式）。
 * 这些格式本地不一定有可用转换器，因此「优雅降级」契约比成功路径更重要：
 * 必须返回 error 说明，而不是把异常抛给上层。
 */
import assert from "node:assert/strict";
import { describe, it } from "vitest";
import { legacyOfficeParser } from "../../src/parsers/legacyOffice";
import type { ParseInput } from "../../src/types";

const junk: ParseInput = {
  bytes: new Uint8Array([0xff, 0xd8, 0xff, 0x00, 0x11]),
  mime: "application/vnd.ms-excel",
  name: "junk.xls",
};

describe("legacyOffice parser", () => {
  it("认领老式扩展名", () => {
    assert.equal(legacyOfficeParser.supports("", "xls"), true);
    assert.equal(legacyOfficeParser.supports("", "doc"), true);
    assert.equal(legacyOfficeParser.supports("", "xlsx"), false);
  });

  it("id 为 legacyOffice 且 priority 高于兜底 text", () => {
    assert.equal(legacyOfficeParser.id, "legacyOffice");
    assert.ok(legacyOfficeParser.priority > 0);
  });

  it("垃圾字节返回结构化失败，不抛错", async () => {
    const res = await legacyOfficeParser.parse(junk);
    assert.equal(typeof res.error, "string");
    assert.ok((res.error ?? "").length > 0);
    assert.equal(res.kind, "document");
  });

  it("空字节同样不抛错", async () => {
    const res = await legacyOfficeParser.parse({ bytes: new Uint8Array(0), name: "empty.doc" });
    assert.equal(typeof res, "object");
  });
});
