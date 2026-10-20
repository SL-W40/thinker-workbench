/**
 * 解析层注册表与内置 parser 分发测试。
 */
import assert from "node:assert/strict";
import { describe, it } from "vitest";
import { getFileParser, parseFile, registerFileParser } from "../src/index";
import type { FileParser, ParseInput } from "../src/types";

describe("file-parsers 注册表分发", () => {
  it("按扩展名命中内置 parser", () => {
    assert.equal(getFileParser("", "a.pdf")?.id, "pdf");
    assert.equal(getFileParser("", "a.docx")?.id, "docx");
    assert.equal(getFileParser("", "a.xlsx")?.id, "xlsx");
    assert.equal(getFileParser("", "a.xls")?.id, "legacyOffice");
  });

  it("按 MIME 命中（无扩展名）", () => {
    assert.equal(getFileParser("application/pdf", "scan")?.id, "pdf");
    assert.equal(getFileParser("text/plain", "readme")?.id, "text");
  });

  it("text/* 与代码扩展名走兜底 text parser", () => {
    assert.equal(getFileParser("text/markdown", "x.md")?.id, "text");
    assert.equal(getFileParser("", "x.ts")?.id, "text");
    assert.equal(getFileParser("", "x.py")?.id, "text");
  });

  it("未识别格式返回 null", () => {
    assert.equal(getFileParser("application/octet-stream", "blob.zzz"), null);
  });

  it("priority 高者优先：自定义高优先级覆盖 pdf", () => {
    const custom: FileParser = {
      id: "custom",
      label: "自定义",
      priority: 200,
      supports: (mime, ext) => ext === "pdf" || mime === "application/pdf",
      parse: async () => ({ text: "custom", kind: "document" }),
    };
    registerFileParser(custom);
    assert.equal(getFileParser("", "a.pdf")?.id, "custom");
  });

  it("parseFile 直接抽取纯文本", async () => {
    const input: ParseInput = {
      bytes: new TextEncoder().encode("hello world"),
      mime: "text/plain",
      name: "note.txt",
    };
    const res = await parseFile(input);
    assert.equal(res.kind, "text");
    assert.equal(res.text, "hello world");
  });

  it("未命中 parser 返回 other，不抛错", async () => {
    const res = await parseFile({ bytes: new Uint8Array([0, 1, 2]), name: "x.zzz" });
    assert.equal(res.kind, "other");
  });
});
