/**
 * pdf 解析器：即使是损坏字节也要返回结构化结果，不能抛错阻断预览管线。
 */
import assert from "node:assert/strict";
import { describe, it } from "vitest";
import { pdfParser } from "../../src/parsers/pdf";
import type { ParseInput } from "../../src/types";

/** 带 PDF 魔数但内容残缺的字节：足以命中 pdf parser，又必然解析失败。 */
const broken: ParseInput = {
  bytes: new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x34, 0x0a, 0x00, 0xff]),
  mime: "application/pdf",
  name: "broken.pdf",
};

describe("pdf parser", () => {
  it("认领 .pdf 与 application/pdf", () => {
    assert.equal(pdfParser.supports("application/pdf", "scan"), true);
    assert.equal(pdfParser.supports("", "pdf"), true);
    assert.equal(pdfParser.supports("application/msword", "doc"), false);
    assert.equal(pdfParser.supports("", "docx"), false);
  });

  it("id 为 pdf 且 priority 高于兜底 text", () => {
    assert.equal(pdfParser.id, "pdf");
    assert.ok(pdfParser.priority > 0);
  });

  it("损坏字节返回结构化失败，不抛错", async () => {
    const res = await pdfParser.parse(broken);
    assert.equal(typeof res.error, "string");
    assert.ok((res.error ?? "").length > 0);
    assert.equal(res.kind, "document");
  });

  it("空字节同样不抛错", async () => {
    const res = await pdfParser.parse({ bytes: new Uint8Array(0), name: "empty.pdf" });
    assert.equal(typeof res, "object");
  });
});
