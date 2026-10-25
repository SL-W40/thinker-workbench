/**
 * 兜底 text 解析器：UTF-8 解码、MIME / 扩展名认领、非法字节不抛错。
 */
import assert from "node:assert/strict";
import { describe, it } from "vitest";
import { textParser } from "../../src/parsers/text";
import type { ParseInput } from "../../src/types";

const enc = (s: string): ParseInput => ({
  bytes: new TextEncoder().encode(s),
  mime: "text/plain",
  name: "note.txt",
});

describe("text parser", () => {
  it("解码纯文本且不改内容", async () => {
    const res = await textParser.parse(enc("hello world"));
    assert.equal(res.text, "hello world");
    assert.equal(res.kind, "text");
  });

  it("保留换行与中文", async () => {
    const res = await textParser.parse(enc("第一行\n第二行\t中文 ✓"));
    assert.equal(res.text, "第一行\n第二行\t中文 ✓");
  });

  it("认领 text/* 与常见 application/* 半文本 MIME", () => {
    assert.equal(textParser.supports("text/markdown", ""), true);
    assert.equal(textParser.supports("application/json", ""), true);
    assert.equal(textParser.supports("application/xml", ""), true);
    assert.equal(textParser.supports("application/octet-stream", ""), false);
  });

  it("认领常见代码与文本扩展名", () => {
    for (const ext of ["ts", "py", "csv", "md", "yaml", "dockerfile"]) {
      assert.equal(textParser.supports("", ext), true, ext);
    }
    assert.equal(textParser.supports("", "bin"), false);
  });

  it("非法 UTF-8 字节按替换字符解码，不抛错", async () => {
    const input: ParseInput = {
      bytes: new Uint8Array([0x41, 0xff, 0xfe, 0x42]),
      mime: "text/plain",
      name: "broken.txt",
    };
    const res = await textParser.parse(input);
    assert.equal(typeof res.text, "string");
    assert.ok((res.text ?? "").includes("A"));
  });

  it("空字节返回空串而非 undefined", async () => {
    const res = await textParser.parse({ bytes: new Uint8Array(0), name: "empty.txt" });
    assert.equal(res.text, "");
  });

  it("优先级为 0，任何专用 parser 都优先于它", () => {
    assert.equal(textParser.priority, 0);
  });
});
