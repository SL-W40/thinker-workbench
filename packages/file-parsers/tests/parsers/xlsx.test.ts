/**
 * xlsx 解析器：同样是 zip 容器，这里覆盖 naming 与「坏输入不抛错」契约，
 * 真实 xlsx 内容的解析由集成侧保证。
 */
import assert from "node:assert/strict";
import { describe, it } from "vitest";
import { xlsxParser } from "../../src/parsers/xlsx";
import type { ParseInput } from "../../src/types";

const notAZip: ParseInput = {
  bytes: new Uint8Array([0x00, 0x01, 0x02, 0x03]),
  mime: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  name: "fake.xlsx",
};

describe("xlsx parser", () => {
  it("认领 .xlsx", () => {
    assert.equal(xlsxParser.supports("", "xlsx"), true);
    assert.equal(xlsxParser.supports("", "xls"), false);
  });

  it("id 为 xlsx 且 priority 高于兜底 text", () => {
    assert.equal(xlsxParser.id, "xlsx");
    assert.ok(xlsxParser.priority > 0);
  });

  it("非 zip 字节返回结构化失败，不抛错", async () => {
    const res = await xlsxParser.parse(notAZip);
    assert.equal(typeof res.error, "string");
    assert.ok((res.error ?? "").length > 0);
    assert.equal(res.kind, "document");
  });

  it("空字节同样不抛错", async () => {
    const res = await xlsxParser.parse({ bytes: new Uint8Array(0), name: "empty.xlsx" });
    assert.equal(typeof res, "object");
  });
});
