/**
 * 行号区间：解析、越界、带行号切片、按区间替换。
 */
import assert from "node:assert/strict";
import { describe, it } from "vitest";
import {
  assertRangeInFile,
  detectEol,
  formatNumberedSlice,
  joinLines,
  parseLineNumber,
  parseLineRange,
  replaceLineRange,
  splitLines,
} from "../../../src/tools/shared/lines";

describe("detectEol / splitLines / joinLines", () => {
  it("有 CRLF 就用 CRLF，否则用 LF；空串拆成 0 行", () => {
    assert.equal(detectEol("a\r\nb"), "\r\n");
    assert.equal(detectEol("a\nb"), "\n");
    assert.deepEqual(splitLines(""), []);
    assert.deepEqual(splitLines("a\r\nb\rc\n"), ["a", "b", "c", ""]);
    assert.equal(joinLines(["a", "b"], "\r\n"), "a\r\nb");
  });
});

describe("parseLineNumber", () => {
  it("接受 >= 1 的数字或数字字符串，并向下取整", () => {
    assert.equal(parseLineNumber(2), 2);
    assert.equal(parseLineNumber(1.9), 1);
    assert.equal(parseLineNumber(" 3 "), 3);
    assert.equal(parseLineNumber("2.2"), 2);
  });

  it("0、负数、空串、非数字返回 null", () => {
    assert.equal(parseLineNumber(0), null);
    assert.equal(parseLineNumber(-1), null);
    assert.equal(parseLineNumber(""), null);
    assert.equal(parseLineNumber("x"), null);
    assert.equal(parseLineNumber(Number.NaN), null);
    assert.equal(parseLineNumber(null), null);
  });
});

describe("parseLineRange", () => {
  it("都没给表示整文件；只给一边或非法或 start>end 则抛错", () => {
    assert.equal(parseLineRange({}), null);
    assert.equal(parseLineRange({ start_line: null, end_line: "" }), null);
    assert.throws(() => parseLineRange({ start_line: 1 }), /must be provided together/);
    assert.throws(() => parseLineRange({ start_line: 0, end_line: 2 }), /integers >= 1/);
    assert.throws(
      () => parseLineRange({ start_line: 4, end_line: 2 }),
      /start_line \(4\) > end_line \(2\)/,
    );
    assert.deepEqual(parseLineRange({ start_line: "1", end_line: 3 }), { start: 1, end: 3 });
  });
});

describe("assertRangeInFile / formatNumberedSlice / replaceLineRange", () => {
  it("空文件不能用区间；越界带路径与总行数", () => {
    assert.throws(() => assertRangeInFile({ start: 1, end: 1 }, 0, "a.txt"), /empty file: a.txt/);
    assert.throws(
      () => assertRangeInFile({ start: 1, end: 3 }, 2, "a.txt"),
      /1-3 out of bounds for a.txt \(2 lines\)/,
    );
  });

  it("行号按 end 对齐宽度；空 contents 删掉区间", () => {
    const lines = ["a", "b", "c", "d"];
    assert.equal(
      formatNumberedSlice(lines, { start: 2, end: 10 }),
      " 2|b\n 3|c\n 4|d\n 5|\n 6|\n 7|\n 8|\n 9|\n10|",
    );
    assert.deepEqual(replaceLineRange(lines, { start: 2, end: 3 }, ""), ["a", "d"]);
    assert.deepEqual(replaceLineRange(lines, { start: 4, end: 4 }, "x\r\ny"), [
      "a",
      "b",
      "c",
      "x",
      "y",
    ]);
  });
});
