/**
 * docx 解析器：docx 是 zip 容器，喂非 zip 字节必然失败，
 * 关键契约是「内部自管异常，返回 error 而不是抛出」。
 */
import assert from "node:assert/strict";
import { describe, it } from "vitest";
import { docxParser } from "../../src/parsers/docx";
import type { ParseInput } from "../../src/types";

const notAZip: ParseInput = {
  bytes: new TextEncoder().encode("this is definitely not a zip container"),
  mime: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  name: "fake.docx",
};

describe("docx parser", () => {
  it("认领 .docx", () => {
    assert.equal(docxParser.supports("", "docx"), true);
    assert.equal(
      docxParser.supports(
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "bin",
      ),
      true,
    );
    assert.equal(docxParser.supports("", "doc"), false);
  });

  it("id 为 docx 且 priority 高于兜底 text", () => {
    assert.equal(docxParser.id, "docx");
    assert.ok(docxParser.priority > 0);
  });

  it("非 zip 字节返回结构化失败，不抛错", async () => {
    const res = await docxParser.parse(notAZip);
    assert.equal(typeof res.error, "string");
    assert.ok((res.error ?? "").length > 0);
    assert.equal(res.kind, "document");
  });

  it("空字节同样不抛错", async () => {
    const res = await docxParser.parse({ bytes: new Uint8Array(0), name: "empty.docx" });
    assert.equal(typeof res, "object");
  });
});
